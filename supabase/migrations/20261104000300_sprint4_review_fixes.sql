-- Sprint 4 review fixes. The two earlier Sprint 4 migrations are already applied
-- to hosted and are not edited; everything here is new.
--
--   1. community_settings: the AI and account-deletion columns are no longer
--      readable by browsers (signed out or signed in). Every earlier column stays
--      readable. Admins read the whole row through admin_community_settings();
--      the server reads it with the service role.
--   2. Tombstones can never get a handle again (trigger on profiles).
--   3. anonymise_profile() also deletes the account's coach and nudge records.
--   4. ai_reserve_call(): nudges and coaching stop at 80% of the daily cap, so
--      they can never use up the calls that screening needs.
--   5. judging_weights: everything is public except created_by.
--   6. queue_moderation_email(): its comment now says what really makes
--      repeated decisions harmless.
-- Nothing is dropped. No table or row is removed.

-- ---------------------------------------------------------------------------
-- 1. community_settings: Sprint 4 columns are not readable by browsers
-- ---------------------------------------------------------------------------

-- A column-level REVOKE does nothing while a table-level SELECT grant exists, so
-- the table-level grant is removed and the earlier columns are granted one by one.
-- UPDATE grants (admins, through row-level security) are untouched.
revoke select on public.community_settings from anon, authenticated;

grant select (
  id, argument_max_chars, rebuttal_max_chars, evidence_max_chars, max_dispatches_per_round,
  cooldown_seconds, edit_window_seconds, email_daily_cap, reply_digest_minutes, updated_at
) on public.community_settings to anon, authenticated;

-- The whole row for the admin console. Browsers cannot select the Sprint 4
-- columns directly, so the admin pages go through here; the role claim is
-- checked inside, not just by the page.
create or replace function public.admin_community_settings()
returns setof public.community_settings
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can read these settings' using errcode = '42501';
  end if;
  return query select * from public.community_settings;
end;
$$;

revoke execute on function public.admin_community_settings() from public, anon;
grant execute on function public.admin_community_settings() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A deleted account (tombstone) can never get a handle
-- ---------------------------------------------------------------------------

create or replace function public.profiles_block_tombstone_handle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null and new.handle is not null then
    raise exception 'ACCOUNT_DELETED: a deleted account cannot have a handle' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.profiles_block_tombstone_handle() from public, anon, authenticated;

create trigger profiles_no_handle_on_tombstone
  before insert or update of handle, deleted_at on public.profiles
  for each row execute function public.profiles_block_tombstone_handle();

-- ---------------------------------------------------------------------------
-- 3. anonymise_profile(): also delete coach and nudge records
-- ---------------------------------------------------------------------------

-- Same as migration 20261104000200, plus one statement: the account's coach and
-- nudge decisions (the feedback itself) are deleted. Screening decisions about
-- Dispatches stay, because the Dispatches stay.
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
  delete from public.ai_decisions where user_id = p_user_id and subject_type in ('coach', 'nudge');

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

-- ---------------------------------------------------------------------------
-- 4. ai_reserve_call(): nudges and coaching stop at 80% of the daily cap
-- ---------------------------------------------------------------------------

-- Same as migration 20261104000100, plus one rule: nudge and coach are allowed
-- only while today's total is under 80% of ai_daily_cap_global. Screening keeps
-- the full cap. Whole-number arithmetic (total * 5 >= cap * 4), so no rounding.
create or replace function public.ai_reserve_call(p_feature text, p_user_id uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.community_settings%rowtype;
  today date := public.uk_today();
  who uuid := coalesce(p_user_id, '00000000-0000-0000-0000-000000000000'::uuid);
  total integer;
  mine integer;
begin
  select * into s from public.community_settings;
  if not s.ai_enabled then
    return 'off';
  end if;
  -- One at a time, so two requests cannot both take the last call.
  perform pg_advisory_xact_lock(hashtext('tgs.ai_usage'));
  select coalesce(sum(calls), 0) into total from public.ai_usage where day = today;
  if total >= s.ai_daily_cap_global then
    return 'global_cap';
  end if;
  if p_feature in ('nudge', 'coach') then
    -- The last 20% of the day's calls are kept for screening Dispatches.
    if total * 5 >= s.ai_daily_cap_global * 4 then
      return 'global_cap';
    end if;
    if p_user_id is not null then
      select coalesce(sum(calls), 0) into mine from public.ai_usage where day = today and user_id = who and feature in ('nudge', 'coach');
      if mine >= s.ai_daily_cap_per_strategist then
        return 'user_cap';
      end if;
      if p_feature = 'coach' then
        select coalesce(sum(calls), 0) into mine from public.ai_usage where day = today and user_id = who and feature = 'coach';
        if mine >= s.coach_daily_cap then
          return 'coach_cap';
        end if;
      end if;
    end if;
  end if;
  insert into public.ai_usage (day, feature, user_id, calls) values (today, p_feature, who, 1)
  on conflict (day, feature, user_id) do update set calls = ai_usage.calls + 1;
  return 'ok';
end;
$$;

revoke execute on function public.ai_reserve_call(text, uuid) from public, anon, authenticated;
grant execute on function public.ai_reserve_call(text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. judging_weights: public except created_by
-- ---------------------------------------------------------------------------

-- created_by is the admin's user id. The weights are published with the rubric;
-- who saved them is not. Same reason as above for the table-level revoke.
revoke select on public.judging_weights from anon, authenticated;
grant select (version, panel, peer, ai_rubric, mind_change, note, created_at) on public.judging_weights to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. queue_moderation_email(): correct the comment (the body is unchanged)
-- ---------------------------------------------------------------------------

-- outcome: held, released, kept_held, removed. The payload carries only what the
-- email says. The dedupe key below ends in a microsecond timestamp, so it does
-- NOT dedupe: every call queues an email. A repeated screening result is harmless
-- because apply_dispatch_screening() returns early for a Dispatch that is no
-- longer awaiting screening, so it never reaches this function twice. Each human
-- decision in moderate_dispatch() is a real decision and queues its own email.
create or replace function public.queue_moderation_email(p_dispatch_id uuid, p_outcome text, p_appeal boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.dispatches%rowtype;
  c public.campaigns%rowtype;
begin
  select * into d from public.dispatches where id = p_dispatch_id;
  if not found then
    return;
  end if;
  select * into c from public.campaigns where id = d.campaign_id;
  perform public.enqueue_email(
    d.author_id,
    'moderation_outcome',
    jsonb_build_object('dispatch_id', d.id, 'campaign_slug', c.slug, 'campaign_title', c.title,
                       'outcome', p_outcome, 'appeal', p_appeal),
    'moderation:' || d.id || ':' || p_outcome || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
  );
end;
$$;

revoke execute on function public.queue_moderation_email(uuid, text, boolean) from public, anon, authenticated;
