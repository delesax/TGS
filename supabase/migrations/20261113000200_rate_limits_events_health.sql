-- Sprint 7 (W2 and W6): a small Postgres-backed rate limiter, a persisted event
-- log, and an admin-only health read.
--
--   * rate_limits: counters per (bucket, subject, window). The subject is a
--     user id or a SHA-256 hash of an IP address or email address, never the raw
--     value. Windows older than two days are deleted every night.
--   * system_events: our own record of things worth looking at after an
--     incident (processor failures, rate-limit trips). Vercel's free plan keeps
--     only about an hour of logs. Rows hold a kind, a short code and counts: no
--     names, addresses, IPs or text. Deleted after 30 days.
--   * admin_health(): queue sizes and ages, today's AI use against the cap, and
--     the last run of every scheduled job. Admin only.
-- Everything is deny-all to browser roles; the server uses the service role.

create table public.rate_limits (
  bucket text not null check (char_length(bucket) between 1 and 60),
  subject text not null check (char_length(subject) between 1 and 80),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, subject, window_start)
);

create index rate_limits_window_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
comment on table public.rate_limits is 'Rate-limit counters. Subjects are user ids or hashes. Deny-all to browser roles. Pruned after two days.';

-- true = allowed, false = over the limit. Fixed windows of p_window_seconds.
create or replace function public.rate_limit_hit(p_bucket text, p_subject text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  w timestamptz;
  n integer;
begin
  if p_max is null or p_max < 1 or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'BAD_INPUT: bad rate limit settings' using errcode = '22023';
  end if;
  w := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits as r (bucket, subject, window_start, hits)
  values (p_bucket, p_subject, w, 1)
  on conflict (bucket, subject, window_start) do update set hits = r.hits + 1
  returning r.hits into n;
  return n <= p_max;
end;
$$;

revoke execute on function public.rate_limit_hit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, integer, integer) to service_role;

create table public.system_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind ~ '^[a-z_]{2,40}$'),
  code text check (char_length(code) <= 60),
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) < 2000)
);

create index system_events_created_idx on public.system_events (created_at desc);

alter table public.system_events enable row level security;
revoke all on public.system_events from anon, authenticated;
comment on table public.system_events is 'Our own incident record: kind, short code, counts. No personal data. Deny-all to browser roles. Pruned after 30 days.';

create or replace function public.log_system_event(p_kind text, p_code text, p_detail jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.system_events (kind, code, detail) values (p_kind, left(p_code, 60), coalesce(p_detail, '{}'::jsonb));
$$;

revoke execute on function public.log_system_event(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.log_system_event(text, text, jsonb) to service_role;

create or replace function public.admin_recent_events(p_limit integer default 100)
returns setof public.system_events
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can read the event log' using errcode = '42501';
  end if;
  return query select * from public.system_events order by created_at desc, id desc limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke execute on function public.admin_recent_events(integer) from public, anon;
grant execute on function public.admin_recent_events(integer) to authenticated;

-- Nightly clean-up.
create or replace function public.prune_limits_and_events()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a integer;
  b integer;
begin
  delete from public.rate_limits where window_start < now() - interval '2 days';
  get diagnostics a = row_count;
  delete from public.system_events where created_at < now() - interval '30 days';
  get diagnostics b = row_count;
  return jsonb_build_object('rate_limits', a, 'system_events', b);
end;
$$;

revoke execute on function public.prune_limits_and_events() from public, anon, authenticated;
grant execute on function public.prune_limits_and_events() to service_role;

select cron.schedule('housekeeping-limits-events', '41 3 * * *', 'select public.prune_limits_and_events()');

-- Admin-only health read: queue sizes and ages, AI use today, last job runs.
create or replace function public.admin_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  out jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can read the health report' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'checked_at', now(),
    'email_queued', (select count(*) from public.email_outbox where status = 'queued'),
    'email_oldest_queued_seconds', (select extract(epoch from now() - min(created_at))::bigint from public.email_outbox where status = 'queued'),
    'email_failed_24h', (select count(*) from public.email_outbox where status = 'failed' and created_at > now() - interval '24 hours'),
    'rubric_jobs_waiting', (select count(*) from public.ai_rubric_jobs where status in ('queued', 'claimed')),
    'rubric_oldest_seconds', (select extract(epoch from now() - min(created_at))::bigint from public.ai_rubric_jobs where status in ('queued', 'claimed')),
    'moderation_pending', (select count(*) from public.dispatches where moderation_status = 'pending'),
    'moderation_oldest_pending_seconds', (select extract(epoch from now() - min(created_at))::bigint from public.dispatches where moderation_status = 'pending'),
    'ai_calls_today', (select coalesce(sum(calls), 0) from public.ai_usage where day = public.uk_today()),
    'ai_daily_cap', (select ai_daily_cap_global from public.community_settings),
    'ai_enabled', (select ai_enabled from public.community_settings),
    'switches', (select to_jsonb(s) from public.site_switches() s),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object('name', j.jobname, 'schedule', j.schedule, 'active', j.active,
                                         'last_status', d.status, 'last_run', d.start_time) order by j.jobname)
      from cron.job j
      left join lateral (
        select status, start_time from cron.job_run_details r where r.jobid = j.jobid order by start_time desc limit 1
      ) d on true
    ), '[]'::jsonb)
  ) into out;
  return out;
end;
$$;

revoke execute on function public.admin_health() from public, anon;
grant execute on function public.admin_health() to authenticated;
