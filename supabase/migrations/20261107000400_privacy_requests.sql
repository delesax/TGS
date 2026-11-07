-- Legal hardening, Part 5A: privacy requests and complaints.
--
-- One row per message sent through "Contact us about your data". UK GDPR gives
-- us one month to reply (due_at), and a complaint must be acknowledged within
-- 30 days. The table is deny-all to the browser: the server action (service
-- role) writes it, and admins read and update it only through the three
-- admin-only functions below, which also write the audit log (request id only,
-- never the message).

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null check (type in ('question', 'access', 'correction', 'deletion', 'restriction', 'objection', 'withdraw_consent', 'dispatch_removal', 'complaint')),
  email text not null check (char_length(email) between 3 and 320),
  user_id uuid,
  message text not null check (char_length(message) between 1 and 5000),
  status text not null default 'new' check (status in ('new', 'acknowledged', 'in_progress', 'closed')),
  acknowledged_at timestamptz,
  due_at timestamptz not null default (now() + interval '1 month'),
  closed_at timestamptz,
  outcome_note text check (char_length(outcome_note) <= 5000)
);

comment on table public.privacy_requests is 'Privacy requests and complaints from the contact form. Deny-all to the browser; server and admin functions only.';
comment on column public.privacy_requests.user_id is 'The signed-in account that sent it, if any. No foreign key: a deleted account must not delete the record of how we answered it.';

create index privacy_requests_status_due_idx on public.privacy_requests (status, due_at);
create index privacy_requests_email_idx on public.privacy_requests (lower(email), created_at desc);

alter table public.privacy_requests enable row level security;
revoke all on public.privacy_requests from anon, authenticated;
-- No policies: nobody in the browser can read or write it.

-- Called by the contact form's server action (service role). At most 5 per
-- email address per day, counted in the database.
create or replace function public.create_privacy_request(p_type text, p_email text, p_user_id uuid, p_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id uuid;
begin
  if (select count(*) from public.privacy_requests where lower(email) = v_email and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'RATE_LIMITED: too many requests from this address today' using errcode = '42501';
  end if;
  insert into public.privacy_requests (type, email, user_id, message)
  values (p_type, v_email, p_user_id, p_message)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.create_privacy_request(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.create_privacy_request(text, text, uuid, text) to service_role;

-- Service role: the acknowledgement email went out.
create or replace function public.acknowledge_privacy_request(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.privacy_requests
  set acknowledged_at = coalesce(acknowledged_at, now()),
      status = case when status = 'new' then 'acknowledged' else status end
  where id = p_id;
$$;
revoke execute on function public.acknowledge_privacy_request(uuid) from public, anon, authenticated;
grant execute on function public.acknowledge_privacy_request(uuid) to service_role;

-- Admin list. Newest-due first. The message is included: admins must read it to answer.
create or replace function public.admin_list_privacy_requests(p_status text default null)
returns table (id uuid, created_at timestamptz, type text, email text, user_id uuid, message text, status text, acknowledged_at timestamptz, due_at timestamptz, closed_at timestamptz, outcome_note text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can read privacy requests' using errcode = '42501';
  end if;
  return query
    select r.id, r.created_at, r.type, r.email, r.user_id, r.message, r.status, r.acknowledged_at, r.due_at, r.closed_at, r.outcome_note
    from public.privacy_requests r
    where p_status is null or r.status = p_status
    order by (r.status = 'closed'), r.due_at, r.created_at;
end;
$$;
revoke execute on function public.admin_list_privacy_requests(text) from public, anon;
grant execute on function public.admin_list_privacy_requests(text) to authenticated;

create or replace function public.admin_update_privacy_request(p_id uuid, p_status text, p_outcome_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.privacy_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can change privacy requests' using errcode = '42501';
  end if;
  if p_status not in ('new', 'acknowledged', 'in_progress', 'closed') then
    raise exception 'BAD_STATUS: choose a status' using errcode = '22023';
  end if;
  select * into r from public.privacy_requests where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND: no such request' using errcode = 'P0002';
  end if;
  update public.privacy_requests
  set status = p_status,
      outcome_note = nullif(btrim(coalesce(p_outcome_note, '')), ''),
      acknowledged_at = case when p_status <> 'new' then coalesce(acknowledged_at, now()) else acknowledged_at end,
      closed_at = case when p_status = 'closed' then coalesce(closed_at, now()) else null end
  where id = p_id;
  -- The request id only. Never the message, the email address or the note.
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (uid, 'privacy_request.updated', 'privacy_requests', p_id::text, jsonb_build_object('from', r.status, 'to', p_status));
end;
$$;
revoke execute on function public.admin_update_privacy_request(uuid, text, text) from public, anon;
grant execute on function public.admin_update_privacy_request(uuid, text, text) to authenticated;

-- Admin opening a request is logged too (who read personal data, and when).
create or replace function public.admin_open_privacy_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can read privacy requests' using errcode = '42501';
  end if;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'privacy_request.opened', 'privacy_requests', p_id::text, '{}'::jsonb);
end;
$$;
revoke execute on function public.admin_open_privacy_request(uuid) from public, anon;
grant execute on function public.admin_open_privacy_request(uuid) to authenticated;
