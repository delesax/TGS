-- Legal hardening, Part 3: private positions need explicit consent.
--
-- A Strategist's before/after position on a Campaign can reveal political
-- opinion, which UK GDPR treats as special category data. So:
--   * Recording a position is optional and needs consent first
--     (profiles.positions_consent_at / positions_consent_version, written by
--     the server after the person ticks the box; not browser-writable).
--   * Posting a Dispatch no longer needs a position. The public For/Against
--     side of an Oxford-style Dispatch is chosen when posting (p_side) and is
--     no longer copied from the private record, so a private position is never
--     published.
--   * A Strategist can clear a position while the Campaign is open.
--   * withdraw_positions_consent() deletes open-Campaign positions, moves
--     closed-Campaign positions into anonymous_positions (no link to a person),
--     clears the consent and writes one audit entry. Service role only.
--   * consented_positions is the only thing the mind-change measure may read.

alter table public.profiles
  add column positions_consent_at timestamptz,
  add column positions_consent_version text check (char_length(positions_consent_version) <= 40);

comment on column public.profiles.positions_consent_at is 'When the person agreed to us recording their Campaign positions (explicit consent). Null = no consent, so no position can be recorded.';
comment on column public.profiles.positions_consent_version is 'Version of the privacy policy in force when they agreed.';

create or replace function public.has_positions_consent(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_user_id and positions_consent_at is not null);
$$;
revoke execute on function public.has_positions_consent(uuid) from public, anon;
grant execute on function public.has_positions_consent(uuid) to authenticated, service_role;

drop policy "Strategists can record their own position" on public.campaign_positions;
create policy "Strategists can record their own position"
  on public.campaign_positions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.handle is not null)
    and public.has_positions_consent((select auth.uid()))
  );

-- Clearing a position: only your own, only while the Campaign is open.
grant delete on public.campaign_positions to authenticated;
create policy "Strategists can clear their own position while the Campaign is open"
  on public.campaign_positions for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.campaigns c where c.id = campaign_id and c.status <> 'closed' and now() < c.ends_at)
  );

-- The only source for the mind-change measure: people who gave consent.
create view public.consented_positions
with (security_invoker = false) as
select cp.campaign_id, cp.user_id, cp.before_position, cp.after_position, cp.before_at, cp.after_at
from public.campaign_positions cp
join public.profiles p on p.id = cp.user_id
where p.positions_consent_at is not null;
revoke all on public.consented_positions from public, anon, authenticated;
grant select on public.consented_positions to service_role;
comment on view public.consented_positions is 'Positions of people who consented. The mind-change measure reads this view only. Server side (service role).';

create or replace function public.withdraw_positions_consent(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open integer;
  v_archived integer;
begin
  -- Closed Campaigns: keep the numbers, drop the link to the person.
  insert into public.anonymous_positions (campaign_id, before_position, after_position, before_at, after_at)
  select cp.campaign_id, cp.before_position, cp.after_position, cp.before_at, cp.after_at
  from public.campaign_positions cp join public.campaigns c on c.id = cp.campaign_id
  where cp.user_id = p_user_id and (c.status = 'closed' or now() >= c.ends_at)
    and exists (select 1 from public.profiles p where p.id = p_user_id and p.positions_consent_at is not null);
  get diagnostics v_archived = row_count;

  delete from public.campaign_positions cp
  using public.campaigns c
  where c.id = cp.campaign_id and cp.user_id = p_user_id and (c.status = 'closed' or now() >= c.ends_at);

  delete from public.campaign_positions where user_id = p_user_id;
  get diagnostics v_open = row_count;

  update public.profiles set positions_consent_at = null, positions_consent_version = null where id = p_user_id;

  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (p_user_id, 'positions.consent_withdrawn', 'profiles', p_user_id::text,
          jsonb_build_object('open_positions_deleted', v_open, 'closed_positions_unlinked', v_archived));

  return jsonb_build_object('open_positions_deleted', v_open, 'closed_positions_unlinked', v_archived);
end;
$$;
revoke execute on function public.withdraw_positions_consent(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_positions_consent(uuid) to service_role;

-- post_dispatch: new optional p_side. The old six-argument version is replaced.
drop function public.post_dispatch(uuid, public.dispatch_kind, text, public.ai_use_declaration, uuid, jsonb);

create or replace function public.post_dispatch(
  p_campaign_id uuid,
  p_kind public.dispatch_kind,
  p_body text,
  p_ai_use public.ai_use_declaration,
  p_parent_id uuid default null,
  p_sources jsonb default '[]'::jsonb,
  p_side public.position_choice default null
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

  -- Legal hardening: a Dispatch no longer needs, or copies, the private
  -- position record. In an Oxford-style Campaign each Dispatch argues one side,
  -- chosen here and shown publicly (the author publishes it). Everywhere else
  -- the Dispatch carries no side. A private position (campaign_positions) is
  -- never copied onto a Dispatch.
  if c.format = 'oxford' then
    if p_side is null or p_side = 'undecided' then
      raise exception 'POSITION_SIDE_REQUIRED: choose For or Against to post in an Oxford-style Campaign' using errcode = '42501';
    end if;
    pos := p_side;
  else
    pos := null;
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

revoke execute on function public.post_dispatch(uuid, public.dispatch_kind, text, public.ai_use_declaration, uuid, jsonb, public.position_choice) from public, anon;
grant execute on function public.post_dispatch(uuid, public.dispatch_kind, text, public.ai_use_declaration, uuid, jsonb, public.position_choice) to authenticated;
