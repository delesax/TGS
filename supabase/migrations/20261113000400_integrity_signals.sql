-- Sprint 7 batch 2a (W5): integrity signals. READ-ONLY flags for human review.
--
-- Decided by the owner on 13 November: signals only. Nothing here changes a
-- score, a weight, an account or a vote; no IP address is stored or used.
-- Seven signals (docs/SPRINT_7_PLAN.md, AG-10):
--   1 vote_concentration   a voter sent at least 80% of at least 3 votes to one author
--   2 mutual_votes         two voters each voted for the other's Dispatch
--   3 shared_targets       two voters share at least 3 voted Dispatches
--   4 burst_votes          at least 4 votes by one voter inside 10 seconds
--   5 invite_burst         at least 3 accounts created within 10 minutes on one invite
--   6 email_family         accounts whose email is the same mailbox once "+tags" (and
--                          dots for Gmail) are removed; only a count is shown, never an address
--   7 reciprocal_picks / steelman_concentration / reciprocal_steelman
--                          mind-change picks or steelman confirmations that point at each other,
--                          or one person confirming only one author at least 3 times
--
-- integrity_signals() is for the server (service role). admin_integrity_signals()
-- is the admin-only read for the page /admin/signals. judging_inputs() is replaced
-- (same signature) to add three keys the new blend code reads: 'integrity' (the
-- Campaign's signals), picker reputation, and the before/after times of positions.
-- Additive: code on main ignores the extra keys, so this is safe to apply first.

create or replace function public.integrity_signals(p_campaign_id uuid default null, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
  out jsonb := '[]'::jsonb;
  part jsonb;
begin
  -- 1. vote concentration
  with scope as (
    select c.id from public.campaigns c
    where (p_campaign_id is not null and c.id = p_campaign_id) or (p_campaign_id is null and c.status <> 'draft' and c.ends_at > since)
  ), v as (
    select pv.campaign_id, pv.voter_id, d.author_id
    from public.peer_votes pv join public.dispatches d on d.id = pv.dispatch_id join scope s on s.id = pv.campaign_id
  ), per as (select campaign_id, voter_id, count(*) as total from v group by 1, 2),
  tops as (select campaign_id, voter_id, author_id, count(*) as n from v group by 1, 2, 3)
  select coalesce(jsonb_agg(jsonb_build_object('code', 'vote_concentration', 'campaign_id', t.campaign_id,
           'users', jsonb_build_array(t.voter_id, t.author_id),
           'detail', format('%s of %s votes from one voter went to one author', t.n, p.total))), '[]'::jsonb)
  into part
  from tops t join per p on p.campaign_id = t.campaign_id and p.voter_id = t.voter_id
  where p.total >= 3 and t.n::numeric / p.total >= 0.8;
  out := out || part;

  -- 2. mutual votes
  with scope as (
    select c.id from public.campaigns c
    where (p_campaign_id is not null and c.id = p_campaign_id) or (p_campaign_id is null and c.status <> 'draft' and c.ends_at > since)
  ), v as (
    select pv.campaign_id, pv.voter_id, d.author_id
    from public.peer_votes pv join public.dispatches d on d.id = pv.dispatch_id join scope s on s.id = pv.campaign_id
  )
  select coalesce(jsonb_agg(distinct jsonb_build_object('code', 'mutual_votes', 'campaign_id', a.campaign_id,
           'users', jsonb_build_array(a.voter_id, b.voter_id), 'detail', 'Each voted for a Dispatch written by the other')), '[]'::jsonb)
  into part
  from v a join v b on a.campaign_id = b.campaign_id and a.voter_id = b.author_id and a.author_id = b.voter_id and a.voter_id < b.voter_id;
  out := out || part;

  -- 3. voters who share at least three voted Dispatches
  with scope as (
    select c.id from public.campaigns c
    where (p_campaign_id is not null and c.id = p_campaign_id) or (p_campaign_id is null and c.status <> 'draft' and c.ends_at > since)
  ), shared as (
    select a.campaign_id, a.voter_id as v1, b.voter_id as v2, count(*) as n
    from public.peer_votes a join public.peer_votes b on b.dispatch_id = a.dispatch_id and a.voter_id < b.voter_id
    join scope s on s.id = a.campaign_id
    group by 1, 2, 3 having count(*) >= 3
  )
  select coalesce(jsonb_agg(jsonb_build_object('code', 'shared_targets', 'campaign_id', campaign_id,
           'users', jsonb_build_array(v1, v2), 'detail', format('The two voted for the same %s Dispatches', n))), '[]'::jsonb)
  into part from shared;
  out := out || part;

  -- 4. bursts of votes
  with scope as (
    select c.id from public.campaigns c
    where (p_campaign_id is not null and c.id = p_campaign_id) or (p_campaign_id is null and c.status <> 'draft' and c.ends_at > since)
  ), b as (
    select x.campaign_id, x.voter_id,
           (select count(*) from public.peer_votes y
            where y.campaign_id = x.campaign_id and y.voter_id = x.voter_id
              and y.created_at >= x.created_at and y.created_at <= x.created_at + interval '10 seconds') as n
    from public.peer_votes x join scope s on s.id = x.campaign_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('code', 'burst_votes', 'campaign_id', campaign_id,
           'users', jsonb_build_array(voter_id), 'detail', format('%s votes within 10 seconds', top))), '[]'::jsonb)
  into part
  from (select campaign_id, voter_id, max(n) as top from b group by 1, 2 having max(n) >= 4) f;
  out := out || part;

  -- 5. accounts created in a burst on one invite (account level)
  with who as (
    select p.id, p.invite_id, p.created_at from public.profiles p
    where p.invite_id is not null and p.deleted_at is null and p.created_at > since
      and (p_campaign_id is null
           or p.id in (select author_id from public.dispatches where campaign_id = p_campaign_id
                       union select voter_id from public.peer_votes where campaign_id = p_campaign_id
                       union select user_id from public.mind_change_picks where campaign_id = p_campaign_id
                       union select user_id from public.steelman_flags where campaign_id = p_campaign_id))
  ), w as (
    select a.invite_id, (select count(*) from who b where b.invite_id = a.invite_id and b.created_at >= a.created_at
                         and b.created_at <= a.created_at + interval '10 minutes') as n
    from who a
  ), flagged as (select invite_id, max(n) as top from w group by 1 having max(n) >= 3)
  select coalesce(jsonb_agg(jsonb_build_object('code', 'invite_burst', 'invite_id', f.invite_id,
           'users', (select jsonb_agg(x.id) from who x where x.invite_id = f.invite_id),
           'detail', format('%s accounts created within 10 minutes on one invite', f.top))), '[]'::jsonb)
  into part from flagged f;
  out := out || part;

  -- 6. accounts that are one mailbox (account level). Only a count is reported.
  with fam as (
    select p.id,
           case when split_part(lower(u.email), '@', 2) in ('gmail.com', 'googlemail.com')
                then replace(regexp_replace(split_part(lower(u.email), '@', 1), '\+.*$', ''), '.', '') || '@gmail.com'
                else regexp_replace(split_part(lower(u.email), '@', 1), '\+.*$', '') || '@' || split_part(lower(u.email), '@', 2) end as k
    from public.profiles p join auth.users u on u.id = p.id
    where p.deleted_at is null and u.email is not null
      and (p_campaign_id is null
           or p.id in (select author_id from public.dispatches where campaign_id = p_campaign_id
                       union select voter_id from public.peer_votes where campaign_id = p_campaign_id
                       union select user_id from public.mind_change_picks where campaign_id = p_campaign_id
                       union select user_id from public.steelman_flags where campaign_id = p_campaign_id))
  )
  select coalesce(jsonb_agg(jsonb_build_object('code', 'email_family', 'users', ids,
           'detail', format('%s accounts share one mailbox once +tags and Gmail dots are removed', n))), '[]'::jsonb)
  into part
  from (select count(*) as n, jsonb_agg(id) as ids from fam group by k having count(*) >= 2) g;
  out := out || part;

  -- 7a. reciprocal mind-change picks
  with scope as (
    select c.id from public.campaigns c
    where (p_campaign_id is not null and c.id = p_campaign_id) or (p_campaign_id is null and c.status <> 'draft' and c.ends_at > since)
  ), pk as (
    select m.campaign_id, m.user_id, d.author_id from public.mind_change_picks m
    join public.dispatches d on d.id = m.dispatch_id join scope s on s.id = m.campaign_id
  )
  select coalesce(jsonb_agg(distinct jsonb_build_object('code', 'reciprocal_picks', 'campaign_id', a.campaign_id,
           'users', jsonb_build_array(a.user_id, b.user_id), 'detail', 'Each picked the other as the Dispatch that changed their mind')), '[]'::jsonb)
  into part
  from pk a join pk b on a.campaign_id = b.campaign_id and a.user_id = b.author_id and a.author_id = b.user_id and a.user_id < b.user_id;
  out := out || part;

  -- 7b. one person confirming only one author's steelmen, at least three times
  with scope as (
    select c.id from public.campaigns c
    where (p_campaign_id is not null and c.id = p_campaign_id) or (p_campaign_id is null and c.status <> 'draft' and c.ends_at > since)
  ), sf as (
    select f.campaign_id, f.user_id, d.author_id from public.steelman_flags f
    join public.dispatches d on d.id = f.dispatch_id join scope s on s.id = f.campaign_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('code', 'steelman_concentration', 'campaign_id', campaign_id,
           'users', jsonb_build_array(user_id, author_id), 'detail', format('%s steelman confirmations, all for one author', n))), '[]'::jsonb)
  into part
  from (select campaign_id, user_id, min(author_id::text)::uuid as author_id, count(*) as n
        from sf group by 1, 2 having count(*) >= 3 and count(distinct author_id) = 1) g;
  out := out || part;

  -- 7c. reciprocal steelman confirmations
  with scope as (
    select c.id from public.campaigns c
    where (p_campaign_id is not null and c.id = p_campaign_id) or (p_campaign_id is null and c.status <> 'draft' and c.ends_at > since)
  ), sf as (
    select f.campaign_id, f.user_id, d.author_id from public.steelman_flags f
    join public.dispatches d on d.id = f.dispatch_id join scope s on s.id = f.campaign_id
  )
  select coalesce(jsonb_agg(distinct jsonb_build_object('code', 'reciprocal_steelman', 'campaign_id', a.campaign_id,
           'users', jsonb_build_array(a.user_id, b.user_id), 'detail', 'Each confirmed a steelman written by the other')), '[]'::jsonb)
  into part
  from sf a join sf b on a.campaign_id = b.campaign_id and a.user_id = b.author_id and a.author_id = b.user_id and a.user_id < b.user_id;
  out := out || part;

  return out;
end;
$$;

revoke execute on function public.integrity_signals(uuid, integer) from public, anon, authenticated;
grant execute on function public.integrity_signals(uuid, integer) to service_role;

-- Admin only: the signals with the handles and Campaign titles the page needs.
create or replace function public.admin_integrity_signals(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sig jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can read integrity signals' using errcode = '42501';
  end if;
  sig := public.integrity_signals(null, p_days);
  return jsonb_build_object(
    'generated_at', now(),
    'days', least(greatest(coalesce(p_days, 30), 1), 365),
    'signals', sig,
    'handles', coalesce((
      select jsonb_object_agg(p.id, p.handle)
      from public.profiles p
      where p.id in (select distinct (jsonb_array_elements_text(s -> 'users'))::uuid from jsonb_array_elements(sig) s)
    ), '{}'::jsonb),
    'campaigns', coalesce((
      select jsonb_object_agg(c.id, jsonb_build_object('slug', c.slug, 'title', c.title))
      from public.campaigns c
      where c.id in (select distinct (s ->> 'campaign_id')::uuid from jsonb_array_elements(sig) s where s ->> 'campaign_id' is not null)
    ), '{}'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_integrity_signals(integer) from public, anon;
grant execute on function public.admin_integrity_signals(integer) to authenticated;

-- judging_inputs(): the same read as before, plus 'integrity', the reputation of
-- people who made a mind-change pick (as well as voters), and when each person's
-- before and after positions were recorded. Same signature and same grants.
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
      where r.user_id in (select voter_id from public.peer_votes where campaign_id = p_campaign_id
                          union select user_id from public.mind_change_picks where campaign_id = p_campaign_id)), '{}'::jsonb),
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
      select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'before', p.before_position, 'after', p.after_position,
                                          'before_at', cp.before_at, 'after_at', cp.after_at))
      from public.judging_positions(p_campaign_id) p
      left join public.campaign_positions cp on cp.campaign_id = p_campaign_id and cp.user_id = p.user_id), '[]'::jsonb),
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
    'peer_window_open', public.peer_window_open(p_campaign_id),
    'integrity', public.integrity_signals(p_campaign_id, 30)
  );
$$;
