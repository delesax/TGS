-- Sprint 7 batch 2b (W7): judge prompt v2 and "check before relying".
--
-- Owner decision D5 (13 November): prompt v2 tells the judge it cannot verify
-- any source and asks for up to three unverified_claims. Prompt v1 stays on
-- disk untouched. This migration adds only what v2 needs:
--   * ai_rubric_scores.unverified_claims: nullable jsonb array of up to three
--     short strings. Null for every v1 score and every row written before this
--     migration, so older rows need no change;
--   * judging_settings.judge_prompt_version (1 or 2): which prompt the judge
--     uses. It is read each time a batch of scoring jobs runs, so an admin can
--     switch back to v1 with set_judge_prompt_version() without a deploy. The
--     default is 2 because the real evaluation on 13 November passed for every
--     criterion (the numbers are in docs/SPRINT_7_PLAN.md and docs/CLAUDE_LOG.md);
--   * store_rubric_score(): same signature, now also stores unverified_claims
--     when the result carries an array (a missing or null key stores null);
--   * dispatch_unverified_claims(): lets an admin or an assigned judge read ONLY
--     the claims (never the AI scores) for a Campaign's Dispatches, for the
--     "Check before relying" box. ai_rubric_scores itself stays admin-only;
--   * set_judge_prompt_version(): admin only, with a reason and an audit entry.
--
-- Backward compatible with the code on main: only additive columns and new
-- functions; store_rubric_score() keeps its signature and still accepts the
-- old result shape. The deployed processor never sends unverified_claims and
-- never reads judge_prompt_version, so it keeps using prompt v1 until the new
-- code is deployed.

alter table public.ai_rubric_scores
  add column unverified_claims jsonb
    check (unverified_claims is null or (jsonb_typeof(unverified_claims) = 'array' and jsonb_array_length(unverified_claims) <= 3));

comment on column public.ai_rubric_scores.unverified_claims is 'Prompt v2 only: up to three short claims a reader should check. Null for v1 scores and older rows.';

alter table public.judging_settings
  add column judge_prompt_version smallint not null default 2 check (judge_prompt_version in (1, 2));

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
    steelman_detected, steelman_confidence, steelman_note, output, input_tokens, output_tokens, latency_ms, unverified_claims
  ) values (
    d.campaign_id, d.id, p_result ->> 'provider', p_result ->> 'model', p_result ->> 'prompt_version',
    (p_result ->> 'logic')::smallint, (p_result ->> 'evidence')::smallint, (p_result ->> 'originality')::smallint,
    (p_result ->> 'responsiveness')::smallint, p_result ->> 'rationale',
    coalesce((p_result ->> 'steelman_detected')::boolean, false), coalesce((p_result ->> 'steelman_confidence')::numeric, 0),
    nullif(p_result ->> 'steelman_note', ''), coalesce(p_result -> 'output', '{}'::jsonb),
    (p_result ->> 'input_tokens')::integer, (p_result ->> 'output_tokens')::integer, (p_result ->> 'latency_ms')::integer,
    case when jsonb_typeof(p_result -> 'unverified_claims') = 'array' then p_result -> 'unverified_claims' end
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

-- Admins and the Campaign's assigned judges may read the claims (not the scores).
create or replace function public.dispatch_unverified_claims(p_campaign_id uuid)
returns table (dispatch_id uuid, unverified_claims jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin()
          or exists (select 1 from public.judge_assignments a where a.campaign_id = p_campaign_id and a.judge_id = auth.uid())) then
    raise exception 'NOT_ALLOWED: only admins and this Campaign''s judges can read this' using errcode = '42501';
  end if;
  return query
    select distinct on (s.dispatch_id) s.dispatch_id, s.unverified_claims
    from public.ai_rubric_scores s
    join public.dispatches d on d.id = s.dispatch_id
    where s.campaign_id = p_campaign_id and s.unverified_claims is not null and public.judging_dispatch_eligible(d)
    order by s.dispatch_id, s.created_at desc;
end;
$$;

revoke execute on function public.dispatch_unverified_claims(uuid) from public, anon;
grant execute on function public.dispatch_unverified_claims(uuid) to authenticated;

-- Admin only: switch the judge between prompt v1 and v2, with a reason. Takes
-- effect the next time a batch of scoring jobs runs; scores already stored keep
-- the version that wrote them.
create or replace function public.set_judge_prompt_version(p_version smallint, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  before_version smallint;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can change the judge prompt version' using errcode = '42501';
  end if;
  if p_version is null or p_version not in (1, 2) then
    raise exception 'BAD_INPUT: the judge prompt version is 1 or 2' using errcode = '22023';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'REASON_REQUIRED: give a reason of up to 500 characters' using errcode = '22023';
  end if;
  select judge_prompt_version into before_version from public.judging_settings;
  update public.judging_settings set judge_prompt_version = p_version where id = true;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'judging_settings.prompt_version_changed', 'judging_settings', 'true',
          jsonb_build_object('judge_prompt_version', jsonb_build_array(before_version, p_version), 'reason', v_reason));
end;
$$;

revoke execute on function public.set_judge_prompt_version(smallint, text) from public, anon;
grant execute on function public.set_judge_prompt_version(smallint, text) to authenticated;
