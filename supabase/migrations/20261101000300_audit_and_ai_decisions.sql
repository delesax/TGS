-- Sprint 1: audit log and AI decision records.
-- audit_log is append-only for everyone, including the service role.
-- ai_decisions stores every AI decision with its model, prompt version, output and a
-- human-readable reason, so an admin can review and override it (CLAUDE.md rule 6).

create table public.audit_log (
  id bigint generated always as identity primary key,
  -- No foreign key: an "on delete set null" would be an UPDATE, which the
  -- append-only trigger forbids. The id stays as a record of who acted.
  actor_id uuid,
  action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  target_table text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index audit_log_target_idx on public.audit_log (target_table, target_id);

alter table public.audit_log enable row level security;

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create policy "Admins can read the audit log"
  on public.audit_log for select to authenticated
  using (public.is_admin());

-- No insert policy for browser roles: entries are written by the server or by
-- security definer functions.

create or replace function public.audit_log_is_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'AUDIT_LOG_APPEND_ONLY: audit_log rows cannot be changed or removed';
end;
$$;

create trigger audit_log_no_update
  before update or delete on public.audit_log
  for each row execute function public.audit_log_is_append_only();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_is_append_only();

-- Record account creation from the sign-up trigger.
create or replace function public.audit_profile_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (new.id, 'account.created', 'profiles', new.id::text,
          jsonb_build_object('invite_id', new.invite_id));
  return new;
end;
$$;

revoke execute on function public.audit_profile_created() from public, anon, authenticated;

create trigger profiles_audit_created
  after insert on public.profiles
  for each row execute function public.audit_profile_created();

-- ---------------------------------------------------------------------------
-- AI decisions
-- ---------------------------------------------------------------------------

create type public.ai_decision_outcome as enum ('allow', 'hold', 'block');

create table public.ai_decisions (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('handle', 'dispatch')),
  subject_id text not null,
  user_id uuid references auth.users (id) on delete set null,
  model text not null,
  prompt_version text not null,
  outcome public.ai_decision_outcome not null,
  reason text not null,
  output jsonb not null default '{}'::jsonb,
  overridden_by uuid references auth.users (id) on delete set null,
  overridden_at timestamptz,
  override_outcome public.ai_decision_outcome,
  override_reason text,
  created_at timestamptz not null default now(),
  constraint ai_decisions_override_complete check (
    (overridden_at is null and overridden_by is null and override_outcome is null and override_reason is null)
    or (overridden_at is not null and override_outcome is not null and override_reason is not null)
  )
);

create index ai_decisions_subject_idx on public.ai_decisions (subject_type, subject_id);
create index ai_decisions_user_idx on public.ai_decisions (user_id, created_at desc);

alter table public.ai_decisions enable row level security;

revoke all on public.ai_decisions from anon, authenticated;
grant select on public.ai_decisions to authenticated;
grant update (overridden_by, overridden_at, override_outcome, override_reason)
  on public.ai_decisions to authenticated;

create policy "Admins can read AI decisions"
  on public.ai_decisions for select to authenticated
  using (public.is_admin());

create policy "Admins can override AI decisions"
  on public.ai_decisions for update to authenticated
  using (public.is_admin())
  with check (public.is_admin() and overridden_by = (select auth.uid()));
