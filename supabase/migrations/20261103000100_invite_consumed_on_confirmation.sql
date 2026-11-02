-- Sprint 3 carry-over: an invite is used up when the email is CONFIRMED, not at sign-up.
--
-- Before: handle_new_user() added one to invites.use_count at sign-up, so a
-- person who never clicked the confirmation link still spent the invite.
--
-- Now:
--   * At sign-up the invite is RESERVED for 24 hours. A reservation counts
--     towards max_uses, so two people cannot race for the last place.
--   * When the email is confirmed, the reservation is turned into a use
--     (use_count + 1, profiles.invite_consumed_at set, audit 'invite.consumed').
--   * An unconfirmed sign-up older than 24 hours no longer holds a place, so the
--     invite becomes usable again. If that person confirms later and the invite
--     has filled up (or been revoked) in the meantime, confirmation is refused.
--   * Accounts created already confirmed (for example by an admin script) use
--     the invite straight away.
-- 24 hours is longer than the confirmation link lasts (otp_expiry, 1 hour by default).

alter table public.profiles
  add column invite_consumed_at timestamptz;

comment on column public.profiles.invite_consumed_at is
  'When this account''s invite was used up: at email confirmation. Null while the sign-up is only a reservation.';

-- Every existing account was already counted in use_count by the old trigger.
update public.profiles set invite_consumed_at = created_at where invite_id is not null;

-- Places held by unconfirmed sign-ups from the last 24 hours.
create or replace function public.invite_reserved_count(p_invite_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.invite_id = p_invite_id
    and p.invite_consumed_at is null
    and u.email_confirmed_at is null
    and p.created_at > now() - interval '24 hours';
$$;

revoke execute on function public.invite_reserved_count(uuid) from public, anon, authenticated;

-- Used by the sign-up form (service role) to give a clear message before the trigger runs.
create or replace function public.invite_is_usable(p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.invites i
    where i.code = upper(trim(p_code))
      and i.revoked_at is null
      and (i.expires_at is null or i.expires_at > now())
      and i.use_count + public.invite_reserved_count(i.id) < i.max_uses
  );
$$;

revoke execute on function public.invite_is_usable(text) from public, anon, authenticated;
grant execute on function public.invite_is_usable(text) to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  v_invite public.invites%rowtype;
  v_confirmed boolean := new.email_confirmed_at is not null;
begin
  if v_code = '' then
    raise exception 'INVITE_REQUIRED: an invite code is required to create an account';
  end if;

  -- Locking the invite row serialises sign-ups on the same code.
  select * into v_invite from public.invites where code = v_code for update;

  if not found
     or v_invite.revoked_at is not null
     or (v_invite.expires_at is not null and v_invite.expires_at <= now())
     or v_invite.use_count + public.invite_reserved_count(v_invite.id) >= v_invite.max_uses then
    raise exception 'INVITE_INVALID: the invite code is not valid';
  end if;

  if coalesce((new.raw_user_meta_data ->> 'age_confirmed')::boolean, false) is not true
     or coalesce((new.raw_user_meta_data ->> 'terms_accepted')::boolean, false) is not true then
    raise exception 'CONSENT_REQUIRED: age and terms must be confirmed';
  end if;

  if v_confirmed then
    update public.invites set use_count = use_count + 1 where id = v_invite.id;
  end if;

  insert into public.profiles (id, invite_id, age_confirmed_at, terms_accepted_at, invite_consumed_at)
  values (new.id, v_invite.id, now(), now(), case when v_confirmed then now() end);

  return new;
end;
$$;

-- Turns the reservation into a use when the email is confirmed.
create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_invite public.invites%rowtype;
begin
  select * into v_profile from public.profiles where id = new.id;
  if not found or v_profile.invite_id is null or v_profile.invite_consumed_at is not null then
    return new;
  end if;

  select * into v_invite from public.invites where id = v_profile.invite_id for update;

  -- A reservation older than 24 hours no longer holds a place: the invite must
  -- still have room. A recent reservation is already counted, so it always fits.
  if v_invite.revoked_at is not null
     or (v_profile.created_at <= now() - interval '24 hours'
         and v_invite.use_count + public.invite_reserved_count(v_invite.id) >= v_invite.max_uses)
     or v_invite.use_count >= v_invite.max_uses then
    raise exception 'INVITE_INVALID: the invite was used up before this email was confirmed';
  end if;

  update public.invites set use_count = use_count + 1 where id = v_invite.id;
  update public.profiles set invite_consumed_at = now() where id = new.id;

  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (new.id, 'invite.consumed', 'invites', v_invite.id::text, jsonb_build_object('profile_id', new.id));

  return new;
end;
$$;

revoke execute on function public.handle_user_confirmed() from public, anon, authenticated;

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();
