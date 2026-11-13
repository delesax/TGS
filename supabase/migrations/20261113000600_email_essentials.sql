-- Sprint 7 batch 2a (W15): app email cut to essentials, with a global daily cap.
--
-- Decided by the owner on 13 November (D2): keep headroom for Supabase's own
-- sign-up and reset emails inside Resend's free quota, so the app queues only
-- essential email and no more than a global daily total. community_settings
-- already had a PER-PERSON daily cap (email_daily_cap, default 6) and the reply
-- digest delay; this adds three private settings:
--   * email_essentials_only (default ON): only the kinds listed in
--     email_essential_kinds are queued; the others are not queued at all;
--   * email_essential_kinds: moderation_outcome, verdict_published,
--     verdict_appeal_outcome, judge_assigned, peer_voting_open. (Changing the list
--     later is one SQL update, no deploy.) Cut: reply, campaign_opened,
--     campaign_round_changed, campaign_closed, campaign_closing_soon;
--   * email_global_daily_cap (default 60): the most app emails sent in a UK day.
-- Nothing is left queued forever: when the setting is switched on, queued mail of
-- a cut kind is marked skipped the next time the processor runs; when the daily
-- cap is reached, cut kinds still due are marked skipped and essential ones wait
-- until after midnight (UK).
--
-- Backward compatible with the code on main: enqueue_email() and
-- claim_email_batch() keep their signatures and return types. The deployed
-- processor needs no change. The effect starts the moment the migration is applied.

alter table public.community_settings
  add column email_essentials_only boolean not null default true,
  add column email_essential_kinds text[] not null default array['moderation_outcome', 'verdict_published', 'verdict_appeal_outcome', 'judge_assigned', 'peer_voting_open'],
  add column email_global_daily_cap integer not null default 60 check (email_global_daily_cap between 0 and 2000);

create or replace function public.enqueue_email(p_user_id uuid, p_kind text, p_payload jsonb, p_dedupe_key text, p_send_after timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  essentials boolean;
  kinds text[];
begin
  select email_essentials_only, email_essential_kinds into essentials, kinds from public.community_settings;
  if essentials and not (p_kind = any (kinds)) then
    return;
  end if;
  insert into public.email_outbox (user_id, kind, payload, dedupe_key, send_after)
  values (p_user_id, p_kind, p_payload, p_dedupe_key, coalesce(p_send_after, now()))
  on conflict (dedupe_key) do nothing;
end;
$$;

revoke execute on function public.enqueue_email(uuid, text, jsonb, text, timestamptz) from public, anon, authenticated;

create or replace function public.claim_email_batch(p_limit integer default 100)
returns setof public.email_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  essentials boolean;
  kinds text[];
  cap integer;
  day_start timestamptz := (public.uk_today())::timestamp at time zone 'Europe/London';
  used integer;
  room integer;
begin
  select email_essentials_only, email_essential_kinds, email_global_daily_cap into essentials, kinds, cap from public.community_settings;

  -- Mail of a kind that is no longer essential is skipped, not left to wait.
  if essentials then
    update public.email_outbox set status = 'skipped', last_error = 'not_essential'
    where status = 'queued' and not (kind = any (kinds));
  end if;

  -- The global daily cap counts rows sent or being sent today (UK time).
  select count(*) into used from public.email_outbox
  where (status = 'sent' and sent_at >= day_start) or (status = 'sending' and locked_at >= day_start);
  room := cap - used;
  if room <= 0 then
    update public.email_outbox set status = 'skipped', last_error = 'global_daily_cap'
    where status = 'queued' and send_after <= now() and not (kind = any (kinds));
    update public.email_outbox set send_after = day_start + interval '1 day 5 minutes'
    where status = 'queued' and send_after <= now() and kind = any (kinds);
    return;
  end if;

  return query
  with picked as (
    select id from public.email_outbox
    where (status = 'queued' and send_after <= now())
       or (status = 'sending' and locked_at < now() - interval '10 minutes')
    order by (kind = any (kinds)) desc, id
    limit least(greatest(coalesce(p_limit, 100), 1), 500, room)
    for update skip locked
  ), u as (
    update public.email_outbox o
    set status = 'sending', locked_at = now(), attempts = o.attempts + 1
    where o.id in (select id from picked)
    returning o.*
  )
  select * from u;
end;
$$;

revoke execute on function public.claim_email_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_email_batch(integer) to service_role;

-- Admin only, with a reason and an audit entry (like set_site_switches).
create or replace function public.set_email_controls(p_essentials_only boolean, p_global_daily_cap integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  before public.community_settings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can change the email controls' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'REASON_REQUIRED: give a reason of up to 500 characters' using errcode = '22023';
  end if;
  if p_essentials_only is null or p_global_daily_cap is null or p_global_daily_cap < 0 or p_global_daily_cap > 2000 then
    raise exception 'BAD_INPUT: choose on or off, and a daily cap from 0 to 2000' using errcode = '22023';
  end if;
  select * into before from public.community_settings;
  update public.community_settings
  set email_essentials_only = p_essentials_only, email_global_daily_cap = p_global_daily_cap
  where id = true;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'site.email_controls_changed', 'community_settings', null,
          jsonb_build_object(
            'email_essentials_only', jsonb_build_array(before.email_essentials_only, p_essentials_only),
            'email_global_daily_cap', jsonb_build_array(before.email_global_daily_cap, p_global_daily_cap),
            'reason', v_reason));
end;
$$;

revoke execute on function public.set_email_controls(boolean, integer, text) from public, anon;
grant execute on function public.set_email_controls(boolean, integer, text) to authenticated;
