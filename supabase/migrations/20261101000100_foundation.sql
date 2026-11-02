-- Sprint 1: foundation.
-- Helper functions, invites, profiles and the sign-up trigger that enforces invite-only access.
-- Every table has row-level security enabled. Admin rights come from the JWT app_metadata
-- role claim (settable only with the service role), never from a client-supplied flag.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

comment on function public.is_admin() is
  'True when the caller''s JWT carries app_metadata.role = admin. app_metadata can only be set with the service role.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{8,32}$'),
  note text check (char_length(note) <= 200),
  max_uses integer not null default 1 check (max_uses between 1 and 500),
  use_count integer not null default 0 check (use_count >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint invites_use_count_within_max check (use_count <= max_uses)
);

comment on table public.invites is 'Invite codes. A valid code is required to create an account.';

alter table public.invites enable row level security;

create policy "Admins can read invites"
  on public.invites for select to authenticated
  using (public.is_admin());

create policy "Admins can create invites"
  on public.invites for insert to authenticated
  with check (public.is_admin());

create policy "Admins can update invites"
  on public.invites for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text check (handle ~ '^[A-Za-z][A-Za-z0-9_]{2,19}$'),
  display_name text check (char_length(display_name) between 1 and 60),
  expertise_tag text check (char_length(expertise_tag) between 1 and 40),
  bio text check (char_length(bio) <= 280),
  invite_id uuid references public.invites (id) on delete set null,
  age_confirmed_at timestamptz not null,
  terms_accepted_at timestamptz not null,
  handle_set_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per Strategist. Created by the sign-up trigger; the handle is set later by the server after screening.';

create unique index profiles_handle_lower_key on public.profiles (lower(handle));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- Column privileges: signed-in users may read the public columns and edit only
-- display_name, expertise_tag and bio. The handle is written by the server
-- (service role) after screening, so it cannot be changed from the browser.
revoke all on public.profiles from anon, authenticated;
grant select (id, handle, display_name, expertise_tag, bio, created_at) on public.profiles to authenticated;
grant update (display_name, expertise_tag, bio) on public.profiles to authenticated;

create policy "Signed-in users can read Strategists with a handle, and their own row"
  on public.profiles for select to authenticated
  using (handle is not null or id = (select auth.uid()) or public.is_admin());

create policy "Strategists can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Sign-up trigger: enforce the invite and create the profile row.
-- Runs for every new auth user, so calling the Auth API directly cannot
-- bypass the invite requirement.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  v_invite public.invites%rowtype;
begin
  if v_code = '' then
    raise exception 'INVITE_REQUIRED: an invite code is required to create an account';
  end if;

  select * into v_invite from public.invites where code = v_code for update;

  if not found
     or v_invite.revoked_at is not null
     or (v_invite.expires_at is not null and v_invite.expires_at <= now())
     or v_invite.use_count >= v_invite.max_uses then
    raise exception 'INVITE_INVALID: the invite code is not valid';
  end if;

  if coalesce((new.raw_user_meta_data ->> 'age_confirmed')::boolean, false) is not true
     or coalesce((new.raw_user_meta_data ->> 'terms_accepted')::boolean, false) is not true then
    raise exception 'CONSENT_REQUIRED: age and terms must be confirmed';
  end if;

  update public.invites set use_count = use_count + 1 where id = v_invite.id;

  insert into public.profiles (id, invite_id, age_confirmed_at, terms_accepted_at)
  values (new.id, v_invite.id, now(), now());

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
