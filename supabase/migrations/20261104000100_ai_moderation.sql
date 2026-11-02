-- Sprint 4: AI moderation, nudges, the coach, flags and appeals, the review
-- queue and the admin console.
--
-- Extends Sprint 1-3 rather than replacing it:
--   * community_settings gains the AI kill switch, call caps, model choices,
--     the fallback policy and the account-deletion switch (all audited)
--   * ai_decisions gains the feature, Campaign, category, confidence, tokens and
--     timing of each call, and records nudges, coach feedback and display names
--   * Dispatches are posted as "pending" and become visible only after
--     screening (apply_dispatch_screening, service role only). AI may hold but
--     never delete: only a person can remove, and removed content is sealed.
--   * moderation_flags (unscreened, undeclared AI text, held handles),
--     dispatch_appeals, moderate_dispatch(), posting mute, AI usage and caps,
--     coach feedback ratings, versioned judging weights
--   * a pg_cron sweeper that re-screens Dispatches left pending for 2 minutes
-- No table or row is dropped. Two CHECK constraints are replaced to allow new
-- values, and one policy is changed with ALTER POLICY.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

alter table public.community_settings
  -- Kill switch: false turns every AI feature off and applies the fallback below.
  add column ai_enabled boolean not null default true,
  -- When the AI is down, over its cap or switched off (owner decision 1):
  --   normal Campaigns post with an "unscreened" marker; sensitive ones hold.
  add column ai_fallback_normal text not null default 'post_unscreened' check (ai_fallback_normal in ('post_unscreened', 'hold')),
  add column ai_fallback_sensitive text not null default 'hold' check (ai_fallback_sensitive in ('post_unscreened', 'hold')),
  -- Cost caps (owner decision 4). Screening counts towards the global cap only,
  -- so nobody can use up their own allowance to post unscreened.
  add column ai_daily_cap_global integer not null default 3000 check (ai_daily_cap_global between 0 and 100000),
  add column ai_daily_cap_per_strategist integer not null default 40 check (ai_daily_cap_per_strategist between 0 and 1000),
  add column coach_uses_per_draft integer not null default 3 check (coach_uses_per_draft between 0 and 10),
  add column coach_daily_cap integer not null default 10 check (coach_daily_cap between 0 and 100),
  add column nudge_on_submit boolean not null default true,
  -- Longest text sent to the model; longer input is refused, never cut short.
  add column ai_input_max_chars integer not null default 6000 check (ai_input_max_chars between 500 and 20000),
  -- Model choices. Null means: the AI_MODEL_* environment variable, else the default.
  add column ai_model_screening text check (ai_model_screening ~ '^[a-z0-9][a-z0-9.@_-]{2,79}$'),
  add column ai_model_nudge text check (ai_model_nudge ~ '^[a-z0-9][a-z0-9.@_-]{2,79}$'),
  add column ai_model_coach text check (ai_model_coach ~ '^[a-z0-9][a-z0-9.@_-]{2,79}$'),
  -- Confidence at or above which a flagged Dispatch is held. Sensitive
  -- Campaigns (CLAUDE.md rule 13) use the stricter, lower threshold.
  add column hold_threshold numeric(3, 2) not null default 0.70 check (hold_threshold between 0.05 and 1),
  add column sensitive_hold_threshold numeric(3, 2) not null default 0.40 check (sensitive_hold_threshold between 0.05 and 1),
  -- Rule 9: flag likely pasted AI text declared as "none" for review (owner decision 2).
  add column undeclared_ai_flag boolean not null default true,
  -- Owner decision 9 (default: handles only). Display names and bios can be switched on.
  add column screen_display_names boolean not null default false,
  add column screen_bios boolean not null default false,
  -- Owner decision 8: off until the owner approves the wording.
  add column account_deletion_enabled boolean not null default false;

grant update (
  ai_enabled, ai_fallback_normal, ai_fallback_sensitive, ai_daily_cap_global, ai_daily_cap_per_strategist,
  coach_uses_per_draft, coach_daily_cap, nudge_on_submit, ai_input_max_chars, ai_model_screening, ai_model_nudge,
  ai_model_coach, hold_threshold, sensitive_hold_threshold, undeclared_ai_flag, screen_display_names, screen_bios,
  account_deletion_enabled
) on public.community_settings to authenticated;

-- Changes to the reaction set are audited like the other settings.
create trigger reaction_types_audit
  after update on public.reaction_types
  for each row execute function public.audit_settings_change();

-- London calendar day, used for daily caps and the spend log.
create or replace function public.uk_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/London')::date;
$$;

-- ---------------------------------------------------------------------------
-- AI decisions: more detail per call
-- ---------------------------------------------------------------------------

alter table public.ai_decisions drop constraint ai_decisions_subject_type_check;
alter table public.ai_decisions add constraint ai_decisions_subject_type_check
  check (subject_type in ('handle', 'dispatch', 'display_name', 'bio', 'nudge', 'coach'));

alter table public.ai_decisions
  add column feature text check (feature in ('screen_handle', 'screen_profile', 'screen_dispatch', 'nudge', 'coach')),
  add column provider text check (provider in ('anthropic', 'fake', 'denylist')),
  add column campaign_id uuid references public.campaigns (id) on delete set null,
  add column category text check (char_length(category) <= 40),
  add column confidence numeric(3, 2) check (confidence between 0 and 1),
  add column input_tokens integer check (input_tokens >= 0),
  add column output_tokens integer check (output_tokens >= 0),
  add column latency_ms integer check (latency_ms >= 0);

create index ai_decisions_created_idx on public.ai_decisions (created_at desc);

-- ---------------------------------------------------------------------------
-- Dispatches: screening state and holds
-- ---------------------------------------------------------------------------

alter table public.dispatches
  -- awaiting: posted or edited, not screened yet; screened; unscreened: the
  -- fallback applied (AI down, over cap or off); not_required: before Sprint 4.
  add column screening text not null default 'not_required'
    check (screening in ('awaiting', 'screened', 'unscreened', 'not_required')),
  add column screen_requested_at timestamptz,
  add column screen_attempts smallint not null default 0,
  add column held_at timestamptz,
  -- Plain words for the author. Never the AI's own reason.
  add column held_reason text check (char_length(held_reason) <= 300),
  -- high: the AI said "block". Treated as a hold, shown first in the queue.
  add column hold_priority text check (hold_priority in ('high', 'normal'));

create index dispatches_awaiting_idx on public.dispatches (screen_requested_at) where screening = 'awaiting';
create index dispatches_held_idx on public.dispatches (held_at desc) where moderation_status = 'held';

grant select (screening, held_at, held_reason, hold_priority) on public.dispatches to anon, authenticated;

-- Removed Dispatches stay in place as "Removed by a moderator." so replies
-- under them keep their thread. Their content is sealed (hidden_at is set), so
-- only the placeholder is readable. Pending and held stay author and admin only.
alter policy "Anyone can read visible Dispatches in published Campaigns" on public.dispatches
  using (
    (
      (moderation_status = 'visible' or (moderation_status = 'removed' and hidden_at is not null))
      and exists (select 1 from public.campaigns c where c.id = campaign_id and c.status <> 'draft')
    )
    or author_id = (select auth.uid())
    or public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- Posting mute (admin, reversible, shown to the Strategist with its reason)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column posting_muted_at timestamptz,
  add column posting_muted_reason text check (char_length(posting_muted_reason) <= 500),
  add column posting_muted_by uuid;

-- Not granted to browsers: others must not see who is muted. The Strategist
-- reads their own status through my_account_status().
create or replace function public.my_account_status()
returns table (posting_muted_at timestamptz, posting_muted_reason text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.posting_muted_at, p.posting_muted_reason from public.profiles p where p.id = auth.uid();
$$;

revoke execute on function public.my_account_status() from public, anon;
grant execute on function public.my_account_status() to authenticated;

create or replace function public.set_posting_mute(p_user_id uuid, p_muted boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can mute posting' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'REASON_REQUIRED: give a reason of up to 500 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and handle is not null) then
    raise exception 'NOT_FOUND: no such Strategist' using errcode = 'P0002';
  end if;

  update public.profiles set
    posting_muted_at = case when p_muted then coalesce(posting_muted_at, now()) else null end,
    posting_muted_reason = case when p_muted then v_reason else null end,
    posting_muted_by = case when p_muted then auth.uid() else null end
  where id = p_user_id;

  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), case when p_muted then 'strategist.muted' else 'strategist.unmuted' end, 'profiles', p_user_id::text,
          jsonb_build_object('reason', v_reason));
end;
$$;

revoke execute on function public.set_posting_mute(uuid, boolean, text) from public, anon;
grant execute on function public.set_posting_mute(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Posting and editing now wait for screening
-- ---------------------------------------------------------------------------

-- Same rules as Sprint 3, plus: muted Strategists cannot post, replies need a
-- visible target, and the Dispatch starts as pending ("Checking…", author
-- only). The app screens it straight away; the sweeper below catches any the
-- app did not finish.
create or replace function public.post_dispatch(
  p_campaign_id uuid,
  p_kind public.dispatch_kind,
  p_body text,
  p_ai_use public.ai_use_declaration,
  p_parent_id uuid default null,
  p_sources jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  s public.community_settings%rowtype;
  c public.campaigns%rowtype;
  prof public.profiles%rowtype;
  round_pos smallint;
  round_kinds public.dispatch_kind[];
  has_rounds boolean;
  v_body text := btrim(coalesce(p_body, ''));
  max_chars integer;
  pos public.position_choice;
  n integer;
  last_post timestamptz;
  wait_seconds integer;
  new_id uuid;
begin
  if uid is null then
    raise exception 'NOT_SIGNED_IN: sign in to post' using errcode = '42501';
  end if;
  -- Locking the profile serialises one Strategist's posts, so the limits below hold.
  select * into prof from public.profiles where id = uid and handle is not null for update;
  if not found then
    raise exception 'NOT_ONBOARDED: choose a handle before posting' using errcode = '42501';
  end if;
  if prof.posting_muted_at is not null then
    raise exception 'MUTED: posting is paused for this account' using errcode = '42501';
  end if;

  select * into s from public.community_settings;
  select * into c from public.campaigns where id = p_campaign_id;
  if not found or c.status = 'draft' then
    raise exception 'CAMPAIGN_NOT_FOUND: no such Campaign' using errcode = 'P0002';
  end if;
  if now() < c.starts_at then
    raise exception 'CAMPAIGN_NOT_OPEN: this Campaign has not opened yet' using errcode = '42501';
  end if;
  if c.status = 'closed' or now() >= c.ends_at then
    raise exception 'CAMPAIGN_CLOSED: this Campaign has closed' using errcode = '42501';
  end if;

  select exists (select 1 from public.campaign_rounds where campaign_id = c.id) into has_rounds;
  if has_rounds then
    select r.position, r.allowed_kinds into round_pos, round_kinds
    from public.campaign_rounds r
    where r.campaign_id = c.id and r.starts_at <= now() and now() < r.ends_at
    order by r.position
    limit 1;
    if round_pos is null then
      raise exception 'NO_ROUND_NOW: no round is running at the moment' using errcode = '42501';
    end if;
    if not (p_kind = any (round_kinds)) then
      raise exception 'KIND_NOT_IN_ROUND: this round does not accept that kind of Dispatch' using errcode = '42501';
    end if;
  end if;

  if p_ai_use is null then
    raise exception 'AI_USE_REQUIRED: say whether you used AI' using errcode = '22023';
  end if;

  max_chars := case p_kind
    when 'argument' then s.argument_max_chars
    when 'rebuttal' then s.rebuttal_max_chars
    else s.evidence_max_chars
  end;
  if v_body = '' then
    raise exception 'BODY_REQUIRED: write your Dispatch' using errcode = '22023';
  end if;
  if char_length(v_body) > max_chars then
    raise exception 'BODY_TOO_LONG: keep it to % characters', max_chars using errcode = '22023', detail = max_chars::text;
  end if;

  if p_parent_id is not null and not exists (
    select 1 from public.dispatches t
    where t.id = p_parent_id and t.moderation_status = 'visible' and t.withdrawn_at is null and t.hidden_at is null
  ) then
    raise exception 'TARGET_UNAVAILABLE: that Dispatch cannot be answered' using errcode = '22023';
  end if;

  select coalesce(cp.after_position, cp.before_position) into pos
  from public.campaign_positions cp
  where cp.campaign_id = c.id and cp.user_id = uid;
  if pos is null then
    raise exception 'POSITION_REQUIRED: record your position first' using errcode = '42501';
  end if;
  if c.format = 'oxford' and pos = 'undecided' then
    raise exception 'POSITION_SIDE_REQUIRED: choose For or Against to post in an Oxford-style Campaign' using errcode = '42501';
  end if;

  -- Held and pending Dispatches count towards the limit too.
  select count(*) into n from public.dispatches d
  where d.author_id = uid and d.campaign_id = c.id and d.round_position is not distinct from round_pos;
  if n >= s.max_dispatches_per_round then
    raise exception 'ROUND_LIMIT: you have posted % Dispatches in this round', n
      using errcode = '42501', detail = s.max_dispatches_per_round::text;
  end if;

  select max(d.created_at) into last_post from public.dispatches d where d.author_id = uid;
  if last_post is not null and last_post > now() - make_interval(secs => s.cooldown_seconds) then
    wait_seconds := ceil(extract(epoch from (last_post + make_interval(secs => s.cooldown_seconds) - now())))::integer;
    raise exception 'COOLDOWN: wait % seconds', wait_seconds using errcode = '42501', detail = wait_seconds::text;
  end if;

  insert into public.dispatches (
    campaign_id, author_id, parent_id, kind, position, body, sources, ai_use, round_position,
    moderation_status, screening, screen_requested_at
  ) values (
    c.id, uid, p_parent_id, p_kind, pos, v_body, coalesce(p_sources, '[]'::jsonb), p_ai_use, round_pos,
    'pending', 'awaiting', now()
  )
  returning id into new_id;

  return new_id;
end;
$$;

-- Same as Sprint 3, plus: muted Strategists cannot edit, held or removed
-- Dispatches cannot be edited (appeal instead), and an edited Dispatch is
-- screened again before others see the new text.
create or replace function public.edit_dispatch(
  p_id uuid,
  p_body text,
  p_ai_use public.ai_use_declaration,
  p_sources jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  s public.community_settings%rowtype;
  d public.dispatches%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  max_chars integer;
begin
  select * into s from public.community_settings;
  select * into d from public.dispatches where id = p_id for update;
  if not found or uid is null or d.author_id <> uid then
    raise exception 'NOT_YOURS: you can only edit your own Dispatches' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = uid and posting_muted_at is not null) then
    raise exception 'MUTED: posting is paused for this account' using errcode = '42501';
  end if;
  if d.withdrawn_at is not null or d.hidden_at is not null or d.moderation_status not in ('pending', 'visible') then
    raise exception 'NOT_EDITABLE: this Dispatch has been withdrawn, held or hidden' using errcode = '42501';
  end if;
  if now() > d.created_at + make_interval(secs => s.edit_window_seconds) then
    raise exception 'EDIT_WINDOW_OVER: Dispatches can be edited for % minutes after posting', s.edit_window_seconds / 60
      using errcode = '42501', detail = s.edit_window_seconds::text;
  end if;
  if not public.campaign_is_open(d.campaign_id) then
    raise exception 'CAMPAIGN_CLOSED: this Campaign has closed' using errcode = '42501';
  end if;
  if p_ai_use is null then
    raise exception 'AI_USE_REQUIRED: say whether you used AI' using errcode = '22023';
  end if;
  max_chars := case d.kind
    when 'argument' then s.argument_max_chars
    when 'rebuttal' then s.rebuttal_max_chars
    else s.evidence_max_chars
  end;
  if v_body = '' then
    raise exception 'BODY_REQUIRED: write your Dispatch' using errcode = '22023';
  end if;
  if char_length(v_body) > max_chars then
    raise exception 'BODY_TOO_LONG: keep it to % characters', max_chars using errcode = '22023', detail = max_chars::text;
  end if;

  if (d.body, d.sources, d.ai_use) is not distinct from (v_body, coalesce(p_sources, '[]'::jsonb), p_ai_use) then
    return; -- nothing changed
  end if;

  insert into public.dispatch_revisions (dispatch_id, body, sources, ai_use, revised_by)
  values (d.id, d.body, d.sources, d.ai_use, uid);

  update public.dispatches
  set body = v_body, sources = coalesce(p_sources, '[]'::jsonb), ai_use = p_ai_use, edited_at = now(),
      moderation_status = 'pending', screening = 'awaiting', screen_requested_at = now(), screen_attempts = 0
  where id = d.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Flags for review (never shown to the Strategist, never act on their own)
-- ---------------------------------------------------------------------------

create table public.moderation_flags (
  id uuid primary key default gen_random_uuid(),
  -- unscreened: posted or held by the fallback, needs a human look
  -- undeclared_ai: declared "none" but looks like pasted AI output (rule 9)
  -- held_handle: a handle the AI did not allow, waiting for a person
  -- unscreened_handle: a handle accepted while the AI was unavailable (deny-list only)
  kind text not null check (kind in ('unscreened', 'undeclared_ai', 'held_handle', 'unscreened_handle')),
  dispatch_id uuid references public.dispatches (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  ai_decision_id uuid references public.ai_decisions (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution text check (resolution in ('released', 'kept_held', 'removed', 'dismissed')),
  resolution_reason text check (char_length(resolution_reason) <= 500),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint moderation_flags_subject check (dispatch_id is not null or kind in ('held_handle', 'unscreened_handle'))
);

create unique index moderation_flags_one_open_per_dispatch on public.moderation_flags (kind, dispatch_id) where status = 'open' and dispatch_id is not null;
create unique index moderation_flags_one_open_handle on public.moderation_flags (user_id) where status = 'open' and kind = 'held_handle';
create index moderation_flags_open_idx on public.moderation_flags (status, created_at desc);

alter table public.moderation_flags enable row level security;
revoke all on public.moderation_flags from anon, authenticated;
grant select on public.moderation_flags to authenticated;

create policy "Admins read moderation flags"
  on public.moderation_flags for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Appeals (once per Dispatch)
-- ---------------------------------------------------------------------------

create table public.dispatch_appeals (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null unique references public.dispatches (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  -- What was appealed, and who did it (null: the AI or the fallback).
  original_status public.moderation_status not null,
  original_actor uuid,
  status text not null default 'open' check (status in ('open', 'upheld', 'rejected')),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text check (char_length(decision_reason) <= 500),
  -- The same admin made the original decision and decided the appeal.
  same_admin boolean,
  created_at timestamptz not null default now()
);

create index dispatch_appeals_open_idx on public.dispatch_appeals (status, created_at desc);

alter table public.dispatch_appeals enable row level security;
revoke all on public.dispatch_appeals from anon, authenticated;
grant select on public.dispatch_appeals to authenticated;

create policy "Authors read their own appeals; admins read all"
  on public.dispatch_appeals for select to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

create or replace function public.appeal_dispatch(p_dispatch_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  d public.dispatches%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  actor uuid;
  new_id uuid;
begin
  select * into d from public.dispatches where id = p_dispatch_id for update;
  if not found or uid is null or d.author_id <> uid then
    raise exception 'NOT_YOURS: you can only appeal your own Dispatches' using errcode = '42501';
  end if;
  if d.moderation_status not in ('held', 'removed') and d.hidden_at is null then
    raise exception 'NOT_APPEALABLE: only a held or hidden Dispatch can be appealed' using errcode = '42501';
  end if;
  if d.withdrawn_at is not null then
    raise exception 'NOT_APPEALABLE: a withdrawn Dispatch cannot be appealed' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'REASON_REQUIRED: say briefly why, in up to 500 characters' using errcode = '22023';
  end if;
  if exists (select 1 from public.dispatch_appeals where dispatch_id = d.id) then
    raise exception 'ALREADY_APPEALED: each Dispatch can be appealed once' using errcode = '42501';
  end if;

  -- Who made the decision being appealed: the last person to act on it, if any.
  select a.actor_id into actor from public.audit_log a
  where a.target_table = 'dispatches' and a.target_id = d.id::text and a.actor_id is not null and a.actor_id <> uid
    and a.action in ('moderation.kept_held', 'moderation.removed', 'dispatch.hidden')
  order by a.id desc limit 1;

  insert into public.dispatch_appeals (dispatch_id, author_id, reason, original_status, original_actor)
  values (d.id, uid, v_reason, d.moderation_status, coalesce(actor, d.hidden_by))
  returning id into new_id;

  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (uid, 'dispatch.appealed', 'dispatches', d.id::text, jsonb_build_object('appeal_id', new_id, 'status', d.moderation_status));
  return new_id;
end;
$$;

revoke execute on function public.appeal_dispatch(uuid, text) from public, anon;
grant execute on function public.appeal_dispatch(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Email: moderation outcomes reuse the Sprint 3 outbox and preferences
-- ---------------------------------------------------------------------------

alter table public.notification_preferences add column moderation boolean not null default true;
grant select (moderation) on public.notification_preferences to authenticated;
grant update (moderation) on public.notification_preferences to authenticated;

alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'reply', 'campaign_opened', 'campaign_round_changed', 'campaign_closed', 'campaign_closing_soon', 'moderation_outcome'
));

create or replace function public.unsubscribe_by_token(p_token uuid, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  select user_id into uid from public.notification_preferences where unsubscribe_token = p_token;
  if uid is null or p_kind not in ('replies', 'campaign_updates', 'closing_soon', 'moderation', 'all') then
    return false;
  end if;
  update public.notification_preferences set
    replies = case when p_kind in ('replies', 'all') then false else replies end,
    campaign_updates = case when p_kind in ('campaign_updates', 'all') then false else campaign_updates end,
    closing_soon = case when p_kind in ('closing_soon', 'all') then false else closing_soon end,
    moderation = case when p_kind in ('moderation', 'all') then false else moderation end,
    unsubscribed_all_at = case when p_kind = 'all' then now() else unsubscribed_all_at end
  where user_id = uid;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (uid, 'email.unsubscribed', 'notification_preferences', uid::text, jsonb_build_object('kind', p_kind, 'via', 'link'));
  return true;
end;
$$;

-- Adds the moderation preference. The return type changes, so the old
-- function is replaced under the same name (same rights: service role only).
drop function public.email_recipients(uuid[]);
create function public.email_recipients(p_user_ids uuid[])
returns table (
  user_id uuid,
  email text,
  confirmed boolean,
  handle text,
  replies boolean,
  campaign_updates boolean,
  closing_soon boolean,
  moderation boolean,
  unsubscribed_all boolean,
  unsubscribe_token uuid,
  sent_last_24h integer,
  daily_cap integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text, u.email_confirmed_at is not null, p.handle,
         coalesce(np.replies, true), coalesce(np.campaign_updates, true), coalesce(np.closing_soon, true),
         coalesce(np.moderation, true),
         np.unsubscribed_all_at is not null, np.unsubscribe_token,
         (select count(distinct o.message_id)::integer from public.email_outbox o
          where o.user_id = u.id and o.status = 'sent' and o.sent_at > now() - interval '24 hours'),
         (select email_daily_cap from public.community_settings)
  from auth.users u
  join public.profiles p on p.id = u.id
  left join public.notification_preferences np on np.user_id = u.id
  where u.id = any (p_user_ids);
$$;

revoke execute on function public.email_recipients(uuid[]) from public, anon, authenticated;
grant execute on function public.email_recipients(uuid[]) to service_role;

-- outcome: held, released, kept_held, removed. The payload carries only what
-- the email says; the dedupe key makes a repeated decision harmless.
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

-- ---------------------------------------------------------------------------
-- Applying a screening result (service role only: the app's server)
-- ---------------------------------------------------------------------------

-- p_result: { outcome: allow | hold | block | unavailable, model, prompt_version,
--   provider, reason, category, confidence, output, input_tokens, output_tokens,
--   latency_ms, undeclared_ai (boolean), undeclared_ai_reason }
-- Idempotent: a Dispatch that is no longer awaiting screening is left alone.
-- AI may hold but never delete: "block" becomes a high-priority hold.
create or replace function public.apply_dispatch_screening(p_dispatch_id uuid, p_result jsonb)
returns public.moderation_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.dispatches%rowtype;
  c public.campaigns%rowtype;
  s public.community_settings%rowtype;
  outcome text := p_result ->> 'outcome';
  decision_id uuid;
  policy text;
  next_status public.moderation_status;
  held_words constant text := 'A person will check this before others can see it.';
begin
  if outcome is null or outcome not in ('allow', 'hold', 'block', 'unavailable') then
    raise exception 'BAD_RESULT: outcome must be allow, hold, block or unavailable' using errcode = '22023';
  end if;
  select * into d from public.dispatches where id = p_dispatch_id for update;
  if not found then
    raise exception 'NOT_FOUND: no such Dispatch' using errcode = 'P0002';
  end if;
  if d.screening <> 'awaiting' or d.moderation_status <> 'pending' then
    return d.moderation_status;
  end if;
  select * into c from public.campaigns where id = d.campaign_id;
  select * into s from public.community_settings;

  if outcome <> 'unavailable' then
    insert into public.ai_decisions (
      subject_type, subject_id, user_id, model, prompt_version, outcome, reason, output, feature, provider,
      campaign_id, category, confidence, input_tokens, output_tokens, latency_ms
    ) values (
      'dispatch', d.id::text, d.author_id, p_result ->> 'model', p_result ->> 'prompt_version',
      outcome::public.ai_decision_outcome, p_result ->> 'reason', coalesce(p_result -> 'output', '{}'::jsonb),
      'screen_dispatch', p_result ->> 'provider', c.id, p_result ->> 'category',
      (p_result ->> 'confidence')::numeric, (p_result ->> 'input_tokens')::integer,
      (p_result ->> 'output_tokens')::integer, (p_result ->> 'latency_ms')::integer
    )
    returning id into decision_id;
  end if;

  if outcome = 'allow' then
    next_status := 'visible';
    update public.dispatches set moderation_status = 'visible', screening = 'screened' where id = d.id;
  elsif outcome in ('hold', 'block') then
    next_status := 'held';
    update public.dispatches
    set moderation_status = 'held', screening = 'screened', held_at = now(), held_reason = held_words,
        hold_priority = case when outcome = 'block' then 'high' else 'normal' end
    where id = d.id;
    perform public.queue_moderation_email(d.id, 'held');
  else
    -- The AI is down, over its cap or switched off (owner decision 1).
    policy := case when c.is_sensitive then s.ai_fallback_sensitive else s.ai_fallback_normal end;
    if policy = 'hold' then
      next_status := 'held';
      update public.dispatches
      set moderation_status = 'held', screening = 'unscreened', held_at = now(), held_reason = held_words, hold_priority = 'normal'
      where id = d.id;
      perform public.queue_moderation_email(d.id, 'held');
    else
      next_status := 'visible';
      update public.dispatches set moderation_status = 'visible', screening = 'unscreened' where id = d.id;
    end if;
    insert into public.moderation_flags (kind, dispatch_id, user_id, details)
    values ('unscreened', d.id, d.author_id, jsonb_build_object('why', coalesce(p_result ->> 'reason', 'AI unavailable'), 'policy', policy))
    on conflict do nothing;
  end if;

  -- Rule 9: a soft flag for review only. Nothing changes for the author.
  if s.undeclared_ai_flag and d.ai_use = 'none' and coalesce((p_result ->> 'undeclared_ai')::boolean, false) then
    insert into public.moderation_flags (kind, dispatch_id, user_id, ai_decision_id, details)
    values ('undeclared_ai', d.id, d.author_id, decision_id,
            jsonb_build_object('why', coalesce(p_result ->> 'undeclared_ai_reason', 'Reads like pasted AI output.')))
    on conflict do nothing;
  end if;

  return next_status;
end;
$$;

revoke execute on function public.apply_dispatch_screening(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_dispatch_screening(uuid, jsonb) to service_role;

-- The sweeper's claim: Dispatches awaiting screening for 2 minutes or more.
-- Claiming pushes screen_requested_at forward, so two sweeps never take the same one.
create or replace function public.claim_pending_screening(p_limit integer default 20)
returns table (id uuid, screen_attempts smallint)
language sql
security definer
set search_path = ''
as $$
  update public.dispatches d
  set screen_requested_at = now(), screen_attempts = d.screen_attempts + 1
  where d.id in (
    select x.id from public.dispatches x
    where x.screening = 'awaiting' and x.moderation_status = 'pending' and x.screen_requested_at < now() - interval '2 minutes'
    order by x.screen_requested_at
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    for update skip locked
  )
  returning d.id, d.screen_attempts;
$$;

revoke execute on function public.claim_pending_screening(integer) from public, anon, authenticated;
grant execute on function public.claim_pending_screening(integer) to service_role;

-- pg_cron -> pg_net -> /api/moderation/sweep, only when something is stuck.
-- Address and secret come from Vault (owner action on hosted, see
-- docs/LAUNCH_EMAIL_SETUP.md). Missing either, nothing is sent; the Dispatch
-- stays "Checking…" for its author and hidden from everyone else.
create or replace function public.moderation_kick()
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
    select 1 from public.dispatches
    where screening = 'awaiting' and moderation_status = 'pending' and screen_requested_at < now() - interval '2 minutes'
  ) then
    return null;
  end if;
  select decrypted_secret into url from vault.decrypted_secrets where name = 'moderation_processor_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'moderation_processor_secret';
  if url is null or secret is null then
    raise log 'moderation_kick: moderation_processor_url or moderation_processor_secret is not set in Vault';
    return null;
  end if;
  return net.http_post(
    url := url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke execute on function public.moderation_kick() from public, anon, authenticated;

select cron.schedule('moderation-sweep', '* * * * *', 'select public.moderation_kick()');

-- ---------------------------------------------------------------------------
-- Human decisions on Dispatches (the review queue)
-- ---------------------------------------------------------------------------

-- p_action: release (visible), keep_held, remove (sealed, "Removed by a
-- moderator."), dismiss (close reports and flags, change nothing).
-- Every action needs a reason. Overriding an AI decision fills its override
-- columns; every action is audit-logged; an open appeal is decided; the
-- author is told the outcome in plain words.
create or replace function public.moderate_dispatch(p_dispatch_id uuid, p_action text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  d public.dispatches%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  decision public.ai_decisions%rowtype;
  appeal public.dispatch_appeals%rowtype;
  new_outcome public.ai_decision_outcome;
  overrode boolean := false;
  same boolean := false;
  v_resolution text;
  sealed public.dispatch_sealed_content%rowtype;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can moderate' using errcode = '42501';
  end if;
  if p_action not in ('release', 'keep_held', 'remove', 'dismiss') then
    raise exception 'BAD_ACTION: choose release, keep held, remove or dismiss' using errcode = '22023';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'REASON_REQUIRED: give a reason of up to 500 characters' using errcode = '22023';
  end if;
  select * into d from public.dispatches where id = p_dispatch_id for update;
  if not found then
    raise exception 'NOT_FOUND: no such Dispatch' using errcode = 'P0002';
  end if;
  if p_action = 'keep_held' and d.moderation_status <> 'held' then
    raise exception 'NOT_HELD: only a held Dispatch can be kept held' using errcode = '22023';
  end if;
  if p_action = 'release' and d.withdrawn_at is not null then
    raise exception 'WITHDRAWN: the author withdrew this Dispatch' using errcode = '22023';
  end if;

  select * into decision from public.ai_decisions
  where subject_type = 'dispatch' and subject_id = d.id::text
  order by created_at desc limit 1;
  select * into appeal from public.dispatch_appeals where dispatch_id = d.id and status = 'open';

  if p_action = 'release' then
    if d.hidden_at is not null then
      select * into sealed from public.dispatch_sealed_content
      where dispatch_id = d.id and sealed_for = 'hidden' and released_at is null
      order by sealed_at desc limit 1;
      update public.dispatches
      set hidden_at = null, hidden_by = null, hidden_reason = null,
          body = coalesce(sealed.body, body), sources = coalesce(sealed.sources, sources)
      where id = d.id;
      if sealed.id is not null then
        update public.dispatch_sealed_content set released_at = now() where id = sealed.id;
      end if;
    end if;
    update public.dispatches
    set moderation_status = 'visible', held_at = null, held_reason = null, hold_priority = null,
        screening = case when screening = 'awaiting' then 'screened' else screening end
    where id = d.id;
    update public.dispatch_reports set status = 'dismissed', resolved_at = now(), resolved_by = uid
    where dispatch_id = d.id and status = 'open';
    new_outcome := 'allow';
    v_resolution := 'released';
  elsif p_action = 'keep_held' then
    update public.dispatches set held_reason = 'A person has checked this. It stays hidden from others.' where id = d.id;
    new_outcome := 'hold';
    v_resolution := 'kept_held';
  elsif p_action = 'remove' then
    if d.hidden_at is null and d.withdrawn_at is null then
      insert into public.dispatch_sealed_content (dispatch_id, sealed_for, body, sources)
      values (d.id, 'hidden', d.body, d.sources);
    end if;
    update public.dispatches
    set moderation_status = 'removed', held_at = null, held_reason = null, hold_priority = null,
        hidden_at = coalesce(hidden_at, now()), hidden_by = coalesce(hidden_by, uid), hidden_reason = v_reason,
        body = case when d.withdrawn_at is null and d.hidden_at is null then 'Removed by a moderator.' else body end,
        sources = case when d.withdrawn_at is null and d.hidden_at is null then '[]'::jsonb else sources end,
        screening = case when screening = 'awaiting' then 'screened' else screening end
    where id = d.id;
    update public.dispatch_reports set status = 'actioned', resolved_at = now(), resolved_by = uid
    where dispatch_id = d.id and status = 'open';
    new_outcome := 'block';
    v_resolution := 'removed';
  else
    update public.dispatch_reports set status = 'dismissed', resolved_at = now(), resolved_by = uid
    where dispatch_id = d.id and status = 'open';
    v_resolution := 'dismissed';
  end if;

  -- Override the AI when the person decides differently.
  if decision.id is not null and new_outcome is not null and decision.overridden_at is null
     and (new_outcome = 'allow') <> (decision.outcome = 'allow') then
    update public.ai_decisions
    set overridden_by = uid, overridden_at = now(), override_outcome = new_outcome, override_reason = v_reason
    where id = decision.id;
    overrode := true;
  end if;

  update public.moderation_flags
  set status = 'resolved', resolution = v_resolution, resolution_reason = v_reason, resolved_by = uid, resolved_at = now()
  where dispatch_id = d.id and status = 'open';

  if appeal.id is not null and p_action <> 'dismiss' then
    same := appeal.original_actor is not null and appeal.original_actor = uid;
    update public.dispatch_appeals
    set status = case when p_action = 'release' then 'upheld' else 'rejected' end,
        decided_by = uid, decided_at = now(), decision_reason = v_reason, same_admin = same
    where id = appeal.id;
  end if;

  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (uid, 'moderation.' || v_resolution, 'dispatches', d.id::text,
          jsonb_build_object('reason', v_reason, 'from', d.moderation_status, 'ai_decision_id', decision.id,
                             'overrode_ai', overrode, 'appeal_id', appeal.id, 'same_admin_as_original', same));

  if p_action <> 'dismiss' and (p_action <> 'release' or d.moderation_status <> 'visible' or d.hidden_at is not null) then
    perform public.queue_moderation_email(d.id, v_resolution, appeal.id is not null);
  end if;
end;
$$;

revoke execute on function public.moderate_dispatch(uuid, text, text) from public, anon;
grant execute on function public.moderate_dispatch(uuid, text, text) to authenticated;

-- A flag about a Dispatch that needs no change to it (unscreened and fine,
-- undeclared-AI noted): close it with a reason.
create or replace function public.resolve_flag(p_flag_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  f public.moderation_flags%rowtype;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can resolve flags' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'REASON_REQUIRED: give a reason of up to 500 characters' using errcode = '22023';
  end if;
  update public.moderation_flags
  set status = 'resolved', resolution = 'dismissed', resolution_reason = v_reason, resolved_by = auth.uid(), resolved_at = now()
  where id = p_flag_id and status = 'open' and kind <> 'held_handle'
  returning * into f;
  if f.id is null then
    raise exception 'NOT_FOUND: no such open flag' using errcode = 'P0002';
  end if;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'moderation.flag_dismissed', case when f.dispatch_id is null then 'profiles' else 'dispatches' end,
          coalesce(f.dispatch_id, f.user_id)::text,
          jsonb_build_object('flag_id', f.id, 'kind', f.kind, 'reason', v_reason));
end;
$$;

revoke execute on function public.resolve_flag(uuid, text) from public, anon;
grant execute on function public.resolve_flag(uuid, text) to authenticated;

-- Held handles: release sets the handle (if it is still free and the
-- Strategist has not chosen another); keep_held closes the request.
create or replace function public.decide_held_handle(p_flag_id uuid, p_action text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  f public.moderation_flags%rowtype;
  wanted text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can decide handles' using errcode = '42501';
  end if;
  if p_action not in ('release', 'keep_held') then
    raise exception 'BAD_ACTION: choose release or keep held' using errcode = '22023';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'REASON_REQUIRED: give a reason of up to 500 characters' using errcode = '22023';
  end if;
  select * into f from public.moderation_flags where id = p_flag_id and kind = 'held_handle' and status = 'open' for update;
  if not found then
    raise exception 'NOT_FOUND: no such held handle' using errcode = 'P0002';
  end if;
  wanted := f.details ->> 'handle';

  if p_action = 'release' then
    if exists (select 1 from public.profiles where id = f.user_id and handle is not null) then
      raise exception 'HANDLE_ALREADY_CHOSEN: this Strategist has since chosen another handle' using errcode = '22023';
    end if;
    if exists (select 1 from public.profiles where lower(handle) = lower(wanted)) then
      raise exception 'HANDLE_TAKEN: someone else now has this handle' using errcode = '23505';
    end if;
    update public.profiles set handle = wanted, handle_set_at = now() where id = f.user_id;
  end if;

  if f.ai_decision_id is not null then
    update public.ai_decisions
    set overridden_by = uid, overridden_at = now(),
        override_outcome = case when p_action = 'release' then 'allow' else 'hold' end::public.ai_decision_outcome,
        override_reason = v_reason
    where id = f.ai_decision_id and overridden_at is null and p_action = 'release';
  end if;

  update public.moderation_flags
  set status = 'resolved', resolution = case when p_action = 'release' then 'released' else 'kept_held' end,
      resolution_reason = v_reason, resolved_by = uid, resolved_at = now()
  where id = f.id;

  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (uid, case when p_action = 'release' then 'moderation.handle_released' else 'moderation.handle_kept_held' end,
          'profiles', f.user_id::text, jsonb_build_object('handle', wanted, 'reason', v_reason, 'flag_id', f.id));
end;
$$;

revoke execute on function public.decide_held_handle(uuid, text, text) from public, anon;
grant execute on function public.decide_held_handle(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- AI usage: caps and the spend log
-- ---------------------------------------------------------------------------

create table public.ai_usage (
  day date not null,
  feature text not null check (feature in ('screen_handle', 'screen_profile', 'screen_dispatch', 'nudge', 'coach')),
  -- The system (sweeper, scripts) uses the nil UUID.
  user_id uuid not null default '00000000-0000-0000-0000-000000000000',
  calls integer not null default 0,
  failures integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (day, feature, user_id)
);

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

create policy "Admins read AI usage"
  on public.ai_usage for select to authenticated
  using (public.is_admin());

-- Reserves one call, or says why not: off, global_cap, user_cap or coach_cap.
-- Screening never counts against a Strategist's own cap.
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
  insert into public.ai_usage (day, feature, user_id, calls) values (today, p_feature, who, 1)
  on conflict (day, feature, user_id) do update set calls = ai_usage.calls + 1;
  return 'ok';
end;
$$;

revoke execute on function public.ai_reserve_call(text, uuid) from public, anon, authenticated;
grant execute on function public.ai_reserve_call(text, uuid) to service_role;

create or replace function public.ai_record_usage(p_feature text, p_user_id uuid, p_input_tokens integer, p_output_tokens integer, p_failed boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ai_usage (day, feature, user_id, input_tokens, output_tokens, failures)
  values (public.uk_today(), p_feature, coalesce(p_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
          greatest(coalesce(p_input_tokens, 0), 0), greatest(coalesce(p_output_tokens, 0), 0), case when p_failed then 1 else 0 end)
  on conflict (day, feature, user_id) do update set
    input_tokens = ai_usage.input_tokens + excluded.input_tokens,
    output_tokens = ai_usage.output_tokens + excluded.output_tokens,
    failures = ai_usage.failures + excluded.failures;
$$;

revoke execute on function public.ai_record_usage(text, uuid, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.ai_record_usage(text, uuid, integer, integer, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Coach feedback ratings. The draft text is never stored: only the feedback
-- (in ai_decisions) and the Strategist's thumbs up or down.
-- ---------------------------------------------------------------------------

create table public.coach_feedback (
  ai_decision_id uuid primary key references public.ai_decisions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete set null,
  -- Random per draft, made in the browser; counts uses per draft. Not the text.
  draft_key uuid not null,
  helpful boolean,
  comment text check (char_length(comment) <= 500),
  rated_at timestamptz,
  created_at timestamptz not null default now()
);

create index coach_feedback_draft_idx on public.coach_feedback (user_id, draft_key);

alter table public.coach_feedback enable row level security;
revoke all on public.coach_feedback from anon, authenticated;
grant select on public.coach_feedback to authenticated;

create policy "Strategists read their own coach feedback; admins read all"
  on public.coach_feedback for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create or replace function public.rate_coach_feedback(p_decision_id uuid, p_helpful boolean, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if p_helpful is null then
    raise exception 'RATING_REQUIRED: choose thumbs up or down' using errcode = '22023';
  end if;
  if char_length(v_comment) > 500 then
    raise exception 'COMMENT_TOO_LONG: keep it to 500 characters' using errcode = '22023';
  end if;
  update public.coach_feedback set helpful = p_helpful, comment = v_comment, rated_at = now()
  where ai_decision_id = p_decision_id and user_id = auth.uid();
  if not found then
    raise exception 'NOT_YOURS: you can only rate your own feedback' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.rate_coach_feedback(uuid, boolean, text) from public, anon;
grant execute on function public.rate_coach_feedback(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Judging weights (CLAUDE.md rule 7). Only the editor is built now; Sprint 5
-- reads campaigns.judging_weights_version. Versions are never changed: an
-- edit adds a new version. A Campaign takes the current version when it
-- opens, so its weights are locked from then on.
-- ---------------------------------------------------------------------------

create table public.judging_weights (
  version integer generated always as identity primary key,
  panel smallint not null check (panel between 0 and 100),
  peer smallint not null check (peer between 0 and 100),
  ai_rubric smallint not null check (ai_rubric between 0 and 100),
  mind_change smallint not null check (mind_change between 0 and 100),
  note text check (char_length(note) <= 500),
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint judging_weights_sum_100 check (panel + peer + ai_rubric + mind_change = 100)
);

comment on table public.judging_weights is
  'Versioned blend weights for the Verdict. Insert-only; the latest version applies to Campaigns that have not opened yet.';

insert into public.judging_weights (panel, peer, ai_rubric, mind_change, note)
values (40, 25, 25, 10, 'CLAUDE.md rule 7 defaults');

alter table public.judging_weights enable row level security;
revoke all on public.judging_weights from anon, authenticated;
grant select on public.judging_weights to anon, authenticated;

-- Published with the rubric, so anyone may read them.
create policy "Anyone can read judging weights"
  on public.judging_weights for select to anon, authenticated
  using (true);

create or replace function public.save_judging_weights(p_panel integer, p_peer integer, p_ai_rubric integer, p_mind_change integer, p_note text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can change the judging weights' using errcode = '42501';
  end if;
  if coalesce(p_panel, -1) < 0 or coalesce(p_peer, -1) < 0 or coalesce(p_ai_rubric, -1) < 0 or coalesce(p_mind_change, -1) < 0 then
    raise exception 'WEIGHTS_INVALID: each weight must be a whole number from 0 to 100' using errcode = '22023';
  end if;
  if p_panel + p_peer + p_ai_rubric + p_mind_change <> 100 then
    raise exception 'WEIGHTS_SUM: the four weights must add up to 100' using errcode = '22023';
  end if;
  insert into public.judging_weights (panel, peer, ai_rubric, mind_change, note, created_by)
  values (p_panel, p_peer, p_ai_rubric, p_mind_change, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning version into v;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'judging_weights.saved', 'judging_weights', v::text,
          jsonb_build_object('panel', p_panel, 'peer', p_peer, 'ai_rubric', p_ai_rubric, 'mind_change', p_mind_change));
  return v;
end;
$$;

revoke execute on function public.save_judging_weights(integer, integer, integer, integer, text) from public, anon;
grant execute on function public.save_judging_weights(integer, integer, integer, integer, text) to authenticated;

alter table public.campaigns add column judging_weights_version integer references public.judging_weights (version);
grant select (judging_weights_version) on public.campaigns to anon, authenticated;

create or replace function public.lock_judging_weights()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'open' and new.judging_weights_version is null then
    select max(version) into new.judging_weights_version from public.judging_weights;
  end if;
  -- Once open, the version cannot change.
  if old.judging_weights_version is not null and new.judging_weights_version is distinct from old.judging_weights_version then
    raise exception 'WEIGHTS_LOCKED: judging weights are fixed once a Campaign opens' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.lock_judging_weights() from public, anon, authenticated;

create trigger campaigns_lock_judging_weights
  before update of status, judging_weights_version on public.campaigns
  for each row execute function public.lock_judging_weights();

create or replace function public.lock_judging_weights_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'open' and new.judging_weights_version is null then
    select max(version) into new.judging_weights_version from public.judging_weights;
  end if;
  return new;
end;
$$;

revoke execute on function public.lock_judging_weights_on_insert() from public, anon, authenticated;

create trigger campaigns_lock_judging_weights_insert
  before insert on public.campaigns
  for each row execute function public.lock_judging_weights_on_insert();

-- Campaigns already open take the defaults now.
update public.campaigns set judging_weights_version = 1 where status in ('open', 'closed') and judging_weights_version is null;

-- ---------------------------------------------------------------------------
-- Admin console: Strategists list
-- ---------------------------------------------------------------------------

create or replace function public.admin_strategists(p_query text default null, p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid,
  handle text,
  joined_at timestamptz,
  dispatch_count integer,
  reports_against integer,
  held_count integer,
  posting_muted_at timestamptz,
  posting_muted_reason text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: admins only' using errcode = '42501';
  end if;
  return query
  select p.id, p.handle, p.created_at,
         (select count(*)::integer from public.dispatches d where d.author_id = p.id),
         (select count(*)::integer from public.dispatch_reports r join public.dispatches d on d.id = r.dispatch_id where d.author_id = p.id),
         (select count(*)::integer from public.dispatches d where d.author_id = p.id and d.moderation_status in ('held', 'removed')),
         p.posting_muted_at, p.posting_muted_reason,
         count(*) over ()
  from public.profiles p
  where p.handle is not null
    and (q is null or p.handle ilike '%' || replace(replace(q, '%', '\%'), '_', '\_') || '%')
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.admin_strategists(text, integer, integer) from public, anon;
grant execute on function public.admin_strategists(text, integer, integer) to authenticated;
