-- Sprint 3: Dispatches and discussion.
--
-- Extends the Sprint 1 `dispatches` table rather than replacing it. Adds:
--   * community_settings: admin-editable limits (lengths, rate limits, edit window)
--   * Dispatch rules, threading, edits with history, withdraw and hide that keep
--     the original content (sealed, never deleted)
--   * post_dispatch(), edit_dispatch(), withdraw_dispatch() and the admin
--     hide_dispatch() / restore_dispatch(). Browsers can no longer insert or
--     update Dispatches directly.
--   * Reactions (a fixed, admin-editable set), follows, reports
--   * Full-text search over Campaigns, Dispatches and handles
-- No table, column or row is dropped. Two Sprint 1 policies are switched off
-- with ALTER POLICY (their names say so) because posting now goes through
-- post_dispatch().

-- ---------------------------------------------------------------------------
-- Settings (one row, admins edit)
-- ---------------------------------------------------------------------------

create table public.community_settings (
  id boolean primary key default true check (id),
  argument_max_chars integer not null default 1500 check (argument_max_chars between 100 and 5000),
  rebuttal_max_chars integer not null default 1000 check (rebuttal_max_chars between 100 and 5000),
  evidence_max_chars integer not null default 600 check (evidence_max_chars between 100 and 5000),
  max_dispatches_per_round integer not null default 10 check (max_dispatches_per_round between 1 and 100),
  cooldown_seconds integer not null default 30 check (cooldown_seconds between 0 and 3600),
  edit_window_seconds integer not null default 300 check (edit_window_seconds between 0 and 86400),
  -- Email (used by the notification processor)
  email_daily_cap integer not null default 6 check (email_daily_cap between 1 and 50),
  reply_digest_minutes integer not null default 10 check (reply_digest_minutes between 0 and 1440),
  updated_at timestamptz not null default now()
);

comment on table public.community_settings is
  'Limits for Dispatches and email. Defaults are recommendations awaiting owner sign-off; admins can change them without a release.';

insert into public.community_settings default values;

create trigger community_settings_set_updated_at
  before update on public.community_settings
  for each row execute function public.set_updated_at();

alter table public.community_settings enable row level security;

revoke all on public.community_settings from anon, authenticated;
grant select on public.community_settings to anon, authenticated;
grant update (
  argument_max_chars, rebuttal_max_chars, evidence_max_chars, max_dispatches_per_round,
  cooldown_seconds, edit_window_seconds, email_daily_cap, reply_digest_minutes
) on public.community_settings to authenticated;

create policy "Anyone can read the community settings"
  on public.community_settings for select to anon, authenticated
  using (true);

create policy "Admins can change the community settings"
  on public.community_settings for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.audit_settings_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'settings.updated', tg_table_name, null,
          jsonb_build_object('before', to_jsonb(old) - 'updated_at', 'after', to_jsonb(new) - 'updated_at'));
  return new;
end;
$$;

revoke execute on function public.audit_settings_change() from public, anon, authenticated;

create trigger community_settings_audit
  after update on public.community_settings
  for each row execute function public.audit_settings_change();

-- ---------------------------------------------------------------------------
-- Rounds say which kinds of Dispatch they accept
-- ---------------------------------------------------------------------------

alter table public.campaign_rounds
  add column allowed_kinds public.dispatch_kind[] not null default '{argument,rebuttal,evidence}'
    check (cardinality(allowed_kinds) between 1 and 3);

-- save_campaign() now also saves each round's allowed kinds (default: all three).
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
  kinds public.dispatch_kind[];
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

-- ---------------------------------------------------------------------------
-- Dispatches: new columns
-- ---------------------------------------------------------------------------

alter table public.dispatches
  -- The round the Dispatch was posted in (null when the Campaign has no rounds).
  add column round_position smallint,
  -- The author's position when posting (from campaign_positions). `side` is
  -- kept for compatibility and mirrors it for For and Against.
  add column position public.position_choice,
  -- Source links: [{ "url": "...", "host": "...", "title": "..." }], at most 5.
  -- source_urls (Sprint 1) mirrors the URLs.
  add column sources jsonb not null default '[]'::jsonb
    check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) <= 5),
  -- Threading: the top-level Dispatch of the thread, the Dispatch it is shown
  -- under, and its indent (0 to 4). Replies beyond depth 4 are shown flat at
  -- depth 4 with a "replying to" label; parent_id still names the real target.
  add column root_id uuid references public.dispatches (id) on delete restrict,
  add column display_parent_id uuid references public.dispatches (id) on delete restrict,
  add column depth smallint not null default 0 check (depth between 0 and 4),
  add column edited_at timestamptz,
  add column withdrawn_at timestamptz,
  add column hidden_at timestamptz,
  add column hidden_by uuid,
  add column hidden_reason text check (char_length(hidden_reason) <= 500),
  -- Reaction counts, for display only. NEVER an input to judging (see below).
  add column reaction_counts jsonb not null default '{}'::jsonb,
  add column search_vector tsvector generated always as (to_tsvector('english', body)) stored;

comment on column public.dispatches.reaction_counts is
  'Display-only counts of reactions. Reactions must never decide a Verdict: no judging function, weight or view may read this column or dispatch_reactions.';

create index dispatches_campaign_depth_created_idx on public.dispatches (campaign_id, depth, created_at desc);
create index dispatches_root_idx on public.dispatches (root_id, created_at);
create index dispatches_author_campaign_round_idx on public.dispatches (author_id, campaign_id, round_position);
create index dispatches_author_created_idx on public.dispatches (author_id, created_at desc);
create index dispatches_search_idx on public.dispatches using gin (search_vector)
  where withdrawn_at is null and hidden_at is null;

-- Column privileges. Browsers read everything except moderator notes and the
-- search vector, and write nothing: posting, editing and withdrawing go
-- through the functions below.
revoke all on public.dispatches from anon, authenticated;
grant select (
  id, campaign_id, author_id, parent_id, kind, side, body, source_urls, ai_use, moderation_status,
  created_at, updated_at, round_position, position, sources, root_id, display_parent_id, depth,
  edited_at, withdrawn_at, hidden_at, reaction_counts, search_vector
) on public.dispatches to anon, authenticated;

alter policy "Strategists can post their own Dispatches while a Campaign is open" on public.dispatches
  rename to "No direct inserts: Dispatches are posted through post_dispatch()";
alter policy "No direct inserts: Dispatches are posted through post_dispatch()" on public.dispatches
  with check (false);

alter policy "Strategists can edit their own Dispatches while a Campaign is open" on public.dispatches
  rename to "No direct updates: use edit_dispatch() or withdraw_dispatch()";
alter policy "No direct updates: use edit_dispatch() or withdraw_dispatch()" on public.dispatches
  using (false) with check (false);

-- ---------------------------------------------------------------------------
-- Edit history and sealed content (both private: author and admins only)
-- ---------------------------------------------------------------------------

create table public.dispatch_revisions (
  id bigint generated always as identity primary key,
  dispatch_id uuid not null references public.dispatches (id) on delete cascade,
  body text not null,
  sources jsonb not null,
  ai_use public.ai_use_declaration not null,
  revised_at timestamptz not null default now(),
  revised_by uuid
);

create index dispatch_revisions_dispatch_idx on public.dispatch_revisions (dispatch_id, revised_at);

alter table public.dispatch_revisions enable row level security;
revoke all on public.dispatch_revisions from anon, authenticated;
grant select on public.dispatch_revisions to authenticated;

create policy "Authors and admins can read edit history"
  on public.dispatch_revisions for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.dispatches d where d.id = dispatch_id and d.author_id = (select auth.uid()))
  );

-- Withdrawn and hidden Dispatches keep their content here for judging and the
-- audit trail. The public row shows a placeholder instead. Never deleted.
create table public.dispatch_sealed_content (
  id bigint generated always as identity primary key,
  dispatch_id uuid not null references public.dispatches (id) on delete cascade,
  sealed_for text not null check (sealed_for in ('withdrawn', 'hidden')),
  body text not null,
  sources jsonb not null,
  sealed_at timestamptz not null default now(),
  -- Set when a hidden Dispatch is restored and its content put back.
  released_at timestamptz
);

create index dispatch_sealed_content_dispatch_idx on public.dispatch_sealed_content (dispatch_id, sealed_at desc);

alter table public.dispatch_sealed_content enable row level security;
revoke all on public.dispatch_sealed_content from anon, authenticated;
grant select on public.dispatch_sealed_content to authenticated;

create policy "Admins can read sealed content"
  on public.dispatch_sealed_content for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Dispatch rules, enforced on every insert and content change
-- ---------------------------------------------------------------------------

create or replace function public.dispatches_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.dispatches%rowtype;
  src jsonb;
  n integer;
begin
  -- Placeholder content of withdrawn or hidden Dispatches is not re-validated.
  if new.withdrawn_at is not null or new.hidden_at is not null then
    return new;
  end if;

  n := jsonb_array_length(new.sources);
  for src in select * from jsonb_array_elements(new.sources) loop
    if jsonb_typeof(src) <> 'object'
       or coalesce(src ->> 'url', '') !~ '^https?://[^\s<>"]+$'
       or char_length(src ->> 'url') > 2048
       or coalesce(src ->> 'host', '') = ''
       or char_length(src ->> 'host') > 255
       or char_length(coalesce(src ->> 'title', '')) > 200 then
      raise exception 'SOURCE_INVALID: source links must be http or https web addresses' using errcode = '22023';
    end if;
  end loop;

  if new.kind = 'rebuttal' then
    if new.parent_id is null then
      raise exception 'REBUTTAL_NEEDS_TARGET: a rebuttal must reply to another Dispatch' using errcode = '22023';
    end if;
  elsif new.parent_id is not null then
    raise exception 'ONLY_REBUTTALS_REPLY: only a rebuttal can reply to another Dispatch' using errcode = '22023';
  end if;
  if new.kind = 'argument' and n > 0 then
    raise exception 'ARGUMENT_NO_SOURCES: post sources as an evidence Dispatch' using errcode = '22023';
  end if;
  if new.kind = 'evidence' and n = 0 then
    raise exception 'EVIDENCE_NEEDS_SOURCE: evidence needs at least one source link' using errcode = '22023';
  end if;

  new.source_urls := array(select s ->> 'url' from jsonb_array_elements(new.sources) as s);

  if tg_op = 'INSERT' then
    new.side := case new.position when 'for' then 'for'::public.dispatch_side when 'against' then 'against'::public.dispatch_side end;
    if new.parent_id is null then
      new.depth := 0;
      new.root_id := new.id;
      new.display_parent_id := null;
    else
      select * into p from public.dispatches where id = new.parent_id;
      if not found or p.campaign_id <> new.campaign_id then
        raise exception 'TARGET_NOT_IN_CAMPAIGN: a rebuttal must reply to a Dispatch in the same Campaign' using errcode = '22023';
      end if;
      if p.withdrawn_at is not null or p.hidden_at is not null then
        raise exception 'TARGET_UNAVAILABLE: that Dispatch has been withdrawn or hidden' using errcode = '22023';
      end if;
      new.depth := least(p.depth + 1, 4);
      new.root_id := p.root_id;
      new.display_parent_id := case when p.depth < 4 then p.id else p.display_parent_id end;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.dispatches_prepare() from public, anon, authenticated;

create trigger dispatches_prepare
  before insert or update of body, sources, kind, parent_id on public.dispatches
  for each row execute function public.dispatches_prepare();

-- Audit every create, edit, withdraw, hide and restore. Starting to post in a
-- Campaign also follows it.
create or replace function public.dispatches_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  action text;
  details jsonb := jsonb_build_object('campaign_id', new.campaign_id);
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor_id, action, target_table, target_id, details)
    values (coalesce(auth.uid(), new.author_id), 'dispatch.created', 'dispatches', new.id::text,
            details || jsonb_build_object('kind', new.kind, 'round', new.round_position, 'position', new.position,
                                          'ai_use', new.ai_use, 'parent_id', new.parent_id,
                                          'length', char_length(new.body), 'sources', jsonb_array_length(new.sources)));
    insert into public.campaign_follows (user_id, campaign_id)
    values (new.author_id, new.campaign_id)
    on conflict do nothing;
    return new;
  end if;

  if new.hidden_at is not null and old.hidden_at is null then
    action := 'dispatch.hidden';
    details := details || jsonb_build_object('reason', new.hidden_reason);
  elsif new.hidden_at is null and old.hidden_at is not null then
    action := 'dispatch.restored';
  elsif new.withdrawn_at is not null and old.withdrawn_at is null then
    action := 'dispatch.withdrawn';
  elsif new.edited_at is distinct from old.edited_at then
    action := 'dispatch.edited';
    details := details || jsonb_build_object('length', char_length(new.body), 'ai_use', new.ai_use,
                                             'ai_use_before', old.ai_use, 'sources', jsonb_array_length(new.sources));
  elsif new.moderation_status is distinct from old.moderation_status then
    action := 'dispatch.moderation_changed';
    details := details || jsonb_build_object('from', old.moderation_status, 'to', new.moderation_status);
  else
    return new; -- reaction counts and similar housekeeping are not audited
  end if;

  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), action, 'dispatches', new.id::text, details);
  return new;
end;
$$;

revoke execute on function public.dispatches_after_change() from public, anon, authenticated;

-- (Trigger created after campaign_follows exists, below.)

-- ---------------------------------------------------------------------------
-- Posting, editing and withdrawing (the only write paths for Strategists)
-- ---------------------------------------------------------------------------

-- Errors start with a code the app turns into plain English. Rules, by server time:
--   signed in, with a handle; Campaign open; inside a round that accepts this kind;
--   an AI-use declaration; within the length limit; a recorded position (For or
--   Against in an Oxford-style Campaign); under the per-round limit; past the cooldown.
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
  perform 1 from public.profiles where id = uid and handle is not null for update;
  if not found then
    raise exception 'NOT_ONBOARDED: choose a handle before posting' using errcode = '42501';
  end if;

  select * into s from public.community_settings;
  select * into c from public.campaigns where id = p_campaign_id;
  if not found or c.status = 'draft' then
    raise exception 'CAMPAIGN_NOT_FOUND: no such Campaign' using errcode = 'P0002';
  end if;
  -- By server time. The scheduler may take up to a minute to flip the status,
  -- so a scheduled Campaign whose start has passed already accepts Dispatches.
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

  select coalesce(cp.after_position, cp.before_position) into pos
  from public.campaign_positions cp
  where cp.campaign_id = c.id and cp.user_id = uid;
  if pos is null then
    raise exception 'POSITION_REQUIRED: record your position first' using errcode = '42501';
  end if;
  if c.format = 'oxford' and pos = 'undecided' then
    raise exception 'POSITION_SIDE_REQUIRED: choose For or Against to post in an Oxford-style Campaign' using errcode = '42501';
  end if;

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

  -- Sprint 4 hook: AI screening (and the check for undeclared pasted AI output)
  -- will set moderation_status to 'pending' or 'held' here. Until then every
  -- Dispatch is visible at once; reports and admin hiding are the safeguard.
  insert into public.dispatches (
    campaign_id, author_id, parent_id, kind, position, body, sources, ai_use, round_position, moderation_status
  ) values (
    c.id, uid, p_parent_id, p_kind, pos, v_body, coalesce(p_sources, '[]'::jsonb), p_ai_use, round_pos, 'visible'
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke execute on function public.post_dispatch(uuid, public.dispatch_kind, text, public.ai_use_declaration, uuid, jsonb) from public, anon;
grant execute on function public.post_dispatch(uuid, public.dispatch_kind, text, public.ai_use_declaration, uuid, jsonb) to authenticated;

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
  if d.withdrawn_at is not null or d.hidden_at is not null then
    raise exception 'NOT_EDITABLE: this Dispatch has been withdrawn or hidden' using errcode = '42501';
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
  set body = v_body, sources = coalesce(p_sources, '[]'::jsonb), ai_use = p_ai_use, edited_at = now()
  where id = d.id;
end;
$$;

revoke execute on function public.edit_dispatch(uuid, text, public.ai_use_declaration, jsonb) from public, anon;
grant execute on function public.edit_dispatch(uuid, text, public.ai_use_declaration, jsonb) to authenticated;

-- Withdraw: the public sees "Withdrawn by author"; the content is sealed, not deleted.
create or replace function public.withdraw_dispatch(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  d public.dispatches%rowtype;
begin
  select * into d from public.dispatches where id = p_id for update;
  if not found or uid is null or d.author_id <> uid then
    raise exception 'NOT_YOURS: you can only withdraw your own Dispatches' using errcode = '42501';
  end if;
  if d.withdrawn_at is not null then
    return;
  end if;
  if not public.campaign_is_open(d.campaign_id) then
    raise exception 'CAMPAIGN_CLOSED: Dispatches cannot be withdrawn after the Campaign closes' using errcode = '42501';
  end if;

  if d.hidden_at is null then
    insert into public.dispatch_sealed_content (dispatch_id, sealed_for, body, sources)
    values (d.id, 'withdrawn', d.body, d.sources);
  end if;
  update public.dispatches
  set withdrawn_at = now(),
      body = case when d.hidden_at is null then 'Withdrawn by author.' else body end,
      sources = case when d.hidden_at is null then '[]'::jsonb else sources end
  where id = d.id;
end;
$$;

revoke execute on function public.withdraw_dispatch(uuid) from public, anon;
grant execute on function public.withdraw_dispatch(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Reports and admin hiding (automated screening arrives in Sprint 4)
-- ---------------------------------------------------------------------------

create type public.report_reason as enum ('harassment', 'hate', 'impersonation', 'misleading', 'spam', 'off_topic', 'other');

create table public.dispatch_reports (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.dispatches (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason public.report_reason not null,
  details text check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  constraint dispatch_reports_once unique (dispatch_id, reporter_id)
);

create index dispatch_reports_open_idx on public.dispatch_reports (status, created_at);

alter table public.dispatch_reports enable row level security;
revoke all on public.dispatch_reports from anon, authenticated;
grant select on public.dispatch_reports to authenticated;

create policy "Reporters see their own reports; admins see all"
  on public.dispatch_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_admin());

create or replace function public.report_dispatch(p_dispatch_id uuid, p_reason public.report_reason, p_details text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  d public.dispatches%rowtype;
  details text := nullif(btrim(coalesce(p_details, '')), '');
begin
  if uid is null or not exists (select 1 from public.profiles where id = uid and handle is not null) then
    raise exception 'NOT_ONBOARDED: sign in to report' using errcode = '42501';
  end if;
  select * into d from public.dispatches where id = p_dispatch_id;
  if not found or d.moderation_status <> 'visible'
     or not exists (select 1 from public.campaigns c where c.id = d.campaign_id and c.status <> 'draft') then
    raise exception 'NOT_FOUND: no such Dispatch' using errcode = 'P0002';
  end if;
  if d.author_id = uid then
    raise exception 'OWN_DISPATCH: you cannot report your own Dispatch' using errcode = '42501';
  end if;
  if p_reason is null then
    raise exception 'REASON_REQUIRED: choose a reason' using errcode = '22023';
  end if;
  if char_length(details) > 500 then
    raise exception 'DETAILS_TOO_LONG: keep it to 500 characters' using errcode = '22023';
  end if;

  insert into public.dispatch_reports (dispatch_id, reporter_id, reason, details)
  values (d.id, uid, p_reason, details)
  on conflict (dispatch_id, reporter_id) do update
    set reason = excluded.reason, details = excluded.details, status = 'open', created_at = now(),
        resolved_at = null, resolved_by = null;

  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (uid, 'dispatch.reported', 'dispatches', d.id::text, jsonb_build_object('reason', p_reason));
end;
$$;

revoke execute on function public.report_dispatch(uuid, public.report_reason, text) from public, anon;
grant execute on function public.report_dispatch(uuid, public.report_reason, text) to authenticated;

create or replace function public.hide_dispatch(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.dispatches%rowtype;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can hide Dispatches' using errcode = '42501';
  end if;
  if reason is null or char_length(reason) > 500 then
    raise exception 'REASON_REQUIRED: give a reason of up to 500 characters' using errcode = '22023';
  end if;
  select * into d from public.dispatches where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND: no such Dispatch' using errcode = 'P0002';
  end if;
  if d.hidden_at is not null then
    return;
  end if;

  if d.withdrawn_at is null then
    insert into public.dispatch_sealed_content (dispatch_id, sealed_for, body, sources)
    values (d.id, 'hidden', d.body, d.sources);
  end if;
  update public.dispatches
  set hidden_at = now(), hidden_by = auth.uid(), hidden_reason = reason,
      body = case when d.withdrawn_at is null then 'Hidden by a moderator.' else body end,
      sources = case when d.withdrawn_at is null then '[]'::jsonb else sources end
  where id = d.id;

  update public.dispatch_reports set status = 'actioned', resolved_at = now(), resolved_by = auth.uid()
  where dispatch_id = d.id and status = 'open';
end;
$$;

revoke execute on function public.hide_dispatch(uuid, text) from public, anon;
grant execute on function public.hide_dispatch(uuid, text) to authenticated;

create or replace function public.restore_dispatch(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.dispatches%rowtype;
  sealed public.dispatch_sealed_content%rowtype;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can restore Dispatches' using errcode = '42501';
  end if;
  select * into d from public.dispatches where id = p_id for update;
  if not found or d.hidden_at is null then
    return;
  end if;

  if d.withdrawn_at is null then
    select * into sealed from public.dispatch_sealed_content
    where dispatch_id = d.id and sealed_for = 'hidden' and released_at is null
    order by sealed_at desc limit 1;
    -- hidden_at is cleared first in the same statement, so the content checks run on the restored text.
    update public.dispatches
    set hidden_at = null, hidden_by = null, hidden_reason = null, body = sealed.body, sources = sealed.sources
    where id = d.id;
    update public.dispatch_sealed_content set released_at = now() where id = sealed.id;
  else
    update public.dispatches
    set hidden_at = null, hidden_by = null, hidden_reason = null, body = 'Withdrawn by author.', sources = '[]'::jsonb
    where id = d.id;
  end if;
end;
$$;

revoke execute on function public.restore_dispatch(uuid) from public, anon;
grant execute on function public.restore_dispatch(uuid) to authenticated;

create or replace function public.dismiss_reports(p_dispatch_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can dismiss reports' using errcode = '42501';
  end if;
  update public.dispatch_reports set status = 'dismissed', resolved_at = now(), resolved_by = auth.uid()
  where dispatch_id = p_dispatch_id and status = 'open';
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.audit_log (actor_id, action, target_table, target_id, details)
    values (auth.uid(), 'dispatch.reports_dismissed', 'dispatches', p_dispatch_id::text, jsonb_build_object('count', n));
  end if;
  return n;
end;
$$;

revoke execute on function public.dismiss_reports(uuid) from public, anon;
grant execute on function public.dismiss_reports(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Reactions
--
-- Reactions are information for Strategists. They must NEVER decide a Verdict:
-- judging (Sprint 5) reads panel scores, peer votes, the AI rubric and position
-- shifts, never dispatch_reactions or dispatches.reaction_counts. A schema test
-- (tests/rls/reactions-not-judging.test.ts) fails if any function or view links them.
-- ---------------------------------------------------------------------------

create table public.reaction_types (
  key text primary key check (key ~ '^[a-z_]{2,30}$'),
  label text not null check (char_length(label) between 1 and 30),
  description text not null check (char_length(description) between 1 and 160),
  sort smallint not null default 0,
  active boolean not null default true
);

comment on table public.reaction_types is
  'The reaction set. Owner decision: default Persuasive, Well sourced, Fair point. Admins can rename, reorder or retire one without a release.';

insert into public.reaction_types (key, label, description, sort) values
  ('persuasive', 'Persuasive', 'This made a strong case.', 1),
  ('well_sourced', 'Well sourced', 'The sources back up the point.', 2),
  ('fair_point', 'Fair point', 'I may not agree, but this is fair.', 3);

alter table public.reaction_types enable row level security;
revoke all on public.reaction_types from anon, authenticated;
grant select on public.reaction_types to anon, authenticated;
grant insert, update on public.reaction_types to authenticated;

create policy "Anyone can read reaction types"
  on public.reaction_types for select to anon, authenticated using (true);
create policy "Admins can add reaction types"
  on public.reaction_types for insert to authenticated with check (public.is_admin());
create policy "Admins can change reaction types"
  on public.reaction_types for update to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.dispatch_reactions (
  dispatch_id uuid not null references public.dispatches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reaction text not null references public.reaction_types (key) on update cascade,
  created_at timestamptz not null default now(),
  primary key (dispatch_id, user_id, reaction)
);

create index dispatch_reactions_user_idx on public.dispatch_reactions (user_id);

alter table public.dispatch_reactions enable row level security;
revoke all on public.dispatch_reactions from anon, authenticated;
grant select on public.dispatch_reactions to authenticated;

create policy "Strategists see their own reactions; admins see all"
  on public.dispatch_reactions for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create or replace function public.refresh_reaction_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.dispatch_id, old.dispatch_id);
begin
  update public.dispatches
  set reaction_counts = coalesce(
    (select jsonb_object_agg(reaction, n) from (
       select reaction, count(*) as n from public.dispatch_reactions where dispatch_id = target group by reaction
     ) t),
    '{}'::jsonb)
  where id = target;
  return null;
end;
$$;

revoke execute on function public.refresh_reaction_counts() from public, anon, authenticated;

create trigger dispatch_reactions_refresh_counts
  after insert or delete on public.dispatch_reactions
  for each row execute function public.refresh_reaction_counts();

-- Returns true when the reaction is now on, false when it was taken back.
create or replace function public.toggle_reaction(p_dispatch_id uuid, p_reaction text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  d public.dispatches%rowtype;
begin
  if uid is null or not exists (select 1 from public.profiles where id = uid and handle is not null) then
    raise exception 'NOT_ONBOARDED: sign in to react' using errcode = '42501';
  end if;
  select * into d from public.dispatches where id = p_dispatch_id;
  if not found or d.moderation_status <> 'visible' or d.withdrawn_at is not null or d.hidden_at is not null then
    raise exception 'NOT_AVAILABLE: this Dispatch cannot be reacted to' using errcode = '42501';
  end if;
  if d.author_id = uid then
    raise exception 'OWN_DISPATCH: you cannot react to your own Dispatch' using errcode = '42501';
  end if;
  if not public.campaign_is_open(d.campaign_id) then
    raise exception 'CAMPAIGN_CLOSED: reactions close when the Campaign closes' using errcode = '42501';
  end if;
  if not exists (select 1 from public.reaction_types where key = p_reaction and active) then
    raise exception 'UNKNOWN_REACTION: no such reaction' using errcode = '22023';
  end if;

  delete from public.dispatch_reactions where dispatch_id = d.id and user_id = uid and reaction = p_reaction;
  if found then
    return false;
  end if;
  insert into public.dispatch_reactions (dispatch_id, user_id, reaction) values (d.id, uid, p_reaction);
  return true;
end;
$$;

revoke execute on function public.toggle_reaction(uuid, text) from public, anon;
grant execute on function public.toggle_reaction(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Follows
-- ---------------------------------------------------------------------------

create table public.campaign_follows (
  user_id uuid not null references public.profiles (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, campaign_id)
);

create index campaign_follows_campaign_idx on public.campaign_follows (campaign_id);

alter table public.campaign_follows enable row level security;
revoke all on public.campaign_follows from anon, authenticated;
grant select, delete on public.campaign_follows to authenticated;
grant insert (user_id, campaign_id) on public.campaign_follows to authenticated;

create policy "Strategists see the Campaigns they follow"
  on public.campaign_follows for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy "Strategists can follow a published Campaign"
  on public.campaign_follows for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.handle is not null)
    and exists (select 1 from public.campaigns c where c.id = campaign_id and c.status <> 'draft')
  );

create policy "Strategists can unfollow"
  on public.campaign_follows for delete to authenticated
  using (user_id = (select auth.uid()));

create table public.strategist_follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followed_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint strategist_follows_not_self check (follower_id <> followed_id)
);

create index strategist_follows_followed_idx on public.strategist_follows (followed_id);

alter table public.strategist_follows enable row level security;
revoke all on public.strategist_follows from anon, authenticated;
grant select, delete on public.strategist_follows to authenticated;
grant insert (follower_id, followed_id) on public.strategist_follows to authenticated;

create policy "Strategists see who they follow"
  on public.strategist_follows for select to authenticated
  using (follower_id = (select auth.uid()) or public.is_admin());

create policy "Strategists can follow another Strategist"
  on public.strategist_follows for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.handle is not null)
    and exists (select 1 from public.profiles p where p.id = followed_id and p.handle is not null)
  );

create policy "Strategists can unfollow a Strategist"
  on public.strategist_follows for delete to authenticated
  using (follower_id = (select auth.uid()));

create trigger dispatches_after_change
  after insert or update on public.dispatches
  for each row execute function public.dispatches_after_change();

-- ---------------------------------------------------------------------------
-- Public Strategist pages: handles are shown on public Campaign pages, so
-- visitors who are not signed in can read a Strategist's public profile.
-- ---------------------------------------------------------------------------

grant select (id, handle, display_name, expertise_tag, bio, created_at) on public.profiles to anon;

create policy "Anyone can read Strategists with a handle"
  on public.profiles for select to anon
  using (handle is not null);

-- ---------------------------------------------------------------------------
-- Search (Postgres full text, English). Runs with the caller's rights, so
-- row-level security decides what each person can find.
-- ---------------------------------------------------------------------------

alter table public.campaigns
  add column search_vector tsvector generated always as (
    setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', coalesce(summary, '')), 'B')
  ) stored;
create index campaigns_search_idx on public.campaigns using gin (search_vector);
grant select (search_vector) on public.campaigns to anon, authenticated;

alter table public.profiles
  add column search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(handle, '') || ' ' || coalesce(display_name, '') || ' ' || coalesce(expertise_tag, ''))
  ) stored;
create index profiles_search_idx on public.profiles using gin (search_vector) where handle is not null;
grant select (search_vector) on public.profiles to anon, authenticated;

create or replace function public.search_tgs(
  p_query text,
  p_type text default 'all',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  result_type text,
  id uuid,
  title text,
  snippet text,
  campaign_slug text,
  handle text,
  created_at timestamptz,
  rank real
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  q tsquery := websearch_to_tsquery('english', left(coalesce(p_query, ''), 200));
  prefix tsquery;
  lim integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  words text;
begin
  -- Handles: every word is a prefix ("strat" finds @Strategist1).
  select string_agg(w || ':*', ' & ') into words
  from (select regexp_split_to_table(lower(left(coalesce(p_query, ''), 200)), '[^a-z0-9_]+') as w) t
  where w <> '';
  prefix := case when words is null then null else to_tsquery('simple', words) end;

  return query
  select * from (
    select 'campaign'::text, c.id, c.title,
           ts_headline('english', coalesce(c.summary, ''), q, 'MaxFragments=1, MaxWords=24, MinWords=8, StartSel=⟦, StopSel=⟧'),
           c.slug, null::text, c.starts_at, ts_rank(c.search_vector, q)
    from public.campaigns c
    where p_type in ('all', 'campaigns') and numnode(q) > 0 and c.search_vector @@ q
    union all
    select 'dispatch'::text, d.id, c.title,
           ts_headline('english', d.body, q, 'MaxFragments=1, MaxWords=24, MinWords=8, StartSel=⟦, StopSel=⟧'),
           c.slug, p.handle, d.created_at, ts_rank(d.search_vector, q)
    from public.dispatches d
    join public.campaigns c on c.id = d.campaign_id
    join public.profiles p on p.id = d.author_id
    where p_type in ('all', 'dispatches') and numnode(q) > 0
      and d.search_vector @@ q
      and d.withdrawn_at is null and d.hidden_at is null and d.moderation_status = 'visible'
    union all
    select 'strategist'::text, p.id, p.handle, coalesce(p.display_name, ''), null::text, p.handle, p.created_at,
           (ts_rank(p.search_vector, prefix) + 1)::real
    from public.profiles p
    where p_type in ('all', 'strategists') and prefix is not null and p.handle is not null and p.search_vector @@ prefix
  ) results (result_type, id, title, snippet, campaign_slug, handle, created_at, rank)
  order by rank desc, created_at desc
  limit lim offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.search_tgs(text, text, integer, integer) from public;
grant execute on function public.search_tgs(text, text, integer, integer) to anon, authenticated;
