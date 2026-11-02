-- Sprint 4: delete my account (anonymise, never cascade into Dispatches).
--
-- Design (also described in CHANGELOG.md):
--   * The profile row becomes a TOMBSTONE: handle, display name, expertise,
--     bio and mute details are cleared and deleted_at is set. The row keeps
--     its id, so Dispatches and awards still point at it and show as by
--     "a deleted Strategist".
--   * profiles no longer cascades from auth.users. Instead, a trigger runs
--     before an auth user is deleted (from the app or the Supabase dashboard):
--     it anonymises the profile first, then removes the row only if nothing
--     depends on it.
--   * dispatches.author_id and awards.profile_id now RESTRICT instead of
--     CASCADE: deleting a profile can never delete a Dispatch or an award.
--   * Positions: removed for Campaigns still open or scheduled; for closed
--     Campaigns they move to anonymous_positions with no link to anyone
--     (owner decision 8).
--   * Removed outright: passkeys, reactions, follows (both ways), email
--     settings and queued emails, coach feedback ratings. The email address
--     and sign-in go with the auth user.
-- Everything is switched off in the app until community_settings.account_deletion_enabled.

alter table public.profiles add column deleted_at timestamptz;
grant select (deleted_at) on public.profiles to anon, authenticated;

-- Tombstones are readable so a Dispatch can say "a deleted Strategist".
-- They hold no personal data.
alter policy "Anyone can read Strategists with a handle" on public.profiles
  using (handle is not null or deleted_at is not null);
alter policy "Signed-in users can read Strategists with a handle, and their own row" on public.profiles
  using (handle is not null or deleted_at is not null or id = (select auth.uid()) or public.is_admin());

-- Never let a deletion cascade into Dispatches or awards.
alter table public.dispatches drop constraint dispatches_author_id_fkey;
alter table public.dispatches add constraint dispatches_author_id_fkey
  foreign key (author_id) references public.profiles (id) on delete restrict;
alter table public.awards drop constraint awards_profile_id_fkey;
alter table public.awards add constraint awards_profile_id_fkey
  foreign key (profile_id) references public.profiles (id) on delete restrict;

-- The profile outlives its auth user as a tombstone, so it no longer
-- references auth.users. The trigger below takes over the clean-up.
alter table public.profiles drop constraint profiles_id_fkey;

create table public.anonymous_positions (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  before_position public.position_choice,
  after_position public.position_choice,
  before_at timestamptz,
  after_at timestamptz,
  archived_at timestamptz not null default now()
);

comment on table public.anonymous_positions is
  'Positions on closed Campaigns from deleted accounts, linked to nobody. Kept for the mind-change measure (owner decision 8).';

create index anonymous_positions_campaign_idx on public.anonymous_positions (campaign_id);

alter table public.anonymous_positions enable row level security;
revoke all on public.anonymous_positions from anon, authenticated;
grant select on public.anonymous_positions to authenticated;

create policy "Admins read anonymous positions"
  on public.anonymous_positions for select to authenticated
  using (public.is_admin());

-- Service role only (the app's delete-account action, and the trigger below).
-- Returns a summary for the confirmation page and the audit log.
create or replace function public.anonymise_profile(p_user_id uuid, p_via text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prof public.profiles%rowtype;
  kept_dispatches integer;
  removed_positions integer;
  archived_positions integer;
  summary jsonb;
begin
  select * into prof from public.profiles where id = p_user_id for update;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  if prof.deleted_at is not null then
    return jsonb_build_object('found', true, 'already_deleted', true);
  end if;

  delete from public.passkeys where user_id = p_user_id;
  delete from public.webauthn_challenges where user_id = p_user_id;
  delete from public.dispatch_reactions where user_id = p_user_id;
  delete from public.campaign_follows where user_id = p_user_id;
  delete from public.strategist_follows where follower_id = p_user_id or followed_id = p_user_id;
  delete from public.email_outbox where user_id = p_user_id;
  delete from public.notification_preferences where user_id = p_user_id;
  delete from public.coach_feedback where user_id = p_user_id;

  insert into public.anonymous_positions (campaign_id, before_position, after_position, before_at, after_at)
  select cp.campaign_id, cp.before_position, cp.after_position, cp.before_at, cp.after_at
  from public.campaign_positions cp join public.campaigns c on c.id = cp.campaign_id
  where cp.user_id = p_user_id and (c.status = 'closed' or c.ends_at <= now());
  get diagnostics archived_positions = row_count;
  delete from public.campaign_positions where user_id = p_user_id;
  get diagnostics removed_positions = row_count;
  removed_positions := removed_positions - archived_positions;

  -- Handle and profile wording held in AI records are personal data too.
  update public.ai_decisions set subject_id = 'deleted', output = '{}'::jsonb
  where user_id = p_user_id and subject_type in ('handle', 'display_name', 'bio');
  update public.moderation_flags set details = details - 'handle', status = 'resolved', resolution = 'dismissed',
    resolution_reason = 'Account deleted', resolved_at = now()
  where user_id = p_user_id and kind = 'held_handle' and status = 'open';

  update public.profiles set
    handle = null, display_name = null, expertise_tag = null, bio = null, handle_set_at = null, invite_id = null,
    posting_muted_at = null, posting_muted_reason = null, posting_muted_by = null, deleted_at = now()
  where id = p_user_id;

  select count(*) into kept_dispatches from public.dispatches where author_id = p_user_id;
  summary := jsonb_build_object('found', true, 'via', p_via, 'kept_dispatches', kept_dispatches,
                                'removed_positions', removed_positions, 'archived_positions', archived_positions);
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (p_user_id, 'account.deleted', 'profiles', p_user_id::text, summary);
  return summary;
end;
$$;

revoke execute on function public.anonymise_profile(uuid, text) from public, anon, authenticated;
grant execute on function public.anonymise_profile(uuid, text) to service_role;

-- Runs before any auth user is deleted, however it happens. Anonymises the
-- profile, then removes it only when no Dispatch or award depends on it.
create or replace function public.before_auth_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.anonymise_profile(old.id, 'auth_user_deleted');
  if not exists (select 1 from public.dispatches where author_id = old.id)
     and not exists (select 1 from public.awards where profile_id = old.id) then
    delete from public.profiles where id = old.id;
  end if;
  return old;
end;
$$;

revoke execute on function public.before_auth_user_deleted() from public, anon, authenticated;

create trigger before_auth_user_deleted
  before delete on auth.users
  for each row execute function public.before_auth_user_deleted();
