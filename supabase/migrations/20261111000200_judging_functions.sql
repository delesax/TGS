-- Sprint 5, part 2: judging rules, as security definer functions.
--
-- Browsers write nothing directly. Each function below checks who is calling
-- (the JWT, never a client flag), the Campaign's state by server time, and the
-- rule it enforces, then writes the audit log (user ids only, never handles).
-- The processor's functions (service role only) queue and store AI rubric
-- scores and draft Verdicts. pg_cron runs judging_tick() and judging_kick().

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- A Dispatch counts for judging when it is visible: not held, removed,
-- hidden or withdrawn.
create or replace function public.judging_dispatch_eligible(p_dispatch public.dispatches)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_dispatch.moderation_status = 'visible' and p_dispatch.withdrawn_at is null and p_dispatch.hidden_at is null;
$$;

-- Closed by server time, whether or not the scheduler has run yet.
create or replace function public.campaign_has_closed(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaigns c
    where c.id = p_campaign_id and (c.status = 'closed' or (c.status = 'open' and now() >= c.ends_at))
  );
$$;

-- A participant posted at least one eligible Dispatch in the Campaign.
create or replace function public.is_campaign_participant(p_campaign_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.dispatches d
    where d.campaign_id = p_campaign_id and d.author_id = p_user_id and public.judging_dispatch_eligible(d)
  );
$$;

-- True while peer voting (and steelman confirmation) is open: from the close
-- until close + peer_window_hours.
create or replace function public.peer_window_open(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.campaign_has_closed(p_campaign_id) and exists (
    select 1 from public.campaigns c, public.judging_settings s
    where c.id = p_campaign_id and now() < c.ends_at + make_interval(hours => s.peer_window_hours)
  );
$$;

-- The live Verdict's status (published, appealed or final), or null.
create or replace function public.live_verdict_status(p_campaign_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select status from public.verdicts where campaign_id = p_campaign_id and status in ('published', 'appealed', 'final');
$$;

grant execute on function public.campaign_has_closed(uuid) to anon, authenticated;
grant execute on function public.peer_window_open(uuid) to anon, authenticated;
revoke execute on function public.is_campaign_participant(uuid, uuid) from public, anon;
grant execute on function public.is_campaign_participant(uuid, uuid) to authenticated;
revoke execute on function public.live_verdict_status(uuid) from public;
grant execute on function public.live_verdict_status(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Settings (admin)
-- ---------------------------------------------------------------------------

create or replace function public.save_judging_settings(
  p_peer_window_hours integer,
  p_judging_window_hours integer,
  p_peer_vote_credits integer,
  p_appeal_window_days integer,
  p_ai_rationale_wording boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can change judging settings' using errcode = '42501';
  end if;
  if p_judging_window_hours < p_peer_window_hours then
    raise exception 'WINDOWS_ORDER: the judging window must be at least as long as the peer voting window' using errcode = '22023';
  end if;
  update public.judging_settings set
    peer_window_hours = p_peer_window_hours,
    judging_window_hours = p_judging_window_hours,
    peer_vote_credits = p_peer_vote_credits,
    appeal_window_days = p_appeal_window_days,
    ai_rationale_wording = coalesce(p_ai_rationale_wording, false);
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'judging_settings.saved', 'judging_settings', 'true',
          jsonb_build_object('peer_window_hours', p_peer_window_hours, 'judging_window_hours', p_judging_window_hours,
                             'peer_vote_credits', p_peer_vote_credits, 'appeal_window_days', p_appeal_window_days,
                             'ai_rationale_wording', coalesce(p_ai_rationale_wording, false)));
end;
$$;

revoke execute on function public.save_judging_settings(integer, integer, integer, integer, boolean) from public, anon;
grant execute on function public.save_judging_settings(integer, integer, integer, integer, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Panel: assignment (admin) and scoring (judges)
-- ---------------------------------------------------------------------------

create or replace function public.assign_judge(p_campaign_id uuid, p_handle text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  c public.campaigns%rowtype;
  judge uuid;
  inserted boolean;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can assign judges' using errcode = '42501';
  end if;
  select * into c from public.campaigns where id = p_campaign_id;
  if not found or c.status = 'draft' then
    raise exception 'NOT_FOUND: Campaign not found or still a draft' using errcode = 'P0002';
  end if;
  if public.live_verdict_status(c.id) is not null then
    raise exception 'VERDICT_PUBLISHED: the Verdict is already published' using errcode = '42501';
  end if;
  select id into judge from public.profiles
  where lower(handle) = lower(btrim(ltrim(coalesce(p_handle, ''), '@'))) and deleted_at is null;
  if judge is null then
    raise exception 'NO_SUCH_STRATEGIST: no Strategist has that handle' using errcode = 'P0002';
  end if;

  insert into public.judge_assignments (campaign_id, judge_id, assigned_by)
  values (c.id, judge, uid)
  on conflict do nothing
  returning true into inserted;

  if coalesce(inserted, false) then
    insert into public.audit_log (actor_id, action, target_table, target_id, details)
    values (uid, 'judging.judge_assigned', 'judge_assignments', c.id::text, jsonb_build_object('campaign_id', c.id, 'judge_id', judge));
    perform public.enqueue_email(judge, 'judge_assigned',
      jsonb_build_object('campaign_id', c.id, 'campaign_slug', c.slug, 'campaign_title', c.title, 'ends_at', c.ends_at),
      'judge_assigned:' || c.id || ':' || judge);
  end if;
  return jsonb_build_object('judge_id', judge, 'already_assigned', not coalesce(inserted, false),
                            'is_participant', exists (select 1 from public.dispatches d where d.campaign_id = c.id and d.author_id = judge));
end;
$$;

revoke execute on function public.assign_judge(uuid, text) from public, anon;
grant execute on function public.assign_judge(uuid, text) to authenticated;

create or replace function public.unassign_judge(p_campaign_id uuid, p_judge_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.judge_assignments%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can remove judges' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'REASON_REQUIRED: give a reason in up to 500 characters' using errcode = '22023';
  end if;
  select * into a from public.judge_assignments where campaign_id = p_campaign_id and judge_id = p_judge_id for update;
  if not found then
    raise exception 'NOT_FOUND: that judge is not assigned' using errcode = 'P0002';
  end if;
  if a.submitted_at is not null then
    raise exception 'PANEL_LOCKED: this judge has submitted; their scores are locked' using errcode = '42501';
  end if;
  delete from public.judge_assignments where campaign_id = p_campaign_id and judge_id = p_judge_id;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'judging.judge_removed', 'judge_assignments', p_campaign_id::text,
          jsonb_build_object('campaign_id', p_campaign_id, 'judge_id', p_judge_id, 'reason', v_reason));
end;
$$;

revoke execute on function public.unassign_judge(uuid, uuid, text) from public, anon;
grant execute on function public.unassign_judge(uuid, uuid, text) to authenticated;

-- p_scores: [{dispatch_id, logic, evidence, originality, responsiveness, comment}].
-- Saves a draft; with p_submit, also checks every eligible Dispatch (except the
-- judge's own) is scored, then locks the judge's scores for good.
create or replace function public.save_panel_scores(p_campaign_id uuid, p_scores jsonb, p_submit boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  a public.judge_assignments%rowtype;
  s jsonb;
  d public.dispatches%rowtype;
  n integer := 0;
  missing integer;
begin
  select * into a from public.judge_assignments where campaign_id = p_campaign_id and judge_id = uid for update;
  if uid is null or not found then
    raise exception 'NOT_A_JUDGE: you are not on the panel for this Campaign' using errcode = '42501';
  end if;
  if a.submitted_at is not null then
    raise exception 'PANEL_LOCKED: you have submitted; your scores are locked' using errcode = '42501';
  end if;
  if not public.campaign_has_closed(p_campaign_id) then
    raise exception 'NOT_CLOSED: judging starts when the Campaign closes' using errcode = '42501';
  end if;
  if public.live_verdict_status(p_campaign_id) is not null then
    raise exception 'VERDICT_PUBLISHED: the Verdict is already published' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_scores, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_scores, '[]'::jsonb)) > 1000 then
    raise exception 'BAD_SCORES: scores must be a list' using errcode = '22023';
  end if;

  for s in select * from jsonb_array_elements(coalesce(p_scores, '[]'::jsonb)) loop
    select * into d from public.dispatches where id = (s ->> 'dispatch_id')::uuid;
    if not found or d.campaign_id <> p_campaign_id or not public.judging_dispatch_eligible(d) then
      raise exception 'NOT_ELIGIBLE: that Dispatch is not part of this judging' using errcode = '22023';
    end if;
    if d.author_id = uid then
      raise exception 'OWN_DISPATCH: judges cannot score their own Dispatches' using errcode = '42501';
    end if;
    insert into public.panel_scores (campaign_id, dispatch_id, judge_id, logic, evidence, originality, responsiveness, comment)
    values (p_campaign_id, d.id, uid, (s ->> 'logic')::smallint, (s ->> 'evidence')::smallint, (s ->> 'originality')::smallint,
            (s ->> 'responsiveness')::smallint, nullif(btrim(coalesce(s ->> 'comment', '')), ''))
    on conflict (dispatch_id, judge_id) do update set
      logic = excluded.logic, evidence = excluded.evidence, originality = excluded.originality,
      responsiveness = excluded.responsiveness, comment = excluded.comment;
    n := n + 1;
  end loop;

  if coalesce(p_submit, false) then
    select count(*) into missing from public.dispatches x
    where x.campaign_id = p_campaign_id and public.judging_dispatch_eligible(x) and x.author_id <> uid
      and not exists (select 1 from public.panel_scores ps where ps.dispatch_id = x.id and ps.judge_id = uid);
    if missing > 0 then
      raise exception 'PANEL_INCOMPLETE: score every Dispatch before submitting (% left)', missing using errcode = '22023';
    end if;
    update public.judge_assignments set submitted_at = now() where campaign_id = p_campaign_id and judge_id = uid;
    insert into public.audit_log (actor_id, action, target_table, target_id, details)
    values (uid, 'panel.submitted', 'judge_assignments', p_campaign_id::text,
            jsonb_build_object('campaign_id', p_campaign_id, 'scored', (select count(*) from public.panel_scores where campaign_id = p_campaign_id and judge_id = uid)));
  else
    insert into public.audit_log (actor_id, action, target_table, target_id, details)
    values (uid, 'panel.saved', 'judge_assignments', p_campaign_id::text, jsonb_build_object('campaign_id', p_campaign_id, 'saved', n));
  end if;
  return n;
end;
$$;

revoke execute on function public.save_panel_scores(uuid, jsonb, boolean) from public, anon;
grant execute on function public.save_panel_scores(uuid, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Peer votes, steelman confirmations and mind-change picks (Strategists)
-- ---------------------------------------------------------------------------

-- Returns the vote credits left.
create or replace function public.cast_peer_vote(p_dispatch_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  d public.dispatches%rowtype;
  credits integer;
  used integer;
begin
  select * into d from public.dispatches where id = p_dispatch_id;
  if uid is null or not found or not public.judging_dispatch_eligible(d) then
    raise exception 'NOT_ELIGIBLE: that Dispatch cannot be voted on' using errcode = '22023';
  end if;
  if not public.peer_window_open(d.campaign_id) then
    raise exception 'VOTING_CLOSED: peer voting is not open for this Campaign' using errcode = '42501';
  end if;
  if not public.is_campaign_participant(d.campaign_id, uid) then
    raise exception 'NOT_A_PARTICIPANT: only Strategists who posted in this Campaign can vote' using errcode = '42501';
  end if;
  if d.author_id = uid then
    raise exception 'OWN_DISPATCH: you cannot vote for your own Dispatch' using errcode = '42501';
  end if;
  -- One at a time per voter, so two quick votes cannot both take the last credit.
  perform pg_advisory_xact_lock(hashtext('tgs.peer_vote.' || uid::text));
  select peer_vote_credits into credits from public.judging_settings;
  select count(*) into used from public.peer_votes where campaign_id = d.campaign_id and voter_id = uid;
  if exists (select 1 from public.peer_votes where dispatch_id = d.id and voter_id = uid) then
    return credits - used;
  end if;
  if used >= credits then
    raise exception 'NO_CREDITS: you have used all % of your votes', credits using errcode = '42501';
  end if;
  insert into public.peer_votes (campaign_id, dispatch_id, voter_id) values (d.campaign_id, d.id, uid);
  return credits - used - 1;
end;
$$;

create or replace function public.withdraw_peer_vote(p_dispatch_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  c uuid;
begin
  select campaign_id into c from public.dispatches where id = p_dispatch_id;
  if uid is null or c is null then
    raise exception 'NOT_ELIGIBLE: that Dispatch cannot be voted on' using errcode = '22023';
  end if;
  if not public.peer_window_open(c) then
    raise exception 'VOTING_CLOSED: peer voting is not open for this Campaign' using errcode = '42501';
  end if;
  delete from public.peer_votes where dispatch_id = p_dispatch_id and voter_id = uid;
  return (select s.peer_vote_credits - (select count(*) from public.peer_votes where campaign_id = c and voter_id = uid))::integer
         from public.judging_settings s;
end;
$$;

-- "This fairly restates the other side." Participants and the Campaign's
-- judges, during the peer window, never on their own Dispatch.
create or replace function public.set_steelman_confirmation(p_dispatch_id uuid, p_confirmed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  d public.dispatches%rowtype;
begin
  select * into d from public.dispatches where id = p_dispatch_id;
  if uid is null or not found or not public.judging_dispatch_eligible(d) then
    raise exception 'NOT_ELIGIBLE: that Dispatch cannot be confirmed' using errcode = '22023';
  end if;
  if d.author_id = uid then
    raise exception 'OWN_DISPATCH: you cannot confirm your own steelman' using errcode = '42501';
  end if;
  if not public.peer_window_open(d.campaign_id) then
    raise exception 'VOTING_CLOSED: steelman confirmations are not open for this Campaign' using errcode = '42501';
  end if;
  if not public.is_campaign_participant(d.campaign_id, uid)
     and not exists (select 1 from public.judge_assignments where campaign_id = d.campaign_id and judge_id = uid) then
    raise exception 'NOT_A_PARTICIPANT: only Strategists in this Campaign and its judges can confirm' using errcode = '42501';
  end if;
  if coalesce(p_confirmed, false) then
    insert into public.steelman_flags (campaign_id, dispatch_id, user_id) values (d.campaign_id, d.id, uid) on conflict do nothing;
  else
    delete from public.steelman_flags where dispatch_id = d.id and user_id = uid;
  end if;
end;
$$;

-- One "this changed my mind" pick per participant, from the start of the
-- Campaign until the peer window closes. Participants are people who posted
-- or recorded a position.
create or replace function public.pick_mind_changer(p_dispatch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  d public.dispatches%rowtype;
  c public.campaigns%rowtype;
begin
  select * into d from public.dispatches where id = p_dispatch_id;
  if uid is null or not found or not public.judging_dispatch_eligible(d) then
    raise exception 'NOT_ELIGIBLE: that Dispatch cannot be picked' using errcode = '22023';
  end if;
  if d.author_id = uid then
    raise exception 'OWN_DISPATCH: you cannot pick your own Dispatch' using errcode = '42501';
  end if;
  select * into c from public.campaigns where id = d.campaign_id;
  if c.status = 'draft' or now() < c.starts_at
     or (public.campaign_has_closed(c.id) and not public.peer_window_open(c.id)) then
    raise exception 'PICKS_CLOSED: picks are not open for this Campaign' using errcode = '42501';
  end if;
  if not public.is_campaign_participant(c.id, uid)
     and not exists (select 1 from public.campaign_positions where campaign_id = c.id and user_id = uid) then
    raise exception 'NOT_A_PARTICIPANT: only Strategists taking part in this Campaign can pick' using errcode = '42501';
  end if;
  insert into public.mind_change_picks (campaign_id, user_id, dispatch_id) values (c.id, uid, d.id)
  on conflict (campaign_id, user_id) do update set dispatch_id = excluded.dispatch_id;
end;
$$;

create or replace function public.clear_mind_change_pick(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.campaigns%rowtype;
begin
  select * into c from public.campaigns where id = p_campaign_id;
  if not found or (public.campaign_has_closed(c.id) and not public.peer_window_open(c.id)) then
    raise exception 'PICKS_CLOSED: picks are not open for this Campaign' using errcode = '42501';
  end if;
  delete from public.mind_change_picks where campaign_id = p_campaign_id and user_id = auth.uid();
end;
$$;

revoke execute on function public.cast_peer_vote(uuid) from public, anon;
revoke execute on function public.withdraw_peer_vote(uuid) from public, anon;
revoke execute on function public.set_steelman_confirmation(uuid, boolean) from public, anon;
revoke execute on function public.pick_mind_changer(uuid) from public, anon;
revoke execute on function public.clear_mind_change_pick(uuid) from public, anon;
grant execute on function public.cast_peer_vote(uuid) to authenticated;
grant execute on function public.withdraw_peer_vote(uuid) to authenticated;
grant execute on function public.set_steelman_confirmation(uuid, boolean) to authenticated;
grant execute on function public.pick_mind_changer(uuid) to authenticated;
grant execute on function public.clear_mind_change_pick(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Inputs for the Verdict (service role)
-- ---------------------------------------------------------------------------

-- Before and after positions for the mind-change measure. When the legal
-- hardening migration is present, only consented positions are read (its
-- consented_positions view); until then, campaign_positions.
create or replace function public.judging_positions(p_campaign_id uuid)
returns table (user_id uuid, before_position public.position_choice, after_position public.position_choice)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if to_regclass('public.consented_positions') is not null then
    return query execute
      'select cp.user_id, cp.before_position, cp.after_position from public.consented_positions cp where cp.campaign_id = $1'
      using p_campaign_id;
  else
    return query
      select cp.user_id, cp.before_position, cp.after_position from public.campaign_positions cp where cp.campaign_id = p_campaign_id;
  end if;
end;
$$;

revoke execute on function public.judging_positions(uuid) from public, anon, authenticated;
grant execute on function public.judging_positions(uuid) to service_role;

-- Everything the blend needs, in one read. Reaction counts are never included
-- (Sprint 3 rule: reactions do not decide Verdicts).
create or replace function public.judging_inputs(p_campaign_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with c as (select * from public.campaigns where id = p_campaign_id),
  eligible as (
    select d.* from public.dispatches d where d.campaign_id = p_campaign_id and public.judging_dispatch_eligible(d)
  )
  select jsonb_build_object(
    'now', now(),
    'campaign', (select jsonb_build_object('id', c.id, 'slug', c.slug, 'title', c.title, 'category', c.category, 'status', c.status,
                                           'starts_at', c.starts_at, 'ends_at', c.ends_at, 'weights_version', c.judging_weights_version) from c),
    'weights', (select jsonb_build_object('version', w.version, 'panel', w.panel, 'peer', w.peer, 'ai_rubric', w.ai_rubric, 'mind_change', w.mind_change)
                from public.judging_weights w join c on c.judging_weights_version = w.version),
    'settings', (select to_jsonb(s) - 'id' - 'updated_at' from public.judging_settings s),
    'dispatches', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'author_id', e.author_id, 'kind', e.kind, 'created_at', e.created_at) order by e.created_at, e.id) from eligible e), '[]'::jsonb),
    'judges', (select jsonb_build_object('assigned', count(*), 'submitted', count(a.submitted_at)) from public.judge_assignments a where a.campaign_id = p_campaign_id),
    'panel', coalesce((
      select jsonb_agg(jsonb_build_object('dispatch_id', ps.dispatch_id, 'judge_id', ps.judge_id, 'logic', ps.logic, 'evidence', ps.evidence,
                                          'originality', ps.originality, 'responsiveness', ps.responsiveness))
      from public.panel_scores ps
      join public.judge_assignments a on a.campaign_id = ps.campaign_id and a.judge_id = ps.judge_id and a.submitted_at is not null
      join eligible e on e.id = ps.dispatch_id
      where ps.campaign_id = p_campaign_id), '[]'::jsonb),
    'votes', coalesce((
      select jsonb_agg(jsonb_build_object('dispatch_id', v.dispatch_id, 'voter_id', v.voter_id))
      from public.peer_votes v join eligible e on e.id = v.dispatch_id), '[]'::jsonb),
    'reputation', coalesce((
      select jsonb_object_agg(r.user_id, r.points) from public.reputation r
      where r.user_id in (select voter_id from public.peer_votes where campaign_id = p_campaign_id)), '{}'::jsonb),
    'ai', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dispatch_id', x.dispatch_id,
        'logic', coalesce((x.override_scores ->> 'logic')::int, x.logic),
        'evidence', coalesce((x.override_scores ->> 'evidence')::int, x.evidence),
        'originality', coalesce((x.override_scores ->> 'originality')::int, x.originality),
        'responsiveness', coalesce((x.override_scores ->> 'responsiveness')::int, x.responsiveness),
        'steelman_detected', x.steelman_detected, 'steelman_confidence', x.steelman_confidence,
        'prompt_version', x.prompt_version, 'model', x.model, 'overridden', x.overridden_at is not null))
      from (
        select distinct on (s.dispatch_id) s.* from public.ai_rubric_scores s join eligible e on e.id = s.dispatch_id
        where s.campaign_id = p_campaign_id order by s.dispatch_id, s.created_at desc
      ) x), '[]'::jsonb),
    'steelman', coalesce((
      select jsonb_agg(jsonb_build_object('dispatch_id', f.dispatch_id, 'user_id', f.user_id))
      from public.steelman_flags f join eligible e on e.id = f.dispatch_id), '[]'::jsonb),
    'positions', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'before', p.before_position, 'after', p.after_position))
      from public.judging_positions(p_campaign_id) p), '[]'::jsonb),
    'picks', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'dispatch_id', m.dispatch_id))
      from public.mind_change_picks m join eligible e on e.id = m.dispatch_id), '[]'::jsonb),
    -- Authors here who posted (eligibly) in a Campaign that closed before this one: not newcomers.
    'prior_participants', coalesce((
      select jsonb_agg(distinct e.author_id) from eligible e
      where exists (
        select 1 from public.dispatches o join public.campaigns oc on oc.id = o.campaign_id
        where o.author_id = e.author_id and o.campaign_id <> p_campaign_id and public.judging_dispatch_eligible(o)
          and oc.ends_at < (select ends_at from c))), '[]'::jsonb),
    'rubric_jobs', (select jsonb_build_object(
        'pending', count(*) filter (where j.status in ('queued', 'claimed')),
        'failed', count(*) filter (where j.status = 'failed'))
      from public.ai_rubric_jobs j where j.campaign_id = p_campaign_id),
    'peer_window_open', public.peer_window_open(p_campaign_id)
  );
$$;

revoke execute on function public.judging_inputs(uuid) from public, anon, authenticated;
grant execute on function public.judging_inputs(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Verdict workflow
-- ---------------------------------------------------------------------------

-- Stores a computed draft (service role: the processor, or the server on an
-- admin's behalf, with p_actor = that admin). The previous draft is discarded,
-- never deleted.
create or replace function public.store_verdict_draft(p_campaign_id uuid, p_actor uuid, p_draft jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
  new_id uuid;
  live text;
begin
  perform pg_advisory_xact_lock(hashtext('tgs.verdict.' || p_campaign_id::text));
  if not public.campaign_has_closed(p_campaign_id) then
    raise exception 'NOT_CLOSED: a Verdict is computed after the Campaign closes' using errcode = '42501';
  end if;
  live := public.live_verdict_status(p_campaign_id);
  if live = 'final' then
    raise exception 'VERDICT_FINAL: this Verdict is final' using errcode = '42501';
  elsif live = 'published' then
    raise exception 'VERDICT_PUBLISHED: the Verdict is published; it can be recomputed only after an appeal' using errcode = '42501';
  end if;

  update public.verdicts set status = 'discarded' where campaign_id = p_campaign_id and status = 'draft';
  select coalesce(max(version), 0) + 1 into next_version from public.verdicts where campaign_id = p_campaign_id;

  insert into public.verdicts (
    campaign_id, version, status, needs_attention, attention_reasons, weights_snapshot, component_scores, proposed_awards,
    winner_id, rationale, rationale_ai_assisted, rationale_model, rationale_prompt_version, computed_by
  ) values (
    p_campaign_id, next_version, 'draft', coalesce((p_draft ->> 'needs_attention')::boolean, true),
    coalesce(p_draft -> 'attention_reasons', '[]'::jsonb), p_draft -> 'weights_snapshot',
    coalesce(p_draft -> 'component_scores', '[]'::jsonb), coalesce(p_draft -> 'proposed_awards', '[]'::jsonb),
    nullif(p_draft ->> 'winner_id', '')::uuid, p_draft ->> 'rationale',
    coalesce((p_draft ->> 'rationale_ai_assisted')::boolean, false), p_draft ->> 'rationale_model', p_draft ->> 'rationale_prompt_version', p_actor
  )
  returning id into new_id;

  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (p_actor, 'verdict.computed', 'verdicts', new_id::text, jsonb_build_object(
    'campaign_id', p_campaign_id, 'version', next_version,
    'needs_attention', coalesce((p_draft ->> 'needs_attention')::boolean, true),
    'attention', (select coalesce(jsonb_agg(r ->> 'code'), '[]'::jsonb) from jsonb_array_elements(coalesce(p_draft -> 'attention_reasons', '[]'::jsonb)) r),
    'weights', p_draft -> 'weights_snapshot',
    'winner_id', p_draft ->> 'winner_id'));
  return new_id;
end;
$$;

revoke execute on function public.store_verdict_draft(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.store_verdict_draft(uuid, uuid, jsonb) to service_role;

create or replace function public.edit_verdict_rationale(p_verdict_id uuid, p_rationale text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.verdicts%rowtype;
  v_text text := btrim(coalesce(p_rationale, ''));
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can edit a Verdict' using errcode = '42501';
  end if;
  select * into v from public.verdicts where id = p_verdict_id for update;
  if not found or v.status <> 'draft' then
    raise exception 'NOT_DRAFT: only a draft Verdict can be edited' using errcode = '42501';
  end if;
  if char_length(v_text) < 1 or char_length(v_text) > 8000 then
    raise exception 'RATIONALE_LENGTH: the rationale must be 1 to 8000 characters' using errcode = '22023';
  end if;
  update public.verdicts set rationale = v_text, rationale_edited_at = now() where id = v.id;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'verdict.rationale_edited', 'verdicts', v.id::text,
          jsonb_build_object('campaign_id', v.campaign_id, 'version', v.version, 'before', v.rationale, 'after', v_text));
end;
$$;

revoke execute on function public.edit_verdict_rationale(uuid, text) from public, anon;
grant execute on function public.edit_verdict_rationale(uuid, text) to authenticated;

-- Derived from live Verdicts: titles, other awards and judged Campaigns.
create or replace function public.refresh_reputation()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.reputation where true;
  with live as (
    select campaign_id from public.verdicts where status in ('published', 'appealed', 'final')
  ),
  judged as (
    select d.author_id as user_id, count(distinct d.campaign_id) as campaigns
    from public.dispatches d join live l on l.campaign_id = d.campaign_id
    where public.judging_dispatch_eligible(d) group by d.author_id
  ),
  aw as (
    select a.profile_id as user_id,
           count(*) filter (where a.category = 'grand_strategist') as titles,
           count(*) filter (where a.category <> 'grand_strategist') as awards
    from public.awards a join live l on l.campaign_id = a.campaign_id group by a.profile_id
  )
  insert into public.reputation (user_id, campaigns_judged, awards, titles, points)
  select coalesce(j.user_id, aw.user_id), coalesce(j.campaigns, 0), coalesce(aw.awards, 0), coalesce(aw.titles, 0),
         10 * coalesce(aw.titles, 0) + 4 * coalesce(aw.awards, 0) + coalesce(j.campaigns, 0)
  from judged j full join aw on aw.user_id = j.user_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.refresh_reputation() from public, anon, authenticated;
grant execute on function public.refresh_reputation() to service_role;

create or replace function public.publish_verdict(p_verdict_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v public.verdicts%rowtype;
  c public.campaigns%rowtype;
  s public.judging_settings%rowtype;
  previous uuid;
  aw jsonb;
  categories text[] := '{}';
  r record;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can publish a Verdict' using errcode = '42501';
  end if;
  select * into v from public.verdicts where id = p_verdict_id;
  if not found then
    raise exception 'NOT_FOUND: Verdict not found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtext('tgs.verdict.' || v.campaign_id::text));
  select * into v from public.verdicts where id = p_verdict_id for update;
  if v.status <> 'draft' then
    raise exception 'NOT_DRAFT: only a draft Verdict can be published' using errcode = '42501';
  end if;
  if v.needs_attention then
    raise exception 'NEEDS_ATTENTION: resolve the items flagged on this draft first' using errcode = '42501';
  end if;
  if v.winner_id is null then
    raise exception 'NO_WINNER: this draft names no Grand Strategist' using errcode = '42501';
  end if;
  if public.live_verdict_status(v.campaign_id) in ('published', 'final') then
    raise exception 'VERDICT_PUBLISHED: a Verdict is already live for this Campaign' using errcode = '42501';
  end if;
  select * into c from public.campaigns where id = v.campaign_id;
  select * into s from public.judging_settings;

  -- An appealed Verdict is replaced by this one.
  update public.verdicts set status = 'superseded' where campaign_id = v.campaign_id and status = 'appealed' returning id into previous;

  update public.verdicts set status = 'published', published_at = now(), published_by = uid,
    appeal_closes_at = now() + make_interval(days => s.appeal_window_days)
  where id = v.id;

  for aw in select * from jsonb_array_elements(v.proposed_awards) loop
    categories := categories || (aw ->> 'category');
    insert into public.awards (campaign_id, profile_id, category, rationale, awarded_by, verdict_id, dispatch_id, awarded_at)
    values (v.campaign_id, (aw ->> 'profile_id')::uuid, (aw ->> 'category')::public.award_category, aw ->> 'rationale', uid, v.id,
            nullif(aw ->> 'dispatch_id', '')::uuid, now())
    on conflict (campaign_id, category) do update set
      profile_id = excluded.profile_id, rationale = excluded.rationale, awarded_by = excluded.awarded_by,
      verdict_id = excluded.verdict_id, dispatch_id = excluded.dispatch_id, awarded_at = excluded.awarded_at;
  end loop;
  -- Awards an earlier Verdict gave that this one does not.
  delete from public.awards where campaign_id = v.campaign_id and not (category::text = any (categories));

  perform public.refresh_reputation();

  for r in
    select distinct u.user_id from (
      select d.author_id as user_id from public.dispatches d where d.campaign_id = c.id and public.judging_dispatch_eligible(d)
      union
      select f.user_id from public.campaign_follows f where f.campaign_id = c.id
    ) u
  loop
    perform public.enqueue_email(r.user_id, 'verdict_published',
      jsonb_build_object('campaign_id', c.id, 'campaign_slug', c.slug, 'campaign_title', c.title, 'revised', previous is not null),
      'verdict_published:' || v.id || ':' || r.user_id);
  end loop;

  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (uid, 'verdict.published', 'verdicts', v.id::text, jsonb_build_object(
    'campaign_id', v.campaign_id, 'version', v.version, 'winner_id', v.winner_id, 'superseded', previous,
    'awards', v.proposed_awards, 'weights', v.weights_snapshot));
end;
$$;

revoke execute on function public.publish_verdict(uuid) from public, anon;
grant execute on function public.publish_verdict(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Appeals (the Sprint 4 pattern: one appeal per person, a reason, an admin
-- decision with a reason, the outcome emailed in plain words)
-- ---------------------------------------------------------------------------

create or replace function public.appeal_verdict(p_verdict_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v public.verdicts%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  new_id uuid;
begin
  select * into v from public.verdicts where id = p_verdict_id for update;
  if uid is null or not found or v.status not in ('published', 'appealed') then
    raise exception 'NOT_APPEALABLE: this Verdict cannot be appealed' using errcode = '42501';
  end if;
  if now() >= v.appeal_closes_at then
    raise exception 'APPEAL_CLOSED: the appeal window has closed' using errcode = '42501';
  end if;
  if not public.is_campaign_participant(v.campaign_id, uid) then
    raise exception 'NOT_A_PARTICIPANT: only Strategists who posted in this Campaign can appeal' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) > 1000 then
    raise exception 'REASON_REQUIRED: say briefly why, in up to 1000 characters' using errcode = '22023';
  end if;
  if exists (select 1 from public.verdict_appeals where verdict_id = v.id and appellant_id = uid) then
    raise exception 'ALREADY_APPEALED: you can appeal each Verdict once' using errcode = '42501';
  end if;

  insert into public.verdict_appeals (verdict_id, campaign_id, appellant_id, reason)
  values (v.id, v.campaign_id, uid, v_reason) returning id into new_id;
  update public.verdicts set status = 'appealed' where id = v.id and status = 'published';

  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (uid, 'verdict.appealed', 'verdicts', v.id::text, jsonb_build_object('campaign_id', v.campaign_id, 'appeal_id', new_id));
  return new_id;
end;
$$;

revoke execute on function public.appeal_verdict(uuid, text) from public, anon;
grant execute on function public.appeal_verdict(uuid, text) to authenticated;

-- upheld: the Verdict stays "appealed" until an admin recomputes and publishes
-- a new version (which supersedes it). rejected: once no appeal is open, it
-- returns to "published", or becomes "final" if the window has closed.
create or replace function public.decide_verdict_appeal(p_appeal_id uuid, p_outcome text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  a public.verdict_appeals%rowtype;
  v public.verdicts%rowtype;
  c public.campaigns%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  next_status text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can decide appeals' using errcode = '42501';
  end if;
  if p_outcome not in ('upheld', 'rejected') then
    raise exception 'BAD_ACTION: choose upheld or rejected' using errcode = '22023';
  end if;
  if v_reason is null or char_length(v_reason) > 1000 then
    raise exception 'REASON_REQUIRED: give a reason in up to 1000 characters' using errcode = '22023';
  end if;
  select * into a from public.verdict_appeals where id = p_appeal_id for update;
  if not found or a.status <> 'open' then
    raise exception 'NOT_FOUND: that appeal has already been decided' using errcode = 'P0002';
  end if;
  select * into v from public.verdicts where id = a.verdict_id for update;
  select * into c from public.campaigns where id = a.campaign_id;

  update public.verdict_appeals set status = p_outcome, decided_by = uid, decided_at = now(), decision_reason = v_reason,
    same_admin = (uid = v.published_by)
  where id = a.id;

  if v.status = 'appealed' and not exists (select 1 from public.verdict_appeals where verdict_id = v.id and status = 'open') then
    if not exists (select 1 from public.verdict_appeals where verdict_id = v.id and status = 'upheld') then
      next_status := case when now() >= v.appeal_closes_at then 'final' else 'published' end;
      update public.verdicts set status = next_status, finalised_at = case when next_status = 'final' then now() end where id = v.id;
    end if;
  end if;

  perform public.enqueue_email(a.appellant_id, 'verdict_appeal_outcome',
    jsonb_build_object('campaign_id', c.id, 'campaign_slug', c.slug, 'campaign_title', c.title, 'outcome', p_outcome),
    'verdict_appeal_outcome:' || a.id);

  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (uid, 'verdict.appeal_decided', 'verdicts', v.id::text, jsonb_build_object(
    'campaign_id', v.campaign_id, 'appeal_id', a.id, 'outcome', p_outcome, 'reason', v_reason,
    'same_admin', uid = v.published_by, 'verdict_status', coalesce(next_status, v.status)));
end;
$$;

revoke execute on function public.decide_verdict_appeal(uuid, text, text) from public, anon;
grant execute on function public.decide_verdict_appeal(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- AI rubric: overrides (admin) and the processor's queue (service role)
-- ---------------------------------------------------------------------------

create or replace function public.override_ai_rubric_score(p_score_id uuid, p_scores jsonb, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.ai_rubric_scores%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  k text;
  clean jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can override AI scores' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'REASON_REQUIRED: give a reason in up to 500 characters' using errcode = '22023';
  end if;
  select * into s from public.ai_rubric_scores where id = p_score_id for update;
  if not found then
    raise exception 'NOT_FOUND: score not found' using errcode = 'P0002';
  end if;
  if public.live_verdict_status(s.campaign_id) in ('published', 'final') then
    raise exception 'VERDICT_PUBLISHED: the Verdict is already published' using errcode = '42501';
  end if;
  foreach k in array array['logic', 'evidence', 'originality', 'responsiveness'] loop
    if (p_scores ->> k) is null or (p_scores ->> k) !~ '^[1-5]$' then
      raise exception 'BAD_SCORES: each score must be a whole number from 1 to 5' using errcode = '22023';
    end if;
    clean := clean || jsonb_build_object(k, (p_scores ->> k)::int);
  end loop;
  update public.ai_rubric_scores set override_scores = clean, override_reason = v_reason, overridden_by = auth.uid(), overridden_at = now()
  where id = s.id;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'ai_rubric.overridden', 'ai_rubric_scores', s.id::text, jsonb_build_object(
    'campaign_id', s.campaign_id, 'dispatch_id', s.dispatch_id, 'reason', v_reason, 'scores', clean,
    'original', jsonb_build_object('logic', s.logic, 'evidence', s.evidence, 'originality', s.originality, 'responsiveness', s.responsiveness)));
end;
$$;

revoke execute on function public.override_ai_rubric_score(uuid, jsonb, text) from public, anon;
grant execute on function public.override_ai_rubric_score(uuid, jsonb, text) to authenticated;

-- Claims due jobs. A claim older than 10 minutes is assumed crashed and retried.
create or replace function public.claim_rubric_batch(p_limit integer default 10)
returns table (dispatch_id uuid, campaign_id uuid, attempts smallint)
language sql
security definer
set search_path = ''
as $$
  update public.ai_rubric_jobs j
  set status = 'claimed', locked_at = now(), attempts = j.attempts + 1
  where j.dispatch_id in (
    select x.dispatch_id from public.ai_rubric_jobs x
    where (x.status = 'queued' and x.next_attempt_at <= now())
       or (x.status = 'claimed' and x.locked_at < now() - interval '10 minutes')
    order by x.next_attempt_at
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
    for update skip locked
  )
  returning j.dispatch_id, j.campaign_id, j.attempts;
$$;

revoke execute on function public.claim_rubric_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_rubric_batch(integer) to service_role;

-- Idempotent: a second result for the same Dispatch and prompt version is ignored.
create or replace function public.store_rubric_score(p_dispatch_id uuid, p_result jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.dispatches%rowtype;
  new_id uuid;
begin
  select * into d from public.dispatches where id = p_dispatch_id;
  if not found then
    return false;
  end if;
  insert into public.ai_rubric_scores (
    campaign_id, dispatch_id, provider, model, prompt_version, logic, evidence, originality, responsiveness, rationale,
    steelman_detected, steelman_confidence, steelman_note, output, input_tokens, output_tokens, latency_ms
  ) values (
    d.campaign_id, d.id, p_result ->> 'provider', p_result ->> 'model', p_result ->> 'prompt_version',
    (p_result ->> 'logic')::smallint, (p_result ->> 'evidence')::smallint, (p_result ->> 'originality')::smallint,
    (p_result ->> 'responsiveness')::smallint, p_result ->> 'rationale',
    coalesce((p_result ->> 'steelman_detected')::boolean, false), coalesce((p_result ->> 'steelman_confidence')::numeric, 0),
    nullif(p_result ->> 'steelman_note', ''), coalesce(p_result -> 'output', '{}'::jsonb),
    (p_result ->> 'input_tokens')::integer, (p_result ->> 'output_tokens')::integer, (p_result ->> 'latency_ms')::integer
  )
  on conflict (dispatch_id, prompt_version) do nothing
  returning id into new_id;

  update public.ai_rubric_jobs set status = 'done', locked_at = null, last_error = null where dispatch_id = d.id;

  if new_id is not null then
    insert into public.audit_log (actor_id, action, target_table, target_id, details)
    values (null, 'ai_rubric.scored', 'ai_rubric_scores', new_id::text, jsonb_build_object(
      'campaign_id', d.campaign_id, 'dispatch_id', d.id, 'model', p_result ->> 'model', 'prompt_version', p_result ->> 'prompt_version'));
  end if;
  return new_id is not null;
end;
$$;

revoke execute on function public.store_rubric_score(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.store_rubric_score(uuid, jsonb) to service_role;

-- Puts a job back. p_count_attempt false (over the cap, AI off) does not use up
-- an attempt; after 5 counted attempts the job fails and the draft Verdict
-- flags the Dispatch for an admin.
create or replace function public.release_rubric_job(p_dispatch_id uuid, p_error text, p_retry_minutes integer, p_count_attempt boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.ai_rubric_jobs%rowtype;
  next_status text;
begin
  select * into j from public.ai_rubric_jobs where dispatch_id = p_dispatch_id for update;
  if not found then
    return null;
  end if;
  next_status := case when p_count_attempt and j.attempts >= 5 then 'failed' else 'queued' end;
  update public.ai_rubric_jobs set
    status = next_status,
    attempts = case when p_count_attempt then j.attempts else greatest(j.attempts - 1, 0) end,
    locked_at = null,
    last_error = left(p_error, 500),
    next_attempt_at = now() + make_interval(mins => greatest(coalesce(p_retry_minutes, 5), 1))
  where dispatch_id = p_dispatch_id;
  return next_status;
end;
$$;

revoke execute on function public.release_rubric_job(uuid, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.release_rubric_job(uuid, text, integer, boolean) to service_role;

-- Admin: score a Dispatch again (for example after a prompt change or a failure).
create or replace function public.requeue_rubric_job(p_dispatch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.dispatches%rowtype;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can re-run AI scoring' using errcode = '42501';
  end if;
  select * into d from public.dispatches where id = p_dispatch_id;
  if not found or public.live_verdict_status(d.campaign_id) in ('published', 'final') then
    raise exception 'NOT_FOUND: that Dispatch cannot be re-scored now' using errcode = 'P0002';
  end if;
  insert into public.ai_rubric_jobs (dispatch_id, campaign_id) values (d.id, d.campaign_id)
  on conflict (dispatch_id) do update set status = 'queued', attempts = 0, next_attempt_at = now(), locked_at = null, last_error = null;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'ai_rubric.requeued', 'dispatches', d.id::text, jsonb_build_object('campaign_id', d.campaign_id));
end;
$$;

revoke execute on function public.requeue_rubric_job(uuid) from public, anon;
grant execute on function public.requeue_rubric_job(uuid) to authenticated;

-- Campaigns whose draft Verdict is due: closed for the judging window, no
-- Verdict row yet, and no AI scoring still waiting.
create or replace function public.judging_due_campaigns()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.campaigns c, public.judging_settings s
  where c.status = 'closed'
    and now() >= c.ends_at + make_interval(hours => s.judging_window_hours)
    and c.ends_at > now() - interval '60 days'
    and not exists (select 1 from public.verdicts v where v.campaign_id = c.id)
    and not exists (select 1 from public.ai_rubric_jobs j where j.campaign_id = c.id and j.status in ('queued', 'claimed'));
$$;

revoke execute on function public.judging_due_campaigns() from public, anon, authenticated;
grant execute on function public.judging_due_campaigns() to service_role;

-- ---------------------------------------------------------------------------
-- Scheduler (pg_cron)
-- ---------------------------------------------------------------------------

-- Idempotent, once a minute: queue AI scoring for closed Campaigns, email
-- participants when voting opens, and make Verdicts final once their appeal
-- window has passed with no appeal open.
create or replace function public.judging_tick()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued integer;
  emails integer := 0;
  finalised integer := 0;
  r record;
begin
  insert into public.ai_rubric_jobs (dispatch_id, campaign_id)
  select d.id, d.campaign_id from public.dispatches d join public.campaigns c on c.id = d.campaign_id
  where c.status = 'closed' and c.ends_at > now() - interval '60 days'
    and public.judging_dispatch_eligible(d)
    and public.live_verdict_status(c.id) is null
  on conflict (dispatch_id) do nothing;
  get diagnostics queued = row_count;

  for r in
    select distinct c.id, c.slug, c.title, c.ends_at, s.peer_window_hours, d.author_id
    from public.campaigns c
    cross join public.judging_settings s
    join public.dispatches d on d.campaign_id = c.id and public.judging_dispatch_eligible(d)
    where c.status = 'closed' and now() < c.ends_at + make_interval(hours => s.peer_window_hours)
      and not exists (select 1 from public.email_outbox o where o.dedupe_key = 'peer_voting_open:' || c.id || ':' || d.author_id)
  loop
    perform public.enqueue_email(r.author_id, 'peer_voting_open',
      jsonb_build_object('campaign_id', r.id, 'campaign_slug', r.slug, 'campaign_title', r.title,
                         'voting_closes_at', r.ends_at + make_interval(hours => r.peer_window_hours)),
      'peer_voting_open:' || r.id || ':' || r.author_id);
    emails := emails + 1;
  end loop;

  for r in
    update public.verdicts v set status = 'final', finalised_at = now()
    where v.status = 'published' and v.appeal_closes_at <= now()
    returning v.id, v.campaign_id, v.version
  loop
    insert into public.audit_log (actor_id, action, target_table, target_id, details)
    values (null, 'verdict.finalised', 'verdicts', r.id::text, jsonb_build_object('campaign_id', r.campaign_id, 'version', r.version));
    finalised := finalised + 1;
  end loop;

  return jsonb_build_object('queued', queued, 'emails', emails, 'finalised', finalised);
end;
$$;

revoke execute on function public.judging_tick() from public, anon, authenticated;
grant execute on function public.judging_tick() to service_role;

select cron.schedule('judging-tick', '* * * * *', 'select public.judging_tick()');

-- pg_cron -> pg_net -> /api/judging/process, only when there is work: AI
-- scoring due, or a draft Verdict due. Address and secret come from Vault
-- (judging_processor_url, judging_processor_secret). Missing either, nothing
-- is sent and the work waits.
create or replace function public.judging_kick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text;
  secret text;
begin
  if not exists (
    select 1 from public.ai_rubric_jobs
    where (status = 'queued' and next_attempt_at <= now()) or (status = 'claimed' and locked_at < now() - interval '10 minutes')
  ) and not exists (select 1 from public.judging_due_campaigns()) then
    return null;
  end if;
  select decrypted_secret into url from vault.decrypted_secrets where name = 'judging_processor_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'judging_processor_secret';
  if url is null or secret is null then
    raise log 'judging_kick: judging_processor_url or judging_processor_secret is not set in Vault; judging work waits';
    return null;
  end if;
  return net.http_post(
    url := url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.judging_kick() from public, anon, authenticated;

select cron.schedule('judging-kick', '* * * * *', 'select public.judging_kick()');

-- ---------------------------------------------------------------------------
-- Read models: admin status board, judge's list, leaderboard
-- ---------------------------------------------------------------------------

create or replace function public.admin_judging_status(p_campaign_id uuid default null)
returns table (
  campaign_id uuid, slug text, title text, category public.campaign_category, status public.campaign_status, ends_at timestamptz,
  eligible_dispatches integer, judges_assigned integer, judges_submitted integer, peer_votes integer, voters integer,
  picks integer, steelman_confirmations integer, ai_scored integer, ai_pending integer, ai_failed integer,
  draft_id uuid, draft_needs_attention boolean, live_id uuid, live_status text, open_appeals integer,
  peer_window_closes_at timestamptz, draft_due_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can read the judging status' using errcode = '42501';
  end if;
  return query
  select c.id, c.slug, c.title, c.category, c.status, c.ends_at,
    (select count(*)::int from public.dispatches d where d.campaign_id = c.id and public.judging_dispatch_eligible(d)),
    (select count(*)::int from public.judge_assignments a where a.campaign_id = c.id),
    (select count(*)::int from public.judge_assignments a where a.campaign_id = c.id and a.submitted_at is not null),
    (select count(*)::int from public.peer_votes v where v.campaign_id = c.id),
    (select count(distinct v.voter_id)::int from public.peer_votes v where v.campaign_id = c.id),
    (select count(*)::int from public.mind_change_picks m where m.campaign_id = c.id),
    (select count(*)::int from public.steelman_flags f where f.campaign_id = c.id),
    (select count(distinct s.dispatch_id)::int from public.ai_rubric_scores s where s.campaign_id = c.id),
    (select count(*)::int from public.ai_rubric_jobs j where j.campaign_id = c.id and j.status in ('queued', 'claimed')),
    (select count(*)::int from public.ai_rubric_jobs j where j.campaign_id = c.id and j.status = 'failed'),
    (select v.id from public.verdicts v where v.campaign_id = c.id and v.status = 'draft'),
    (select v.needs_attention from public.verdicts v where v.campaign_id = c.id and v.status = 'draft'),
    (select v.id from public.verdicts v where v.campaign_id = c.id and v.status in ('published', 'appealed', 'final')),
    public.live_verdict_status(c.id),
    (select count(*)::int from public.verdict_appeals x where x.campaign_id = c.id and x.status = 'open'),
    c.ends_at + make_interval(hours => s.peer_window_hours),
    c.ends_at + make_interval(hours => s.judging_window_hours)
  from public.campaigns c cross join public.judging_settings s
  where (p_campaign_id is null and c.status in ('open', 'closed')) or c.id = p_campaign_id
  order by c.ends_at desc;
end;
$$;

revoke execute on function public.admin_judging_status(uuid) from public, anon;
grant execute on function public.admin_judging_status(uuid) to authenticated;

-- Public: the leaderboard, from live Verdicts only. All time, or one category.
create or replace function public.leaderboard(p_category public.campaign_category default null, p_limit integer default 50)
returns table (user_id uuid, handle text, titles integer, awards integer, campaigns integer, points integer)
language sql
stable
security definer
set search_path = ''
as $$
  with live as (
    select v.campaign_id from public.verdicts v join public.campaigns c on c.id = v.campaign_id
    where v.status in ('published', 'appealed', 'final') and (p_category is null or c.category = p_category)
  ),
  judged as (
    select d.author_id as user_id, count(distinct d.campaign_id)::int as campaigns
    from public.dispatches d join live l on l.campaign_id = d.campaign_id
    where public.judging_dispatch_eligible(d) group by d.author_id
  ),
  aw as (
    select a.profile_id as user_id,
           (count(*) filter (where a.category = 'grand_strategist'))::int as titles,
           (count(*) filter (where a.category <> 'grand_strategist'))::int as awards
    from public.awards a join live l on l.campaign_id = a.campaign_id group by a.profile_id
  )
  select p.id, p.handle, coalesce(aw.titles, 0), coalesce(aw.awards, 0), coalesce(j.campaigns, 0),
         10 * coalesce(aw.titles, 0) + 4 * coalesce(aw.awards, 0) + coalesce(j.campaigns, 0)
  from judged j full join aw on aw.user_id = j.user_id
  join public.profiles p on p.id = coalesce(j.user_id, aw.user_id)
  where p.handle is not null and p.deleted_at is null
  order by 6 desc, 3 desc, 4 desc, lower(p.handle)
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

grant execute on function public.leaderboard(public.campaign_category, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- AI cap: judging counts towards the global daily cap
-- ---------------------------------------------------------------------------

-- Same as migration 20261104000300, plus the two judging features. Like the
-- nudge and coach, judging stops at 80% of the daily cap, so it can never use
-- up the calls that screening needs; it waits (the job is retried an hour later).
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
  if p_feature in ('nudge', 'coach', 'judge_rubric', 'judge_rationale') then
    -- The last 20% of the day's calls are kept for screening Dispatches.
    if total * 5 >= s.ai_daily_cap_global * 4 then
      return 'global_cap';
    end if;
    if p_feature in ('nudge', 'coach') and p_user_id is not null then
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
