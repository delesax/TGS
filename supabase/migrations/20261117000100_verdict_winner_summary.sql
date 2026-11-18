-- The winner's summary on a Verdict ("The winning case").
--
-- Additive only: no existing column, function, policy or constraint is changed,
-- and publish_verdict / store_verdict_draft / ai_reserve_call are NOT touched.
--
--  * verdicts gains nullable columns holding the APPROVED summary text. A published
--    Verdict is world-readable, so nothing unreviewed is ever stored there, and no
--    admin id is stored there (the admin is in the audit log only).
--  * verdict_summary_drafts holds AI drafts: admin-readable only, never public.
--  * Approving or editing a summary is allowed only while the Verdict is a draft.
--    Removing a summary is allowed at any status (it takes text off the public page).
--  * The AI call is logged in ai_usage under the existing feature 'judge_rationale';
--    each draft row records the model, the prompt version and the token counts.

-- 1. Approved summary text, on the Verdict (public once the Verdict is published)
alter table public.verdicts
  add column winner_summary text
    check (winner_summary is null or char_length(winner_summary) between 1 and 1500),
  add column winner_summary_dispatch_id uuid references public.dispatches (id) on delete set null,
  add column winner_summary_ai_assisted boolean not null default false,
  add column winner_summary_model text,
  add column winner_summary_prompt_version text,
  add column winner_summary_edited_at timestamptz,
  add column winner_summary_approved_at timestamptz,
  add constraint verdicts_summary_approved
    check (winner_summary is null or winner_summary_approved_at is not null);

-- 2. AI drafts: admin-only, never public. History is kept (status), never deleted.
create table public.verdict_summary_drafts (
  id uuid primary key default gen_random_uuid(),
  verdict_id uuid not null references public.verdicts (id) on delete cascade,
  winner_id uuid not null,
  summary text not null check (char_length(summary) between 1 and 1500),
  best_dispatch_id uuid references public.dispatches (id) on delete set null,
  model text not null,
  prompt_version text not null,
  input_dispatch_ids uuid[] not null default '{}',
  -- The validated model output plus { usage: { input_tokens, output_tokens, estimated_cost_usd } }.
  output jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'removed', 'discarded')),
  created_by uuid,
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz
);

create index verdict_summary_drafts_verdict_idx on public.verdict_summary_drafts (verdict_id, created_at desc);

alter table public.verdict_summary_drafts enable row level security;
revoke all on public.verdict_summary_drafts from anon, authenticated;
grant select on public.verdict_summary_drafts to authenticated;

create policy "Admins read summary drafts"
  on public.verdict_summary_drafts for select to authenticated
  using (public.is_admin());

-- 3. Store an AI draft. Service role only: the server checks the admin first.
create or replace function public.store_verdict_summary_draft(p_verdict_id uuid, p_actor uuid, p_draft jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.verdicts%rowtype;
  new_id uuid;
  draft_winner uuid := nullif(p_draft ->> 'winner_id', '')::uuid;
  best uuid := nullif(p_draft ->> 'best_dispatch_id', '')::uuid;
begin
  select * into v from public.verdicts where id = p_verdict_id for update;
  if not found or v.status <> 'draft' then
    raise exception 'NOT_DRAFT: a summary is drafted only for a draft Verdict' using errcode = '42501';
  end if;
  if draft_winner is null then
    raise exception 'NO_WINNER: the draft names no winner' using errcode = '22023';
  end if;
  if v.winner_id is distinct from draft_winner then
    raise exception 'WINNER_MISMATCH: the summary is for a different winner' using errcode = '22023';
  end if;
  if (select count(*) from public.verdict_summary_drafts where verdict_id = v.id) >= 5 then
    raise exception 'DRAFT_LIMIT: five drafts is the limit for one Verdict' using errcode = '22023';
  end if;
  if best is not null and not exists (
    select 1 from public.dispatches d
    where d.id = best and d.campaign_id = v.campaign_id and d.author_id = v.winner_id and public.judging_dispatch_eligible(d)
  ) then
    raise exception 'BAD_DISPATCH: that is not a visible Dispatch by the winner' using errcode = '22023';
  end if;

  update public.verdict_summary_drafts set status = 'discarded', decided_at = now()
  where verdict_id = v.id and status = 'pending';

  insert into public.verdict_summary_drafts (
    verdict_id, winner_id, summary, best_dispatch_id, model, prompt_version, input_dispatch_ids, output, created_by
  ) values (
    v.id, v.winner_id, p_draft ->> 'summary', best, p_draft ->> 'model', p_draft ->> 'prompt_version',
    coalesce(array(select jsonb_array_elements_text(p_draft -> 'input_dispatch_ids'))::uuid[], '{}'::uuid[]),
    coalesce(p_draft -> 'output', '{}'::jsonb), p_actor
  )
  returning id into new_id;

  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (p_actor, 'verdict.summary_drafted', 'verdicts', v.id::text, jsonb_build_object(
    'campaign_id', v.campaign_id, 'version', v.version, 'winner_id', v.winner_id, 'draft_id', new_id,
    'model', p_draft ->> 'model', 'prompt_version', p_draft ->> 'prompt_version',
    'usage', p_draft -> 'output' -> 'usage'));
  return new_id;
end;
$$;

revoke execute on function public.store_verdict_summary_draft(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.store_verdict_summary_draft(uuid, uuid, jsonb) to service_role;

-- 4. An admin approves (with any edits) the summary text visitors will see. Draft Verdicts only.
create or replace function public.approve_verdict_summary(p_verdict_id uuid, p_text text, p_dispatch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.verdicts%rowtype;
  d public.verdict_summary_drafts%rowtype;
  has_draft boolean;
  t text := btrim(coalesce(p_text, ''));
  words integer;
  ai boolean;
  ai_model text;
  ai_prompt text;
  edited timestamptz;
  before_text text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can approve a summary' using errcode = '42501';
  end if;
  select * into v from public.verdicts where id = p_verdict_id for update;
  if not found or v.status <> 'draft' then
    raise exception 'NOT_DRAFT: only a draft Verdict can take a summary' using errcode = '42501';
  end if;
  if v.winner_id is null then
    raise exception 'NO_WINNER: this draft names no Grand Strategist' using errcode = '42501';
  end if;
  words := coalesce(array_length(regexp_split_to_array(t, '\s+'), 1), 0);
  if char_length(t) < 1 or char_length(t) > 1500 or words < 20 or words > 250 then
    raise exception 'SUMMARY_LENGTH: 20 to 250 words and at most 1500 characters' using errcode = '22023';
  end if;
  if p_dispatch_id is not null and not exists (
    select 1 from public.dispatches x
    where x.id = p_dispatch_id and x.campaign_id = v.campaign_id and x.author_id = v.winner_id and public.judging_dispatch_eligible(x)
  ) then
    raise exception 'BAD_DISPATCH: that is not a visible Dispatch by the winner' using errcode = '22023';
  end if;

  select * into d from public.verdict_summary_drafts
  where verdict_id = v.id and status = 'pending' and winner_id = v.winner_id
  order by created_at desc limit 1;
  has_draft := found;

  before_text := case when has_draft then d.summary else v.winner_summary end;
  if has_draft then
    -- A fresh AI draft: label it AI-assisted; note an edit when the admin changed the text.
    ai := true;
    ai_model := d.model;
    ai_prompt := d.prompt_version;
    edited := case when t <> d.summary then now() else null end;
  elsif v.winner_summary is not null and v.winner_summary_ai_assisted then
    -- Re-approving an AI-drafted summary keeps its AI label, model and prompt version.
    ai := true;
    ai_model := v.winner_summary_model;
    ai_prompt := v.winner_summary_prompt_version;
    edited := case when t <> v.winner_summary then now() else v.winner_summary_edited_at end;
  else
    -- No AI involvement at all.
    ai := false;
    ai_model := null;
    ai_prompt := null;
    edited := null;
  end if;

  update public.verdicts set
    winner_summary = t,
    winner_summary_dispatch_id = p_dispatch_id,
    winner_summary_ai_assisted = ai,
    winner_summary_model = ai_model,
    winner_summary_prompt_version = ai_prompt,
    winner_summary_edited_at = edited,
    winner_summary_approved_at = now()
  where id = v.id;

  if has_draft then
    update public.verdict_summary_drafts set status = 'approved', decided_by = auth.uid(), decided_at = now() where id = d.id;
  end if;

  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'verdict.summary_approved', 'verdicts', v.id::text, jsonb_build_object(
    'campaign_id', v.campaign_id, 'version', v.version, 'winner_id', v.winner_id,
    'ai_assisted', ai, 'draft_id', case when has_draft then d.id end,
    'edited', edited is not null, 'before', before_text, 'after', t));
end;
$$;

revoke execute on function public.approve_verdict_summary(uuid, text, uuid) from public, anon;
grant execute on function public.approve_verdict_summary(uuid, text, uuid) to authenticated;

-- 5. An admin removes the summary at ANY Verdict status. A reason of 10+ characters is required.
create or replace function public.remove_verdict_summary(p_verdict_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.verdicts%rowtype;
  why text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can remove a summary' using errcode = '42501';
  end if;
  if char_length(why) < 10 or char_length(why) > 500 then
    raise exception 'REASON_REQUIRED: give a reason of 10 to 500 characters' using errcode = '22023';
  end if;
  select * into v from public.verdicts where id = p_verdict_id for update;
  if not found then
    raise exception 'NOT_FOUND: Verdict not found' using errcode = 'P0002';
  end if;

  update public.verdicts set
    winner_summary = null, winner_summary_dispatch_id = null, winner_summary_ai_assisted = false,
    winner_summary_model = null, winner_summary_prompt_version = null,
    winner_summary_edited_at = null, winner_summary_approved_at = null
  where id = v.id;

  -- The draft history stays; only its status changes.
  update public.verdict_summary_drafts set status = 'removed', decided_by = auth.uid(), decided_at = now()
  where verdict_id = v.id and status in ('pending', 'approved');

  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'verdict.summary_removed', 'verdicts', v.id::text, jsonb_build_object(
    'campaign_id', v.campaign_id, 'version', v.version, 'status', v.status,
    'reason', why, 'removed_text', v.winner_summary));
end;
$$;

revoke execute on function public.remove_verdict_summary(uuid, text) from public, anon;
grant execute on function public.remove_verdict_summary(uuid, text) to authenticated;
