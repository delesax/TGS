-- Sprint 2: rounds, before/after positions, audit of every Campaign change,
-- and scheduled open / round change / close with pg_cron.
-- Server time (Postgres now()) is the only clock.

-- ---------------------------------------------------------------------------
-- Campaigns: extra columns
-- ---------------------------------------------------------------------------

alter table public.campaigns
  -- Admin-only working notes, e.g. the intended setting for a topic whose
  -- format does not exist yet. Not shown to Strategists.
  add column notes text check (char_length(notes) <= 2000),
  -- Set by the topic loader when the owner must decide something before the
  -- Campaign can be scheduled. Scheduling is refused while it is set.
  add column needs_owner_decision text check (char_length(needs_owner_decision) <= 1000),
  -- Launch wave from the topic bank (1 runs first). Null for other Campaigns.
  add column wave smallint check (wave between 1 and 9),
  -- Background from the topic bank (arguments for and against, sources).
  -- Facts go stale, so this is not shown until the owner has refreshed it.
  add column brief jsonb not null default '{}'::jsonb,
  -- Position of the round that is running, kept up to date by campaign_tick().
  add column current_round smallint;

alter table public.campaigns
  add constraint campaigns_no_schedule_while_undecided
  check (status = 'draft' or needs_owner_decision is null);

-- ---------------------------------------------------------------------------
-- Rounds
-- ---------------------------------------------------------------------------

create table public.campaign_rounds (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  position smallint not null check (position between 1 and 10),
  title text not null check (char_length(title) between 1 and 80),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint campaign_rounds_ends_after_start check (ends_at > starts_at),
  constraint campaign_rounds_unique_position unique (campaign_id, position)
);

alter table public.campaign_rounds enable row level security;

-- Rounds must sit inside their Campaign's window. Checked when either side changes.
create or replace function public.check_round_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select starts_at, ends_at into c from public.campaigns where id = new.campaign_id;
  if new.starts_at < c.starts_at or new.ends_at > c.ends_at then
    raise exception 'ROUND_OUTSIDE_CAMPAIGN: round % must start and end within its Campaign', new.position
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger campaign_rounds_check_window
  before insert or update on public.campaign_rounds
  for each row execute function public.check_round_window();

create or replace function public.check_campaign_rounds_fit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.campaign_rounds r
    where r.campaign_id = new.id and (r.starts_at < new.starts_at or r.ends_at > new.ends_at)
  ) then
    raise exception 'ROUND_OUTSIDE_CAMPAIGN: every round must start and end within the Campaign'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create constraint trigger campaigns_rounds_fit
  after update of starts_at, ends_at on public.campaigns
  deferrable initially deferred
  for each row execute function public.check_campaign_rounds_fit();

create policy "Anyone can read rounds of Campaigns they can see"
  on public.campaign_rounds for select to anon, authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id));

create policy "Admins can create rounds"
  on public.campaign_rounds for insert to authenticated
  with check (public.is_admin());

create policy "Admins can update rounds"
  on public.campaign_rounds for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can remove rounds"
  on public.campaign_rounds for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Before and after positions (for the Sprint 5 mind-change measure)
-- ---------------------------------------------------------------------------

create type public.position_choice as enum ('for', 'against', 'undecided');

create table public.campaign_positions (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  before_position public.position_choice,
  after_position public.position_choice,
  before_at timestamptz,
  after_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, user_id),
  constraint campaign_positions_something_set check (before_position is not null or after_position is not null)
);

create index campaign_positions_user_idx on public.campaign_positions (user_id);

create trigger campaign_positions_set_updated_at
  before update on public.campaign_positions
  for each row execute function public.set_updated_at();

alter table public.campaign_positions enable row level security;

revoke all on public.campaign_positions from anon, authenticated;
grant select on public.campaign_positions to authenticated;
grant insert (campaign_id, user_id, before_position, after_position) on public.campaign_positions to authenticated;
grant update (before_position, after_position) on public.campaign_positions to authenticated;

-- Timing rules, by server time:
--   nothing can be recorded on a draft, or once the Campaign has closed;
--   the "after" position needs the Campaign to have started;
--   the "before" position is fixed once the Campaign has started.
create or replace function public.check_position_timing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  started boolean;
begin
  select status, starts_at, ends_at into c from public.campaigns where id = new.campaign_id;
  if c.status = 'draft' or c.status = 'closed' or now() >= c.ends_at then
    raise exception 'POSITION_LOCKED: positions cannot be recorded for this Campaign now' using errcode = '42501';
  end if;
  started := c.status = 'open' or now() >= c.starts_at;

  if new.after_position is not null and not started then
    raise exception 'POSITION_TOO_EARLY: the after position opens when the Campaign starts' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.before_position is not null and started then
      raise exception 'POSITION_BEFORE_LOCKED: the before position closes when the Campaign starts' using errcode = '42501';
    end if;
  else
    if new.before_position is distinct from old.before_position and started then
      raise exception 'POSITION_BEFORE_LOCKED: the before position closes when the Campaign starts' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' or new.before_position is distinct from old.before_position then
    new.before_at := case when new.before_position is null then null else now() end;
  end if;
  if tg_op = 'INSERT' or new.after_position is distinct from old.after_position then
    new.after_at := case when new.after_position is null then null else now() end;
  end if;
  return new;
end;
$$;

create trigger campaign_positions_check_timing
  before insert or update on public.campaign_positions
  for each row execute function public.check_position_timing();

create policy "Strategists can read their own positions"
  on public.campaign_positions for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy "Strategists can record their own position"
  on public.campaign_positions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.handle is not null)
  );

create policy "Strategists can change their own position"
  on public.campaign_positions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- No delete policy: a recorded position is kept for the mind-change measure.

-- ---------------------------------------------------------------------------
-- Audit every Campaign and round change
-- ---------------------------------------------------------------------------

create or replace function public.audit_campaign_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id uuid;
  campaign uuid;
  changes jsonb := '{}'::jsonb;
  key text;
begin
  -- Scheduled transitions are logged by campaign_tick() with their own action names.
  if current_setting('tgs.scheduler', true) = 'on' then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    for key in select jsonb_object_keys(to_jsonb(new)) loop
      if key not in ('updated_at') and to_jsonb(new) -> key is distinct from to_jsonb(old) -> key then
        changes := changes || jsonb_build_object(key, to_jsonb(new) -> key);
      end if;
    end loop;
    if changes = '{}'::jsonb then
      return new;
    end if;
  end if;

  if tg_table_name = 'campaigns' then
    row_id := coalesce(new.id, old.id);
    campaign := row_id;
  else
    row_id := coalesce(new.id, old.id);
    campaign := coalesce(new.campaign_id, old.campaign_id);
  end if;

  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (
    auth.uid(),
    (case tg_table_name when 'campaigns' then 'campaign' else 'campaign_round' end) || '.' ||
      (case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'removed' end),
    tg_table_name,
    row_id::text,
    case tg_op
      when 'INSERT' then jsonb_build_object('campaign_id', campaign, 'values', to_jsonb(new) - 'brief')
      when 'UPDATE' then jsonb_build_object('campaign_id', campaign, 'changed', changes - 'brief')
      else jsonb_build_object('campaign_id', campaign, 'values', to_jsonb(old))
    end
  );
  return coalesce(new, old);
end;
$$;

revoke execute on function public.audit_campaign_change() from public, anon, authenticated;

create trigger campaigns_audit
  after insert or update on public.campaigns
  for each row execute function public.audit_campaign_change();

create trigger campaign_rounds_audit
  after insert or update or delete on public.campaign_rounds
  for each row execute function public.audit_campaign_change();

-- ---------------------------------------------------------------------------
-- Save a Campaign with its rounds in one transaction (admin form)
-- ---------------------------------------------------------------------------

-- security invoker: the caller's row-level security applies, so only admins succeed.
create or replace function public.save_campaign(p_id uuid, p_campaign jsonb, p_rounds jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id uuid;
  r jsonb;
  pos smallint := 0;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can save Campaigns' using errcode = '42501';
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
      -- The form offers draft or scheduled. Editing a running or closed
      -- Campaign keeps its status; the scheduler owns those transitions.
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

  -- Rounds: replace by position. Unchanged rounds are not rewritten (no audit noise).
  for r in select * from jsonb_array_elements(coalesce(p_rounds, '[]'::jsonb)) loop
    pos := pos + 1;
    insert into public.campaign_rounds (campaign_id, position, title, starts_at, ends_at)
    values (saved_id, pos, r ->> 'title', (r ->> 'starts_at')::timestamptz, (r ->> 'ends_at')::timestamptz)
    on conflict (campaign_id, position) do update
      set title = excluded.title, starts_at = excluded.starts_at, ends_at = excluded.ends_at
      where (campaign_rounds.title, campaign_rounds.starts_at, campaign_rounds.ends_at)
        is distinct from (excluded.title, excluded.starts_at, excluded.ends_at);
  end loop;
  delete from public.campaign_rounds where campaign_id = saved_id and position > pos;

  return saved_id;
end;
$$;

revoke execute on function public.save_campaign(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_campaign(uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Scheduler: open, change round and close by server time
-- ---------------------------------------------------------------------------

-- Idempotent: running it twice in the same minute changes nothing the second time.
-- Every transition is written to audit_log with actor_id null (the system).
create or replace function public.campaign_tick()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  next_status public.campaign_status;
  next_round smallint;
  changed integer := 0;
begin
  perform set_config('tgs.scheduler', 'on', true);

  for c in
    select id, status, starts_at, ends_at, current_round
    from public.campaigns
    where status in ('scheduled', 'open')
    for update skip locked
  loop
    next_status := case
      when now() >= c.ends_at then 'closed'::public.campaign_status
      when now() >= c.starts_at then 'open'::public.campaign_status
      else c.status
    end;

    select r.position into next_round
    from public.campaign_rounds r
    where r.campaign_id = c.id and r.starts_at <= now() and now() < r.ends_at
    order by r.position
    limit 1;
    if next_status = 'closed' then
      next_round := null;
    end if;

    if next_status is distinct from c.status or next_round is distinct from c.current_round then
      update public.campaigns set status = next_status, current_round = next_round where id = c.id;
      changed := changed + 1;

      if next_status is distinct from c.status then
        insert into public.audit_log (actor_id, action, target_table, target_id, details)
        values (null, 'campaign.' || case next_status when 'open' then 'opened' else 'closed' end,
                'campaigns', c.id::text,
                jsonb_build_object('from', c.status, 'to', next_status, 'scheduled_for',
                  case next_status when 'open' then c.starts_at else c.ends_at end));
      end if;
      if next_round is distinct from c.current_round then
        insert into public.audit_log (actor_id, action, target_table, target_id, details)
        values (null, 'campaign.round_changed', 'campaigns', c.id::text,
                jsonb_build_object('from', c.current_round, 'to', next_round));
      end if;
    end if;
  end loop;

  return changed;
end;
$$;

revoke execute on function public.campaign_tick() from public, anon, authenticated;

-- Every minute, on the minute. pg_cron is included on every Supabase plan.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('campaign-tick', '* * * * *', 'select public.campaign_tick()');

-- The server's clock, for the countdown.
create or replace function public.server_now()
returns timestamptz
language sql
stable
set search_path = ''
as $$ select now() $$;

grant execute on function public.server_now() to anon, authenticated;
