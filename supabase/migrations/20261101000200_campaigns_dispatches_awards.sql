-- Sprint 1: schema for Campaigns, Dispatches and awards.
-- Not used by the app until Sprints 2 to 5, but designed now with row-level
-- security so later sprints extend rather than rewrite it.

create type public.campaign_category as enum (
  'financial_services',
  'energy',
  'technology',
  'education',
  'health_social_care'
);

create type public.campaign_format as enum ('open_arena', 'oxford', 'progressive');

create type public.campaign_status as enum ('draft', 'scheduled', 'open', 'closed');

create type public.dispatch_kind as enum ('argument', 'rebuttal', 'evidence');

create type public.dispatch_side as enum ('for', 'against');

create type public.ai_use_declaration as enum ('none', 'assisted', 'generated');

create type public.moderation_status as enum ('pending', 'visible', 'held', 'removed');

create type public.award_category as enum (
  'grand_strategist',
  'best_rebuttal',
  'best_evidence',
  'most_persuasive',
  'best_newcomer'
);

-- ---------------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------------

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null check (char_length(title) between 5 and 160),
  summary text check (char_length(summary) <= 2000),
  rules text check (char_length(rules) <= 10000),
  category public.campaign_category not null,
  format public.campaign_format not null default 'open_arena',
  status public.campaign_status not null default 'draft',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_sensitive boolean not null default false,
  content_note text check (char_length(content_note) <= 500),
  opinion_not_advice boolean not null default false,
  rubric_published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_ends_after_start check (ends_at > starts_at),
  constraint campaigns_sensitive_needs_note check (not is_sensitive or content_note is not null)
);

create index campaigns_status_ends_at_idx on public.campaigns (status, ends_at);

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

alter table public.campaigns enable row level security;

create policy "Anyone can read published Campaigns"
  on public.campaigns for select to anon, authenticated
  using (status <> 'draft' or public.is_admin());

create policy "Admins can create Campaigns"
  on public.campaigns for insert to authenticated
  with check (public.is_admin());

create policy "Admins can update Campaigns"
  on public.campaigns for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- True when the Campaign is accepting Dispatches by server time.
create or replace function public.campaign_is_open(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaigns c
    where c.id = p_campaign_id
      and c.status = 'open'
      and now() >= c.starts_at
      and now() < c.ends_at
  );
$$;

-- ---------------------------------------------------------------------------
-- Dispatches
-- ---------------------------------------------------------------------------

create table public.dispatches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete restrict,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.dispatches (id) on delete restrict,
  kind public.dispatch_kind not null,
  side public.dispatch_side,
  body text not null check (char_length(body) between 1 and 5000),
  source_urls text[] not null default '{}' check (cardinality(source_urls) <= 10),
  ai_use public.ai_use_declaration not null,
  moderation_status public.moderation_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dispatches_campaign_created_idx on public.dispatches (campaign_id, created_at);
create index dispatches_author_idx on public.dispatches (author_id);
create index dispatches_parent_idx on public.dispatches (parent_id);

create trigger dispatches_set_updated_at
  before update on public.dispatches
  for each row execute function public.set_updated_at();

alter table public.dispatches enable row level security;

-- Column privileges: authors write content columns only. moderation_status is
-- set by the server (service role) after AI screening or by admin review.
revoke all on public.dispatches from anon, authenticated;
grant select on public.dispatches to anon, authenticated;
grant insert (campaign_id, author_id, parent_id, kind, side, body, source_urls, ai_use)
  on public.dispatches to authenticated;
grant update (body, source_urls, ai_use) on public.dispatches to authenticated;

create policy "Anyone can read visible Dispatches in published Campaigns"
  on public.dispatches for select to anon, authenticated
  using (
    (
      moderation_status = 'visible'
      and exists (select 1 from public.campaigns c where c.id = campaign_id and c.status <> 'draft')
    )
    or author_id = (select auth.uid())
    or public.is_admin()
  );

create policy "Strategists can post their own Dispatches while a Campaign is open"
  on public.dispatches for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.handle is not null)
    and public.campaign_is_open(campaign_id)
  );

create policy "Strategists can edit their own Dispatches while a Campaign is open"
  on public.dispatches for update to authenticated
  using (author_id = (select auth.uid()) and moderation_status in ('pending', 'visible'))
  with check (author_id = (select auth.uid()) and public.campaign_is_open(campaign_id));

-- No delete policy: Dispatches are never hard-deleted from the browser.
-- Moderation holds or removes them by status (see CLAUDE.md rule 6).

-- ---------------------------------------------------------------------------
-- Awards
-- ---------------------------------------------------------------------------

create table public.awards (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete restrict,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  category public.award_category not null,
  rationale text not null check (char_length(rationale) between 1 and 5000),
  awarded_at timestamptz not null default now(),
  awarded_by uuid references auth.users (id) on delete set null,
  constraint awards_one_per_category unique (campaign_id, category)
);

create index awards_profile_idx on public.awards (profile_id);

alter table public.awards enable row level security;

create policy "Anyone can read awards"
  on public.awards for select to anon, authenticated
  using (true);

create policy "Admins can grant awards"
  on public.awards for insert to authenticated
  with check (public.is_admin());

create policy "Admins can update awards"
  on public.awards for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
