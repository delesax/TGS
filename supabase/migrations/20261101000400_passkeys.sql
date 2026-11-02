-- Sprint 1: passkeys (WebAuthn).
-- Credentials and challenges are written only by the server (service role) after
-- it verifies the WebAuthn response. Strategists can see and remove their own passkeys.

create table public.passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0 check (counter >= 0),
  transports text[] not null default '{}',
  device_type text,
  backed_up boolean not null default false,
  nickname text check (char_length(nickname) <= 60),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index passkeys_user_idx on public.passkeys (user_id);

alter table public.passkeys enable row level security;

revoke all on public.passkeys from anon, authenticated;
grant select (id, user_id, nickname, device_type, backed_up, created_at, last_used_at)
  on public.passkeys to authenticated;
grant delete on public.passkeys to authenticated;

create policy "Strategists can see their own passkeys"
  on public.passkeys for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Strategists can remove their own passkeys"
  on public.passkeys for delete to authenticated
  using (user_id = (select auth.uid()));

create table public.webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  kind text not null check (kind in ('register', 'login')),
  challenge text not null,
  expires_at timestamptz not null default now() + interval '5 minutes',
  created_at timestamptz not null default now()
);

create index webauthn_challenges_expires_idx on public.webauthn_challenges (expires_at);

-- RLS on with no policies: only the service role can use this table.
alter table public.webauthn_challenges enable row level security;
revoke all on public.webauthn_challenges from anon, authenticated;
