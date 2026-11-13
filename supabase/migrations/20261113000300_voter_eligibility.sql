-- Sprint 7 batch 2a (W4): who may vote, confirm a steelman or pick a mind-changer.
--
-- Decided by the owner on 13 November: an account must be at least 48 hours old
-- (judging_settings.min_voter_account_age_hours, an admin setting, not a
-- constant) before its peer votes, steelman confirmations and mind-change picks
-- are accepted, measured from profiles.created_at at the moment of the action.
-- Panel judges assigned to the Campaign (judge_assignments) are EXEMPT from the
-- age rule: an admin chose them, so they are already vetted. A person may confirm
-- at most judging_settings.max_steelman_confirmations (default 3) steelmen in one
-- Campaign; the cap applies to everyone, judges included. The position-change
-- span for mind-change credit (min_position_span_hours, default 24) is applied
-- when the Verdict is computed (src/lib/judging/blend.ts), not here.
--
-- Also fixes a latent bug in the Sprint 5 version of save_judging_settings(): its UPDATE had no
-- WHERE clause, which Supabase's API layer refuses ("UPDATE requires a WHERE clause"), so
-- saving the judging settings from the admin page would have failed. It now says where id = true.
--
-- Backward compatible with the code on main: no function signature is removed or
-- changed (save_judging_settings gains three optional arguments with defaults,
-- so the existing five-argument call still works); the only new behaviour is two
-- new refusal messages (ACCOUNT_TOO_NEW, STEELMAN_LIMIT) that the old code shows
-- as its generic "That did not work" message.

alter table public.judging_settings
  add column min_voter_account_age_hours integer not null default 48 check (min_voter_account_age_hours between 0 and 720),
  add column max_steelman_confirmations integer not null default 3 check (max_steelman_confirmations between 1 and 20),
  add column min_position_span_hours integer not null default 24 check (min_position_span_hours between 0 and 720);

-- True when the account may take part in peer judging for this Campaign.
create or replace function public.voter_account_old_enough(p_user_id uuid, p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.judge_assignments a where a.campaign_id = p_campaign_id and a.judge_id = p_user_id)
      or exists (
        select 1 from public.profiles p, public.judging_settings s
        where p.id = p_user_id and p.created_at <= now() - make_interval(hours => s.min_voter_account_age_hours)
      );
$$;

revoke execute on function public.voter_account_old_enough(uuid, uuid) from public, anon, authenticated;

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
  min_age integer;
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
  if not public.voter_account_old_enough(uid, d.campaign_id) then
    select min_voter_account_age_hours into min_age from public.judging_settings;
    raise exception 'ACCOUNT_TOO_NEW: accounts must be at least % hours old before their votes count', min_age
      using errcode = '42501', detail = min_age::text;
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

create or replace function public.set_steelman_confirmation(p_dispatch_id uuid, p_confirmed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  d public.dispatches%rowtype;
  min_age integer;
  max_confirmations integer;
  used integer;
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
  if not public.voter_account_old_enough(uid, d.campaign_id) then
    select min_voter_account_age_hours into min_age from public.judging_settings;
    raise exception 'ACCOUNT_TOO_NEW: accounts must be at least % hours old before their confirmations count', min_age
      using errcode = '42501', detail = min_age::text;
  end if;
  if coalesce(p_confirmed, false) then
    -- One at a time per person, so two quick confirmations cannot both take the last place.
    perform pg_advisory_xact_lock(hashtext('tgs.steelman.' || uid::text));
    select max_steelman_confirmations into max_confirmations from public.judging_settings;
    select count(*) into used from public.steelman_flags where campaign_id = d.campaign_id and user_id = uid;
    if used >= max_confirmations and not exists (select 1 from public.steelman_flags where dispatch_id = d.id and user_id = uid) then
      raise exception 'STEELMAN_LIMIT: you can confirm at most % steelmen in one Campaign', max_confirmations
        using errcode = '42501', detail = max_confirmations::text;
    end if;
    insert into public.steelman_flags (campaign_id, dispatch_id, user_id) values (d.campaign_id, d.id, uid) on conflict do nothing;
  else
    delete from public.steelman_flags where dispatch_id = d.id and user_id = uid;
  end if;
end;
$$;

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
  min_age integer;
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
  if not public.voter_account_old_enough(uid, c.id) then
    select min_voter_account_age_hours into min_age from public.judging_settings;
    raise exception 'ACCOUNT_TOO_NEW: accounts must be at least % hours old before their picks count', min_age
      using errcode = '42501', detail = min_age::text;
  end if;
  insert into public.mind_change_picks (campaign_id, user_id, dispatch_id) values (c.id, uid, d.id)
  on conflict (campaign_id, user_id) do update set dispatch_id = excluded.dispatch_id;
end;
$$;

-- The three new settings, saved with the existing ones. The three new arguments
-- are optional (null keeps the current value), so the existing five-argument
-- call from the deployed code keeps working. Replacing the function needs a
-- drop, because the argument list changes.
drop function public.save_judging_settings(integer, integer, integer, integer, boolean);

create or replace function public.save_judging_settings(
  p_peer_window_hours integer,
  p_judging_window_hours integer,
  p_peer_vote_credits integer,
  p_appeal_window_days integer,
  p_ai_rationale_wording boolean,
  p_min_voter_account_age_hours integer default null,
  p_max_steelman_confirmations integer default null,
  p_min_position_span_hours integer default null
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
    ai_rationale_wording = coalesce(p_ai_rationale_wording, false),
    min_voter_account_age_hours = coalesce(p_min_voter_account_age_hours, min_voter_account_age_hours),
    max_steelman_confirmations = coalesce(p_max_steelman_confirmations, max_steelman_confirmations),
    min_position_span_hours = coalesce(p_min_position_span_hours, min_position_span_hours)
  where id = true;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'judging_settings.saved', 'judging_settings', 'true',
          jsonb_build_object('peer_window_hours', p_peer_window_hours, 'judging_window_hours', p_judging_window_hours,
                             'peer_vote_credits', p_peer_vote_credits, 'appeal_window_days', p_appeal_window_days,
                             'ai_rationale_wording', coalesce(p_ai_rationale_wording, false),
                             'min_voter_account_age_hours', p_min_voter_account_age_hours,
                             'max_steelman_confirmations', p_max_steelman_confirmations,
                             'min_position_span_hours', p_min_position_span_hours));
end;
$$;

revoke execute on function public.save_judging_settings(integer, integer, integer, integer, boolean, integer, integer, integer) from public, anon;
grant execute on function public.save_judging_settings(integer, integer, integer, integer, boolean, integer, integer, integer) to authenticated;
