-- Legal hardening, Part 6: retention jobs.
--
-- One SECURITY DEFINER function per kind of data, scheduled daily with pg_cron
-- (not Vercel cron) at quiet times, a few minutes apart, off the hour. All times
-- are UTC (pg_cron's clock): 03:17 UTC is 03:17 UK in winter and 04:17 in summer.
--
-- Every function:
--   * deletes only rows past the approved period;
--   * NEVER deletes a record linked to an open flag, an open appeal or an open
--     privacy request (see the retention_* helpers);
--   * returns how many rows it deleted, and writes ONE audit_log entry per run:
--     action 'retention.purged', details = job name and count only;
--   * can be run only by the service role / postgres.
-- Periods and exclusions are documented in docs/legal/RETENTION.md and checked
-- against the privacy policy by src/lib/retention.test.ts.

-- ---------------------------------------------------------------------------
-- Helpers: what must never be purged
-- ---------------------------------------------------------------------------

-- True while this person has a privacy request or complaint that is not closed
-- (matched by account, or by the email address on their account).
create or replace function public.retention_user_held(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from public.privacy_requests pr
    where pr.status <> 'closed'
      and (pr.user_id = p_user_id
           or lower(pr.email) = (select lower(u.email::text) from auth.users u where u.id = p_user_id))
  );
$$;

-- True while a Dispatch has an open flag, an open appeal, or is still waiting for a person.
create or replace function public.retention_dispatch_held(p_dispatch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_dispatch_id is not null and (
    exists (select 1 from public.moderation_flags f where f.dispatch_id = p_dispatch_id and f.status = 'open')
    or exists (select 1 from public.dispatch_appeals a where a.dispatch_id = p_dispatch_id and a.status = 'open')
    or exists (select 1 from public.dispatches d where d.id = p_dispatch_id and d.moderation_status in ('pending', 'held'))
  );
$$;

revoke execute on function public.retention_user_held(uuid) from public, anon, authenticated;
revoke execute on function public.retention_dispatch_held(uuid) from public, anon, authenticated;

-- The one audit entry per run. Count only: no names, no addresses, no text.
create or replace function public.retention_log(p_job text, p_count integer)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (null, 'retention.purged', null, null, jsonb_build_object('job', p_job, 'count', p_count));
$$;
revoke execute on function public.retention_log(text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Sign-ups never confirmed by email: 30 days
-- ---------------------------------------------------------------------------
-- Deletes the auth user. The before_auth_user_deleted trigger (account deletion)
-- anonymises the profile and removes it when nothing depends on it, which is
-- always so for someone who never confirmed an email (they cannot post). An
-- invite's reservation lasts 24 hours and never counted as a use, so it is
-- already free; nothing on the invite changes.
create or replace function public.purge_unconfirmed_signups()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select u.id
    from auth.users u
    where u.email_confirmed_at is null
      and u.created_at < now() - interval '30 days'
      and not exists (select 1 from public.dispatches d where d.author_id = u.id)
      and not public.retention_user_held(u.id)
  loop
    delete from auth.users where id = r.id;
    n := n + 1;
  end loop;
  perform public.retention_log('retention-unconfirmed-signups', n);
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Decisions about Dispatches and handles: 12 months
-- ---------------------------------------------------------------------------
create or replace function public.purge_ai_decisions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.ai_decisions a
  where a.created_at < now() - interval '12 months'
    and a.subject_type in ('dispatch', 'handle', 'display_name', 'bio')
    and not exists (select 1 from public.moderation_flags f where f.ai_decision_id = a.id and f.status = 'open')
    and not (a.subject_type = 'dispatch' and a.subject_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             and public.retention_dispatch_held(a.subject_id::uuid))
    and not (a.user_id is not null and public.retention_user_held(a.user_id));
  get diagnostics n = row_count;
  perform public.retention_log('retention-ai-decisions', n);
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Reports and moderation flags: 12 months after they are resolved
-- ---------------------------------------------------------------------------
create or replace function public.purge_reports_flags()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_reports integer;
  n_flags integer;
begin
  delete from public.dispatch_reports r
  where r.status <> 'open'
    and r.resolved_at is not null
    and r.resolved_at < now() - interval '12 months'
    and not public.retention_dispatch_held(r.dispatch_id)
    and not public.retention_user_held(r.reporter_id);
  get diagnostics n_reports = row_count;

  delete from public.moderation_flags f
  where f.status = 'resolved'
    and f.resolved_at is not null
    and f.resolved_at < now() - interval '12 months'
    and not public.retention_dispatch_held(f.dispatch_id)
    and not public.retention_user_held(f.user_id);
  get diagnostics n_flags = row_count;

  perform public.retention_log('retention-reports-flags', n_reports + n_flags);
  return n_reports + n_flags;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Coach feedback and ratings: 90 days
-- ---------------------------------------------------------------------------
-- The coach's and tone checker's records live in ai_decisions (subject_type
-- coach or nudge) and coach_feedback hangs off them (deleted with them).
-- Orphans are removed too.
create or replace function public.purge_coach_feedback()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_decisions integer;
  n_feedback integer;
begin
  delete from public.ai_decisions a
  where a.subject_type in ('coach', 'nudge')
    and a.created_at < now() - interval '90 days'
    and not (a.user_id is not null and public.retention_user_held(a.user_id));
  get diagnostics n_decisions = row_count;

  delete from public.coach_feedback c
  where c.created_at < now() - interval '90 days'
    and not public.retention_user_held(c.user_id);
  get diagnostics n_feedback = row_count;

  perform public.retention_log('retention-coach-feedback', n_decisions + n_feedback);
  return n_decisions + n_feedback;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Queued and sent emails: 30 days
-- ---------------------------------------------------------------------------
create or replace function public.purge_emails()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.email_outbox e
  where e.created_at < now() - interval '30 days'
    and e.status <> 'sending'
    and not public.retention_user_held(e.user_id);
  get diagnostics n = row_count;
  perform public.retention_log('retention-emails', n);
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Expired passkey challenges: 1 day after they expire
-- ---------------------------------------------------------------------------
create or replace function public.purge_webauthn_challenges()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.webauthn_challenges w where w.expires_at < now() - interval '1 day';
  get diagnostics n = row_count;
  perform public.retention_log('retention-webauthn-challenges', n);
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Privacy requests and complaints: six years after they are closed
-- ---------------------------------------------------------------------------
create or replace function public.purge_privacy_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.privacy_requests p
  where p.status = 'closed'
    and p.closed_at is not null
    and p.closed_at < now() - interval '6 years';
  get diagnostics n = row_count;
  perform public.retention_log('retention-privacy-requests', n);
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Audit record: six years (the single, deliberate exception to append-only)
-- ---------------------------------------------------------------------------
-- audit_log is append-only: an UPDATE or DELETE raises. This replaces the
-- trigger function with one that allows exactly one thing: a DELETE of a row
-- older than six years, inside a transaction where purge_expired_audit_log()
-- has set a flag holding that transaction's own id. The flag cannot be set from
-- the browser (no exposed function sets it), is transaction-local, is cleared
-- by the function straight after the delete, and even if forged could only
-- remove rows already past six years. UPDATE and TRUNCATE are never allowed.
create or replace function public.audit_log_is_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('tgs.audit_purge', true) = txid_current()::text
     and old.created_at < now() - interval '6 years' then
    return old;
  end if;
  raise exception 'AUDIT_LOG_APPEND_ONLY: audit_log rows cannot be changed or removed';
end;
$$;

create or replace function public.purge_expired_audit_log()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform set_config('tgs.audit_purge', txid_current()::text, true);
  delete from public.audit_log l
  where l.created_at < now() - interval '6 years'
    -- Never a record that points at something still open.
    and not exists (select 1 from public.privacy_requests p where p.status <> 'closed' and l.target_id = p.id::text)
    and not exists (select 1 from public.moderation_flags f where f.status = 'open' and (l.target_id = f.id::text or l.target_id = f.dispatch_id::text))
    and not exists (select 1 from public.dispatch_appeals a where a.status = 'open' and (l.target_id = a.id::text or l.target_id = a.dispatch_id::text))
    and not (l.actor_id is not null and public.retention_user_held(l.actor_id))
    and not (l.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and public.retention_user_held(l.target_id::uuid));
  get diagnostics n = row_count;
  -- Close the door again before anything else runs in this transaction.
  perform set_config('tgs.audit_purge', '', true);
  perform public.retention_log('retention-audit-log', n);
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may run them: the service role and postgres only
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'purge_unconfirmed_signups', 'purge_ai_decisions', 'purge_reports_flags', 'purge_coach_feedback',
    'purge_emails', 'purge_webauthn_challenges', 'purge_privacy_requests', 'purge_expired_audit_log'
  ] loop
    execute format('revoke execute on function public.%I() from public, anon, authenticated', f);
    execute format('grant execute on function public.%I() to service_role', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Schedules: daily, off the hour, a couple of minutes apart (UTC)
-- ---------------------------------------------------------------------------
select cron.schedule('retention-unconfirmed-signups', '17 3 * * *', 'select public.purge_unconfirmed_signups()');
select cron.schedule('retention-ai-decisions', '19 3 * * *', 'select public.purge_ai_decisions()');
select cron.schedule('retention-reports-flags', '21 3 * * *', 'select public.purge_reports_flags()');
select cron.schedule('retention-coach-feedback', '23 3 * * *', 'select public.purge_coach_feedback()');
select cron.schedule('retention-emails', '25 3 * * *', 'select public.purge_emails()');
select cron.schedule('retention-webauthn-challenges', '27 3 * * *', 'select public.purge_webauthn_challenges()');
select cron.schedule('retention-privacy-requests', '29 3 * * *', 'select public.purge_privacy_requests()');
select cron.schedule('retention-audit-log', '31 3 * * *', 'select public.purge_expired_audit_log()');
