-- Sprint 5, part 1: the judging data model and its row-level security.
--
-- Everything a Verdict is built from, per Campaign:
--   judge_assignments   who sits on the panel (admin assigns)
--   panel_scores        a judge's 1-5 scores per Dispatch on the four criteria;
--                       drafts until the judge submits, then locked
--   peer_votes          one vote per voter per Dispatch, participants only,
--                       never on your own Dispatch, within the peer window
--   steelman_flags      "this fairly restates the other side" confirmations
--   mind_change_picks   "this changed my mind": one Dispatch per participant
--   ai_rubric_jobs      the queue for AI rubric scoring (service role only)
--   ai_rubric_scores    the AI rubric per Dispatch, with model and prompt version
--   verdicts            versioned: draft, published, appealed, final (plus
--                       superseded and discarded for history)
--   verdict_appeals     the Sprint 4 appeal pattern, applied to Verdicts
--   reputation          derived per Strategist from published Verdicts
--   judging_settings    windows, vote credits and steelman rules (admin edits)
--
-- Writes go through security definer functions (part 2), which check the
-- rules and write the audit log. Browsers get SELECT only, through the
-- policies below. Nothing is dropped. Two CHECK constraints are replaced to
-- allow new values (ai_usage.feature, email_outbox.kind).

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

create table public.judging_settings (
  id boolean primary key default true check (id),
  -- Peer voting opens when the Campaign closes and runs this long.
  peer_window_hours integer not null default 72 check (peer_window_hours between 1 and 720),
  -- The draft Verdict is computed automatically this long after the close.
  -- Panel judges score until then (and after, until the Verdict is published).
  judging_window_hours integer not null default 96 check (judging_window_hours between 1 and 1440),
  -- Capped vote credits (CLAUDE.md rule 7): votes each voter may cast per Campaign.
  peer_vote_credits integer not null default 5 check (peer_vote_credits between 1 and 50),
  -- A voter's weight may not exceed this multiple of the median voter weight.
  reputation_cap_multiple numeric(4, 2) not null default 3 check (reputation_cap_multiple between 1 and 10),
  -- Steelman bonus: added to the 0-100 blended score, never more than the cap.
  steelman_bonus_max numeric(4, 2) not null default 5 check (steelman_bonus_max between 0 and 5),
  steelman_bonus_per_dispatch numeric(4, 2) not null default 2.5 check (steelman_bonus_per_dispatch between 0 and 5),
  steelman_min_confirmations integer not null default 2 check (steelman_min_confirmations between 1 and 20),
  steelman_ai_min_confidence numeric(3, 2) not null default 0.60 check (steelman_ai_min_confidence between 0 and 1),
  appeal_window_days integer not null default 7 check (appeal_window_days between 1 and 60),
  -- Optional AI wording of the rationale. Off by default: the template is used.
  ai_rationale_wording boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint judging_settings_windows check (judging_window_hours >= peer_window_hours)
);

comment on table public.judging_settings is
  'Judging windows, vote credits and steelman rules. Defaults are recommendations awaiting owner sign-off. Published with the rubric, so readable by anyone.';

insert into public.judging_settings default values;

create trigger judging_settings_set_updated_at
  before update on public.judging_settings
  for each row execute function public.set_updated_at();

alter table public.judging_settings enable row level security;
revoke all on public.judging_settings from anon, authenticated;
grant select on public.judging_settings to anon, authenticated;

create policy "Anyone can read the judging settings"
  on public.judging_settings for select to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- AI usage and email: new values
-- ---------------------------------------------------------------------------

alter table public.ai_usage drop constraint ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('screen_handle', 'screen_profile', 'screen_dispatch', 'nudge', 'coach', 'judge_rubric', 'judge_rationale'));

alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'reply', 'campaign_opened', 'campaign_round_changed', 'campaign_closed', 'campaign_closing_soon', 'moderation_outcome',
  'judge_assigned', 'peer_voting_open', 'verdict_published', 'verdict_appeal_outcome'
));

-- ---------------------------------------------------------------------------
-- Panel
-- ---------------------------------------------------------------------------

create table public.judge_assignments (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  judge_id uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid,
  assigned_at timestamptz not null default now(),
  -- Set when the judge submits. Their scores are locked from then on.
  submitted_at timestamptz,
  primary key (campaign_id, judge_id)
);

create index judge_assignments_judge_idx on public.judge_assignments (judge_id);

alter table public.judge_assignments enable row level security;
revoke all on public.judge_assignments from anon, authenticated;
grant select on public.judge_assignments to authenticated;

create policy "Judges read their own assignments; admins read all"
  on public.judge_assignments for select to authenticated
  using (judge_id = (select auth.uid()) or public.is_admin());

-- Scores per Dispatch (not per Strategist): Dispatches are what the AI rubric,
-- peer votes and the Dispatch-level awards (best rebuttal, best evidence) are
-- about, so all four parts line up. A Strategist's panel score is the mean of
-- their Dispatches' scores.
create table public.panel_scores (
  campaign_id uuid not null,
  dispatch_id uuid not null references public.dispatches (id) on delete cascade,
  judge_id uuid not null,
  logic smallint not null check (logic between 1 and 5),
  evidence smallint not null check (evidence between 1 and 5),
  originality smallint not null check (originality between 1 and 5),
  responsiveness smallint not null check (responsiveness between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (dispatch_id, judge_id),
  foreign key (campaign_id, judge_id) references public.judge_assignments (campaign_id, judge_id) on delete cascade
);

create index panel_scores_campaign_idx on public.panel_scores (campaign_id, judge_id);

create trigger panel_scores_set_updated_at
  before update on public.panel_scores
  for each row execute function public.set_updated_at();

-- Locked once the judge has submitted: for every role, including the service role.
-- Deletes are not blocked here: browsers cannot delete, unassign_judge() refuses
-- once submitted, and a deleted account or Dispatch must still cascade.
create or replace function public.panel_scores_locked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.judge_assignments a
    where a.campaign_id = new.campaign_id and a.judge_id = new.judge_id and a.submitted_at is not null
  ) then
    raise exception 'PANEL_LOCKED: these scores were submitted and are locked' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.panel_scores_locked() from public, anon, authenticated;

create trigger panel_scores_lock
  before insert or update on public.panel_scores
  for each row execute function public.panel_scores_locked();

alter table public.panel_scores enable row level security;
revoke all on public.panel_scores from anon, authenticated;
grant select on public.panel_scores to authenticated;

-- Nobody reads another judge's scores before that judge has submitted:
-- not other judges, not admins. After submission, admins can.
create policy "Judges read their own scores; admins read submitted scores"
  on public.panel_scores for select to authenticated
  using (
    judge_id = (select auth.uid())
    or (
      public.is_admin()
      and exists (
        select 1 from public.judge_assignments a
        where a.campaign_id = panel_scores.campaign_id and a.judge_id = panel_scores.judge_id and a.submitted_at is not null
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Peer votes, steelman confirmations, mind-change picks
-- ---------------------------------------------------------------------------

create table public.peer_votes (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  dispatch_id uuid not null references public.dispatches (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (dispatch_id, voter_id)
);

create index peer_votes_campaign_voter_idx on public.peer_votes (campaign_id, voter_id);

alter table public.peer_votes enable row level security;
revoke all on public.peer_votes from anon, authenticated;
grant select on public.peer_votes to authenticated;

create policy "Voters read their own votes; admins read all"
  on public.peer_votes for select to authenticated
  using (voter_id = (select auth.uid()) or public.is_admin());

create table public.steelman_flags (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  dispatch_id uuid not null references public.dispatches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (dispatch_id, user_id)
);

create index steelman_flags_campaign_idx on public.steelman_flags (campaign_id);

alter table public.steelman_flags enable row level security;
revoke all on public.steelman_flags from anon, authenticated;
grant select on public.steelman_flags to authenticated;

create policy "Strategists read their own steelman confirmations; admins read all"
  on public.steelman_flags for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create table public.mind_change_picks (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  dispatch_id uuid not null references public.dispatches (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create trigger mind_change_picks_set_updated_at
  before update on public.mind_change_picks
  for each row execute function public.set_updated_at();

alter table public.mind_change_picks enable row level security;
revoke all on public.mind_change_picks from anon, authenticated;
grant select on public.mind_change_picks to authenticated;

create policy "Strategists read their own pick; admins read all"
  on public.mind_change_picks for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- ---------------------------------------------------------------------------
-- AI rubric: queue and scores
-- ---------------------------------------------------------------------------

create table public.ai_rubric_jobs (
  dispatch_id uuid primary key references public.dispatches (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'claimed', 'done', 'failed')),
  attempts smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text check (char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_rubric_jobs_due_idx on public.ai_rubric_jobs (status, next_attempt_at);
create index ai_rubric_jobs_campaign_idx on public.ai_rubric_jobs (campaign_id, status);

create trigger ai_rubric_jobs_set_updated_at
  before update on public.ai_rubric_jobs
  for each row execute function public.set_updated_at();

alter table public.ai_rubric_jobs enable row level security;
revoke all on public.ai_rubric_jobs from anon, authenticated;
-- No policies: the processor (service role) only. Admins see counts through admin_judging_status().

-- One row per Dispatch per prompt version (idempotent: a retry never adds a second).
-- Rule 6: model, prompt version, raw output and a plain-English rationale are
-- stored, and an admin can override the scores with a reason.
create table public.ai_rubric_scores (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  dispatch_id uuid not null references public.dispatches (id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'fake')),
  model text not null,
  prompt_version text not null,
  logic smallint not null check (logic between 1 and 5),
  evidence smallint not null check (evidence between 1 and 5),
  originality smallint not null check (originality between 1 and 5),
  responsiveness smallint not null check (responsiveness between 1 and 5),
  rationale text not null check (char_length(rationale) between 1 and 1000),
  steelman_detected boolean not null default false,
  steelman_confidence numeric(3, 2) not null default 0 check (steelman_confidence between 0 and 1),
  steelman_note text check (char_length(steelman_note) <= 500),
  output jsonb not null default '{}'::jsonb,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  latency_ms integer check (latency_ms >= 0),
  overridden_by uuid,
  overridden_at timestamptz,
  override_scores jsonb,
  override_reason text check (char_length(override_reason) <= 500),
  created_at timestamptz not null default now(),
  constraint ai_rubric_scores_one_per_version unique (dispatch_id, prompt_version),
  constraint ai_rubric_scores_override_complete check (
    (overridden_at is null and override_scores is null and override_reason is null)
    or (overridden_at is not null and override_scores is not null and override_reason is not null)
  )
);

create index ai_rubric_scores_campaign_idx on public.ai_rubric_scores (campaign_id);

alter table public.ai_rubric_scores enable row level security;
revoke all on public.ai_rubric_scores from anon, authenticated;
grant select on public.ai_rubric_scores to authenticated;

create policy "Admins read AI rubric scores"
  on public.ai_rubric_scores for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Verdicts
-- ---------------------------------------------------------------------------

-- Versioned. Each compute adds a draft (the previous draft becomes discarded).
-- Publishing turns a draft into the live Verdict; a later publish (after an
-- upheld appeal) supersedes it. A published row's numbers never change; only
-- its status moves on (published -> appealed -> published/final, or superseded).
create table public.verdicts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  version integer not null check (version >= 1),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'appealed', 'final', 'superseded', 'discarded')),
  -- Missing components, unresolved ties, open windows: publishing is refused while true.
  needs_attention boolean not null default false,
  attention_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(attention_reasons) = 'array'),
  -- The weights actually used: { version, panel, peer, ai_rubric, mind_change, source, reason }.
  weights_snapshot jsonb not null check (jsonb_typeof(weights_snapshot) = 'object'),
  -- Per-Strategist component scores, ranking and tie-break notes (by user id, never by handle).
  component_scores jsonb not null default '[]'::jsonb check (jsonb_typeof(component_scores) = 'array'),
  -- Awards this Verdict will issue when published.
  proposed_awards jsonb not null default '[]'::jsonb check (jsonb_typeof(proposed_awards) = 'array'),
  winner_id uuid references public.profiles (id) on delete set null,
  -- Plain English. Strategists appear as @{user:<id>} tokens, shown with their
  -- current handle (or "a former Strategist"), so no handle is stored here.
  rationale text not null check (char_length(rationale) between 1 and 8000),
  rationale_ai_assisted boolean not null default false,
  rationale_model text,
  rationale_prompt_version text,
  rationale_edited_at timestamptz,
  computed_at timestamptz not null default now(),
  computed_by uuid,
  published_at timestamptz,
  published_by uuid,
  appeal_closes_at timestamptz,
  finalised_at timestamptz,
  created_at timestamptz not null default now(),
  constraint verdicts_unique_version unique (campaign_id, version),
  constraint verdicts_published_fields check (
    -- winner_id is not required here: it is set at publish, and becomes null
    -- only if the winner's account row is later removed.
    status in ('draft', 'discarded') or (published_at is not null and appeal_closes_at is not null)
  )
);

-- At most one draft and at most one live Verdict per Campaign.
create unique index verdicts_one_draft on public.verdicts (campaign_id) where status = 'draft';
create unique index verdicts_one_live on public.verdicts (campaign_id) where status in ('published', 'appealed', 'final');
create index verdicts_status_idx on public.verdicts (status, appeal_closes_at);

alter table public.verdicts enable row level security;
revoke all on public.verdicts from anon, authenticated;
grant select on public.verdicts to anon, authenticated;

create policy "Anyone can read published Verdicts; admins read all"
  on public.verdicts for select to anon, authenticated
  using (status in ('published', 'appealed', 'final') or public.is_admin());

create table public.verdict_appeals (
  id uuid primary key default gen_random_uuid(),
  verdict_id uuid not null references public.verdicts (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  appellant_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 1000),
  status text not null default 'open' check (status in ('open', 'upheld', 'rejected')),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text check (char_length(decision_reason) <= 1000),
  -- The admin who published the Verdict also decided the appeal.
  same_admin boolean,
  created_at timestamptz not null default now(),
  constraint verdict_appeals_once unique (verdict_id, appellant_id)
);

create index verdict_appeals_open_idx on public.verdict_appeals (status, created_at desc);

alter table public.verdict_appeals enable row level security;
revoke all on public.verdict_appeals from anon, authenticated;
grant select on public.verdict_appeals to authenticated;

create policy "Appellants read their own appeals; admins read all"
  on public.verdict_appeals for select to authenticated
  using (appellant_id = (select auth.uid()) or public.is_admin());

-- Awards (Sprint 1 table): which Verdict issued them, and the Dispatch they
-- are for (best rebuttal, best evidence).
alter table public.awards
  add column verdict_id uuid references public.verdicts (id) on delete set null,
  add column dispatch_id uuid references public.dispatches (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Reputation (derived; recomputed whenever a Verdict is published)
-- ---------------------------------------------------------------------------

create table public.reputation (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  campaigns_judged integer not null default 0,
  awards integer not null default 0,
  titles integer not null default 0,
  -- 10 per Grand Strategist title, 4 per other award, 1 per judged Campaign.
  points integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.reputation enable row level security;
revoke all on public.reputation from anon, authenticated;
grant select on public.reputation to anon, authenticated;

create policy "Anyone can read reputation"
  on public.reputation for select to anon, authenticated
  using (true);
