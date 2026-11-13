-- Sprint 7 (W1): kill switches an admin can flip without a deploy.
--
-- Three new switches on the community_settings row, next to the AI switch
-- (ai_enabled) that already exists:
--   * posting_paused: nobody can post a new Dispatch (reading, reacting, voting
--     and editing carry on);
--   * signups_paused: no new account can be created, even through the Auth API;
--   * emails_paused: the email processor sends nothing; emails stay queued and
--     go out when the switch is turned off.
-- The columns are private (no browser role has a column grant, like the AI
-- columns). The public site reads the three booleans through site_switches(),
-- and an admin changes them through set_site_switches(), which needs a reason
-- and writes an audit entry. Additive only: every column defaults to off.

alter table public.community_settings
  add column posting_paused boolean not null default false,
  add column signups_paused boolean not null default false,
  add column emails_paused boolean not null default false,
  add column switches_changed_at timestamptz,
  add column switches_changed_reason text check (char_length(switches_changed_reason) <= 500);

-- What the site shows to everyone (the banner, the sign-up page, the posting form).
create or replace function public.site_switches()
returns table (posting_paused boolean, signups_paused boolean, emails_paused boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.posting_paused, s.signups_paused, s.emails_paused from public.community_settings s;
$$;

revoke execute on function public.site_switches() from public;
grant execute on function public.site_switches() to anon, authenticated, service_role;

-- Admin only. The reason is kept in the audit log.
create or replace function public.set_site_switches(p_posting boolean, p_signups boolean, p_emails boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  before public.community_settings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can change the site switches' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'REASON_REQUIRED: give a reason of up to 500 characters' using errcode = '22023';
  end if;
  if p_posting is null or p_signups is null or p_emails is null then
    raise exception 'BAD_INPUT: say on or off for every switch' using errcode = '22023';
  end if;
  select * into before from public.community_settings;
  update public.community_settings
  set posting_paused = p_posting, signups_paused = p_signups, emails_paused = p_emails,
      switches_changed_at = now(), switches_changed_reason = v_reason
  where id = true;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (uid, 'site.switches_changed', 'community_settings', null,
          jsonb_build_object(
            'posting_paused', jsonb_build_array(before.posting_paused, p_posting),
            'signups_paused', jsonb_build_array(before.signups_paused, p_signups),
            'emails_paused', jsonb_build_array(before.emails_paused, p_emails),
            'reason', v_reason));
end;
$$;

revoke execute on function public.set_site_switches(boolean, boolean, boolean, text) from public, anon;
grant execute on function public.set_site_switches(boolean, boolean, boolean, text) to authenticated;

-- Posting: a new Dispatch is refused while the switch is on. A trigger covers
-- every way of inserting one (post_dispatch() is the only path today).
create or replace function public.refuse_dispatch_when_paused()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select posting_paused from public.community_settings) then
    raise exception 'POSTING_PAUSED: posting is paused for a short while' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.refuse_dispatch_when_paused() from public, anon, authenticated;

create trigger dispatches_refuse_when_paused
  before insert on public.dispatches
  for each row execute function public.refuse_dispatch_when_paused();

-- Sign-ups: a new sign-in is refused while the switch is on, so calling the
-- Auth API directly cannot get round the sign-up page.
create or replace function public.refuse_signup_when_paused()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select signups_paused from public.community_settings) then
    raise exception 'SIGNUPS_PAUSED: new accounts are paused for a short while';
  end if;
  return new;
end;
$$;

revoke execute on function public.refuse_signup_when_paused() from public, anon, authenticated;

create trigger auth_users_refuse_when_paused
  before insert on auth.users
  for each row execute function public.refuse_signup_when_paused();
