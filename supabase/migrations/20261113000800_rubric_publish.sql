-- Rule 7 (CLAUDE.md): "Publish the rubric before a Campaign opens."
--
-- Until now campaigns.rubric_published_at existed but nothing set or checked it, and the public Campaign
-- page did not show how a Campaign is judged. This migration adds:
--   * publish_campaign_rubric(p_campaign_id): admin only. Sets rubric_published_at (once) and pins the CURRENT
--     judging weights version to the Campaign (judging_weights_version, previously pinned only when the
--     Campaign opened), so what was published is what is used. Writes an audit_log row. Publishing again
--     changes nothing and writes nothing. A closed Campaign cannot have its rubric published.
--   * save_campaign(): same signature and body as the version in 20261103000200, plus one guard: a change INTO
--     status 'scheduled' (or creating a Campaign as scheduled) is refused with RUBRIC_NOT_PUBLISHED unless the
--     rubric has been published. Campaigns already scheduled, open or closed are not affected, so nothing that
--     exists today changes, and no status or rubric_published_at value is changed or backfilled here.
--
-- Backward compatible with the code on main: no signature changes. The ONE behaviour change is intended: the
-- admin form on main cannot schedule a draft until its rubric is published (it shows its generic "We could not
-- save the Campaign" message until the new code is deployed). Direct inserts by the service role (tests, seed
-- scripts) are not affected: the guard lives in save_campaign, not in a trigger.

create or replace function public.publish_campaign_rubric(p_campaign_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.campaigns%rowtype;
  published timestamptz;
  pinned integer;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can publish a rubric' using errcode = '42501';
  end if;
  select * into c from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'NOT_FOUND: Campaign not found' using errcode = 'P0002';
  end if;
  if c.rubric_published_at is not null then
    return c.rubric_published_at;
  end if;
  if c.status = 'closed' then
    raise exception 'CAMPAIGN_CLOSED: a closed Campaign cannot have its rubric published' using errcode = '22023';
  end if;
  pinned := coalesce(c.judging_weights_version, (select max(version) from public.judging_weights));
  update public.campaigns
  set rubric_published_at = now(), judging_weights_version = pinned
  where id = c.id
  returning rubric_published_at into published;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'campaign.rubric_published', 'campaigns', c.id::text,
          jsonb_build_object('judging_weights_version', pinned, 'status', c.status));
  return published;
end;
$$;

revoke execute on function public.publish_campaign_rubric(uuid) from public, anon;
grant execute on function public.publish_campaign_rubric(uuid) to authenticated;

create or replace function public.save_campaign(p_id uuid, p_campaign jsonb, p_rounds jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id uuid;
  cur_status public.campaign_status;
  cur_rubric timestamptz;
  r jsonb;
  pos smallint := 0;
  kinds public.dispatch_kind[];
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can save Campaigns' using errcode = '42501';
  end if;

  -- Rule 7 (rubric published before a Campaign opens): a Campaign cannot be scheduled until its rubric has
  -- been published (publish_campaign_rubric). Only a change INTO "scheduled" is refused: a Campaign that is
  -- already scheduled, open or closed keeps working and can still be edited.
  if p_campaign ->> 'status' = 'scheduled' then
    if p_id is null then
      raise exception 'RUBRIC_NOT_PUBLISHED: save the Campaign as a draft, publish its rubric, then schedule it' using errcode = '22023';
    end if;
    select c.status, c.rubric_published_at into cur_status, cur_rubric from public.campaigns c where c.id = p_id;
    if found and cur_status not in ('scheduled', 'open', 'closed') and cur_rubric is null then
      raise exception 'RUBRIC_NOT_PUBLISHED: publish the rubric before scheduling this Campaign' using errcode = '22023';
    end if;
  end if;

  if p_id is null then
    insert into public.campaigns (
      slug, title, summary, rules, category, format, status, starts_at, ends_at,
      is_sensitive, content_note, opinion_not_advice, notes, created_by
    ) values (
      p_campaign ->> 'slug', p_campaign ->> 'title', p_campaign ->> 'summary', p_campaign ->> 'rules',
      (p_campaign ->> 'category')::public.campaign_category, (p_campaign ->> 'format')::public.campaign_format,
      (p_campaign ->> 'status')::public.campaign_status,
      (p_campaign ->> 'starts_at')::timestamptz, (p_campaign ->> 'ends_at')::timestamptz,
      (p_campaign ->> 'is_sensitive')::boolean, p_campaign ->> 'content_note',
      (p_campaign ->> 'opinion_not_advice')::boolean, p_campaign ->> 'notes', auth.uid()
    )
    returning id into saved_id;
  else
    update public.campaigns set
      slug = p_campaign ->> 'slug',
      title = p_campaign ->> 'title',
      summary = p_campaign ->> 'summary',
      rules = p_campaign ->> 'rules',
      category = (p_campaign ->> 'category')::public.campaign_category,
      format = (p_campaign ->> 'format')::public.campaign_format,
      status = case
        when campaigns.status in ('open', 'closed') and p_campaign ->> 'status' = 'scheduled' then campaigns.status
        else (p_campaign ->> 'status')::public.campaign_status
      end,
      starts_at = (p_campaign ->> 'starts_at')::timestamptz,
      ends_at = (p_campaign ->> 'ends_at')::timestamptz,
      is_sensitive = (p_campaign ->> 'is_sensitive')::boolean,
      content_note = p_campaign ->> 'content_note',
      opinion_not_advice = (p_campaign ->> 'opinion_not_advice')::boolean,
      notes = p_campaign ->> 'notes'
    where id = p_id
    returning id into saved_id;
    if saved_id is null then
      raise exception 'NOT_FOUND: Campaign not found' using errcode = 'P0002';
    end if;
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_rounds, '[]'::jsonb)) loop
    pos := pos + 1;
    kinds := coalesce(
      (select array_agg(k::public.dispatch_kind) from jsonb_array_elements_text(r -> 'allowed_kinds') as k),
      '{argument,rebuttal,evidence}'::public.dispatch_kind[]
    );
    insert into public.campaign_rounds (campaign_id, position, title, starts_at, ends_at, allowed_kinds)
    values (saved_id, pos, r ->> 'title', (r ->> 'starts_at')::timestamptz, (r ->> 'ends_at')::timestamptz, kinds)
    on conflict (campaign_id, position) do update
      set title = excluded.title, starts_at = excluded.starts_at, ends_at = excluded.ends_at, allowed_kinds = excluded.allowed_kinds
      where (campaign_rounds.title, campaign_rounds.starts_at, campaign_rounds.ends_at, campaign_rounds.allowed_kinds)
        is distinct from (excluded.title, excluded.starts_at, excluded.ends_at, excluded.allowed_kinds);
  end loop;
  delete from public.campaign_rounds where campaign_id = saved_id and position > pos;

  return saved_id;
end;
$$;

revoke execute on function public.save_campaign(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_campaign(uuid, jsonb, jsonb) to authenticated;
