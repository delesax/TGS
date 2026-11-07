-- Legal hardening, Part 4D: account deletion must remove every copy of a
-- person's handle, not only the profile row.
--
-- anonymise_profile() (last redefined in 20261104000300) is replaced. It does
-- everything it did before, plus:
--   * consent: positions are archived anonymously only for people who consented
--     (rows from before consent existed are just deleted); the consent is cleared.
--   * the handle, written out in free text, is replaced with "a deleted
--     Strategist" in the places that copy it:
--       - awards.rationale (Verdict and award rationales)
--       - ai_decisions.reason and override_reason
--       - moderation_flags.resolution_reason, and details.handle on EVERY flag
--         about the person (before: only open handle flags)
--       - dispatch_appeals.decision_reason and dispatch_reports.details
--         (other people's words about this person's Dispatches)
--       - email_outbox payloads in OTHER people's queues (reply digests carry
--         the replier's handle and an excerpt)
--     Matching is whole-handle and case-insensitive, with or without "@".
--   * Not touched on purpose: Dispatch text (it stays in the debate record, as
--     the delete page says), and audit_log (append-only by design).
-- display_name is not matched in free text: names are short and common, so
-- replacing them in other people's words would damage the record.

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
  scrubbed integer := 0;
  n integer;
  pattern text;
  replacement constant text := 'a deleted Strategist';
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

  -- Positions on closed Campaigns keep their numbers with no link to a person,
  -- but only for people who consented. Everything else is deleted.
  if prof.positions_consent_at is not null then
    insert into public.anonymous_positions (campaign_id, before_position, after_position, before_at, after_at)
    select cp.campaign_id, cp.before_position, cp.after_position, cp.before_at, cp.after_at
    from public.campaign_positions cp join public.campaigns c on c.id = cp.campaign_id
    where cp.user_id = p_user_id and (c.status = 'closed' or c.ends_at <= now());
    get diagnostics archived_positions = row_count;
  else
    archived_positions := 0;
  end if;
  delete from public.campaign_positions where user_id = p_user_id;
  get diagnostics removed_positions = row_count;
  removed_positions := removed_positions - archived_positions;

  -- Handle and profile wording held in AI records are personal data too.
  update public.ai_decisions set subject_id = 'deleted', output = '{}'::jsonb
  where user_id = p_user_id and subject_type in ('handle', 'display_name', 'bio');
  update public.moderation_flags set details = details - 'handle'
  where user_id = p_user_id and details ? 'handle';
  update public.moderation_flags set status = 'resolved', resolution = 'dismissed',
    resolution_reason = 'Account deleted', resolved_at = now()
  where user_id = p_user_id and kind = 'held_handle' and status = 'open';

  -- The handle written out in free text elsewhere.
  if prof.handle is not null then
    pattern := '(?<![A-Za-z0-9_])@?' || prof.handle || '(?![A-Za-z0-9_])';

    update public.awards set rationale = regexp_replace(rationale, pattern, replacement, 'gi') where rationale ~* pattern;
    get diagnostics n = row_count; scrubbed := scrubbed + n;

    update public.ai_decisions
    set reason = regexp_replace(reason, pattern, replacement, 'gi'),
        override_reason = regexp_replace(override_reason, pattern, replacement, 'gi')
    where reason ~* pattern or override_reason ~* pattern;
    get diagnostics n = row_count; scrubbed := scrubbed + n;

    update public.moderation_flags set resolution_reason = regexp_replace(resolution_reason, pattern, replacement, 'gi')
    where resolution_reason ~* pattern;
    get diagnostics n = row_count; scrubbed := scrubbed + n;

    update public.dispatch_appeals set decision_reason = regexp_replace(decision_reason, pattern, replacement, 'gi')
    where decision_reason ~* pattern;
    get diagnostics n = row_count; scrubbed := scrubbed + n;

    update public.dispatch_reports set details = regexp_replace(details, pattern, replacement, 'gi')
    where details ~* pattern;
    get diagnostics n = row_count; scrubbed := scrubbed + n;

    -- Other people's queued and sent reply emails carry this person's handle.
    update public.email_outbox
    set payload = jsonb_set(payload, '{replier_handle}', to_jsonb(replacement))
    where kind = 'reply'
      and lower(payload ->> 'replier_handle') = lower(prof.handle);
    get diagnostics n = row_count; scrubbed := scrubbed + n;
  end if;

  update public.profiles set
    handle = null, display_name = null, expertise_tag = null, bio = null, handle_set_at = null, invite_id = null,
    posting_muted_at = null, posting_muted_reason = null, posting_muted_by = null,
    positions_consent_at = null, positions_consent_version = null,
    deleted_at = now()
  where id = p_user_id;

  select count(*) into kept_dispatches from public.dispatches where author_id = p_user_id;
  summary := jsonb_build_object('found', true, 'via', p_via, 'kept_dispatches', kept_dispatches,
                                'removed_positions', removed_positions, 'archived_positions', archived_positions,
                                'text_copies_scrubbed', scrubbed);
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (p_user_id, 'account.deleted', 'profiles', p_user_id::text, summary);
  return summary;
end;
$$;

revoke execute on function public.anonymise_profile(uuid, text) from public, anon, authenticated;
grant execute on function public.anonymise_profile(uuid, text) to service_role;
