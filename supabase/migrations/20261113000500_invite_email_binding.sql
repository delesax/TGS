-- Sprint 7 batch 2a (W10): an invite may be bound to one email address.
--
-- Decided by the owner on 13 November: optional per invite. When
-- invites.invited_email is set, only an account with that email address can use
-- the code (compared in lower case). When it is null, nothing changes: the code
-- works for any address, as before. handle_new_user() is replaced with the
-- version from 20261107000100 plus one check; every other rule in it is
-- unchanged. The sign-up kill switch is a separate trigger on auth.users
-- (20261113000100) and is untouched.
--
-- Backward compatible with the code on main: the column is nullable, the old
-- invite_is_usable(text) is unchanged (the deployed sign-up form keeps working,
-- and the database refuses a mismatched address with INVITE_EMAIL_MISMATCH,
-- which the old form shows as its generic invite message). invite_check() is new
-- and lets the new sign-up form give the clear message first.

alter table public.invites
  add column invited_email text
    check (invited_email is null or (invited_email = lower(invited_email) and char_length(invited_email) between 3 and 320));

comment on column public.invites.invited_email is 'Optional. When set, only this email address (lower case) can sign up with the code.';

-- 'ok', 'invalid' (not found, revoked, expired or used up) or 'email_mismatch'.
create or replace function public.invite_check(p_code text, p_email text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  i public.invites%rowtype;
begin
  select * into i from public.invites where code = upper(trim(coalesce(p_code, '')));
  if not found
     or i.revoked_at is not null
     or (i.expires_at is not null and i.expires_at <= now())
     or i.use_count + public.invite_reserved_count(i.id) >= i.max_uses then
    return 'invalid';
  end if;
  if i.invited_email is not null and lower(btrim(coalesce(p_email, ''))) <> i.invited_email then
    return 'email_mismatch';
  end if;
  return 'ok';
end;
$$;

revoke execute on function public.invite_check(text, text) from public, anon, authenticated;
grant execute on function public.invite_check(text, text) to service_role;

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

  -- New: an invite bound to an email address only works for that address.
  if v_invite.invited_email is not null and lower(btrim(coalesce(new.email, ''))) <> v_invite.invited_email then
    raise exception 'INVITE_EMAIL_MISMATCH: this invite is for a different email address';
  end if;

  if coalesce((new.raw_user_meta_data ->> 'age_confirmed')::boolean, false) is not true
     or coalesce((new.raw_user_meta_data ->> 'terms_accepted')::boolean, false) is not true then
    raise exception 'CONSENT_REQUIRED: age and terms must be confirmed';
  end if;

  if coalesce((new.raw_user_meta_data ->> 'public_acknowledged')::boolean, false) is not true then
    raise exception 'CONSENT_REQUIRED: the public-record acknowledgement is required';
  end if;

  if v_confirmed then
    update public.invites set use_count = use_count + 1 where id = v_invite.id;
  end if;

  insert into public.profiles (
    id, invite_id, age_confirmed_at, terms_accepted_at, invite_consumed_at,
    terms_version, privacy_version, public_acknowledged_at
  )
  values (
    new.id, v_invite.id, now(), now(), case when v_confirmed then now() end,
    left(nullif(trim(new.raw_user_meta_data ->> 'terms_version'), ''), 40),
    left(nullif(trim(new.raw_user_meta_data ->> 'privacy_version'), ''), 40),
    now()
  );

  return new;
end;
$$;
