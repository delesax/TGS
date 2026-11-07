-- Legal hardening, Part 2: three sign-up consents.
--
-- Sign-up now needs three ticks: 18 or over; "my Dispatches are public and stay
-- in the debate record without my name if I delete my account"; terms and
-- privacy policy. The server action passes public_acknowledged = true and the
-- versions of the terms and privacy policy in the auth metadata. This trigger
-- refuses an account without the acknowledgement, so calling the Auth API
-- directly cannot skip it, and records what was agreed and when.
--
-- Existing profiles keep null in the three new columns (they signed up before
-- these consents existed). The columns are NOT in the browser's column grants
-- (see foundation: the grant list is explicit), so only the server and admins
-- through server code can read them. The invite logic below is unchanged from
-- 20261103000100_invite_consumed_on_confirmation.sql.

alter table public.profiles
  add column terms_version text check (char_length(terms_version) <= 40),
  add column privacy_version text check (char_length(privacy_version) <= 40),
  add column public_acknowledged_at timestamptz;

comment on column public.profiles.terms_version is 'Version of the terms of use accepted at sign-up (from src/lib/legal.ts). Null for accounts made before versions were recorded.';
comment on column public.profiles.privacy_version is 'Version of the privacy policy accepted at sign-up. Null for older accounts.';
comment on column public.profiles.public_acknowledged_at is 'When the person acknowledged that Dispatches are public and stay in the debate record without their name after deletion. Null for older accounts.';

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
