-- Sprint 3: email notifications.
--
-- Events are queued in email_outbox by database triggers and a pg_cron job,
-- then sent by the app's protected route /api/email/process (src/lib/email),
-- which pg_cron calls through pg_net once a minute when something is due.
-- No Vercel cron, no Inngest.
--
-- Events:
--   reply                    someone replies to your Dispatch (batched into a digest)
--   campaign_opened          a Campaign you follow opens
--   campaign_round_changed   a Campaign you follow moves to its next round
--   campaign_closed          a Campaign you follow closes
--   campaign_closing_soon    a Campaign you are in (posted or recorded a position) closes within 24 hours
--
-- Idempotent: every event has a unique dedupe_key, so it is queued once.
-- Retry-safe: rows are claimed with SKIP LOCKED, a stuck claim is retried after
-- 10 minutes, and the sender passes an idempotency key to the email provider.
-- Fail-safe: if the processor's address or secret is missing, nothing is sent
-- and the rows wait in the queue.

-- ---------------------------------------------------------------------------
-- Preferences (all on by default) and one-click unsubscribe
-- ---------------------------------------------------------------------------

create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  replies boolean not null default true,
  campaign_updates boolean not null default true,
  closing_soon boolean not null default true,
  -- Set by "Stop all emails" or the unsubscribe link. Cleared by turning any email back on.
  unsubscribed_all_at timestamptz,
  -- Secret in every email's unsubscribe link. Never readable from the browser.
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  updated_at timestamptz not null default now()
);

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon, authenticated;
grant select (user_id, replies, campaign_updates, closing_soon, unsubscribed_all_at, updated_at) on public.notification_preferences to authenticated;
grant update (replies, campaign_updates, closing_soon, unsubscribed_all_at) on public.notification_preferences to authenticated;

create policy "Strategists read their own email preferences"
  on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Strategists change their own email preferences"
  on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.create_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.create_notification_preferences() from public, anon, authenticated;

create trigger profiles_create_notification_preferences
  after insert on public.profiles
  for each row execute function public.create_notification_preferences();

insert into public.notification_preferences (user_id) select id from public.profiles on conflict do nothing;

-- Used by the unsubscribe page (service role). kind: replies, campaign_updates, closing_soon or all.
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
  if uid is null or p_kind not in ('replies', 'campaign_updates', 'closing_soon', 'all') then
    return false;
  end if;
  update public.notification_preferences set
    replies = case when p_kind in ('replies', 'all') then false else replies end,
    campaign_updates = case when p_kind in ('campaign_updates', 'all') then false else campaign_updates end,
    closing_soon = case when p_kind in ('closing_soon', 'all') then false else closing_soon end,
    unsubscribed_all_at = case when p_kind = 'all' then now() else unsubscribed_all_at end
  where user_id = uid;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (uid, 'email.unsubscribed', 'notification_preferences', uid::text, jsonb_build_object('kind', p_kind, 'via', 'link'));
  return true;
end;
$$;

revoke execute on function public.unsubscribe_by_token(uuid, text) from public, anon, authenticated;
grant execute on function public.unsubscribe_by_token(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- The outbox (service role only)
-- ---------------------------------------------------------------------------

create table public.email_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('reply', 'campaign_opened', 'campaign_round_changed', 'campaign_closed', 'campaign_closing_soon')),
  -- What the email needs to say, captured when the event happened.
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'skipped', 'failed')),
  send_after timestamptz not null default now(),
  attempts smallint not null default 0,
  locked_at timestamptz,
  sent_at timestamptz,
  -- Provider message id. Rows sent together in one digest share it.
  message_id text,
  last_error text check (char_length(last_error) <= 500),
  created_at timestamptz not null default now()
);

create index email_outbox_due_idx on public.email_outbox (status, send_after);
create index email_outbox_user_sent_idx on public.email_outbox (user_id, sent_at desc);

alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;
-- No policies: only the service role (the processor) reads or writes it.

create or replace function public.enqueue_email(p_user_id uuid, p_kind text, p_payload jsonb, p_dedupe_key text, p_send_after timestamptz default now())
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.email_outbox (user_id, kind, payload, dedupe_key, send_after)
  values (p_user_id, p_kind, p_payload, p_dedupe_key, coalesce(p_send_after, now()))
  on conflict (dedupe_key) do nothing;
$$;

revoke execute on function public.enqueue_email(uuid, text, jsonb, text, timestamptz) from public, anon, authenticated;

-- Replies: queued for the author of the Dispatch being answered, held for a few
-- minutes (community_settings.reply_digest_minutes) so several become one email.
create or replace function public.queue_reply_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.dispatches%rowtype;
  c public.campaigns%rowtype;
  replier text;
  digest_minutes integer;
begin
  if new.kind <> 'rebuttal' or new.parent_id is null then
    return new;
  end if;
  select * into target from public.dispatches where id = new.parent_id;
  if not found or target.author_id = new.author_id then
    return new;
  end if;
  select * into c from public.campaigns where id = new.campaign_id;
  select handle into replier from public.profiles where id = new.author_id;
  select reply_digest_minutes into digest_minutes from public.community_settings;

  perform public.enqueue_email(
    target.author_id,
    'reply',
    jsonb_build_object(
      'dispatch_id', new.id, 'parent_id', target.id, 'campaign_id', c.id, 'campaign_slug', c.slug,
      'campaign_title', c.title, 'replier_handle', replier, 'excerpt', left(new.body, 240)
    ),
    'reply:' || new.id,
    new.created_at + make_interval(mins => coalesce(digest_minutes, 10))
  );
  return new;
end;
$$;

revoke execute on function public.queue_reply_email() from public, anon, authenticated;

create trigger dispatches_queue_reply_email
  after insert on public.dispatches
  for each row execute function public.queue_reply_email();

-- Campaign open, round change and close: the scheduler (campaign_tick) writes
-- these to audit_log; each becomes an email to the Campaign's followers.
create or replace function public.queue_campaign_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.campaigns%rowtype;
  kind text;
  round_no integer;
  round_title text;
  f record;
begin
  if new.action not in ('campaign.opened', 'campaign.round_changed', 'campaign.closed') then
    return new;
  end if;
  select * into c from public.campaigns where id = new.target_id::uuid;
  if not found then
    return new;
  end if;

  if new.action = 'campaign.round_changed' then
    round_no := (new.details ->> 'to')::integer;
    -- A round ending without another starting is covered by the close email.
    if round_no is null or c.status <> 'open' then
      return new;
    end if;
    select title into round_title from public.campaign_rounds where campaign_id = c.id and position = round_no;
    -- A first round that starts with the Campaign (within the scheduler's minute)
    -- is covered by the "opened" email.
    if round_no = 1 and exists (
      select 1 from public.campaign_rounds where campaign_id = c.id and position = 1 and starts_at <= c.starts_at + interval '1 minute'
    ) then
      return new;
    end if;
  end if;

  kind := case new.action
    when 'campaign.opened' then 'campaign_opened'
    when 'campaign.round_changed' then 'campaign_round_changed'
    else 'campaign_closed'
  end;

  for f in select user_id from public.campaign_follows where campaign_id = c.id loop
    perform public.enqueue_email(
      f.user_id,
      kind,
      jsonb_build_object('campaign_id', c.id, 'campaign_slug', c.slug, 'campaign_title', c.title, 'ends_at', c.ends_at,
                         'round', round_no, 'round_title', round_title),
      kind || ':' || c.id || ':' || coalesce(round_no::text, '-') || ':' || f.user_id
    );
  end loop;
  return new;
end;
$$;

revoke execute on function public.queue_campaign_emails() from public, anon, authenticated;

create trigger audit_log_queue_campaign_emails
  after insert on public.audit_log
  for each row execute function public.queue_campaign_emails();

-- Closing within 24 hours: everyone who posted or recorded a position. Runs from
-- pg_cron; the dedupe key makes repeated runs harmless.
create or replace function public.queue_closing_soon_emails()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  p record;
  n integer := 0;
begin
  for c in
    select id, slug, title, starts_at, ends_at from public.campaigns
    where status = 'open' and ends_at > now() and ends_at <= now() + interval '24 hours'
      -- A Campaign shorter than a day gets no "closing soon" email at its start.
      and ends_at - starts_at > interval '24 hours'
  loop
    for p in
      select author_id as user_id from public.dispatches where campaign_id = c.id
      union
      select user_id from public.campaign_positions where campaign_id = c.id
    loop
      perform public.enqueue_email(
        p.user_id,
        'campaign_closing_soon',
        jsonb_build_object('campaign_id', c.id, 'campaign_slug', c.slug, 'campaign_title', c.title, 'ends_at', c.ends_at),
        'campaign_closing_soon:' || c.id || ':' || p.user_id
      );
      n := n + 1;
    end loop;
  end loop;
  return n;
end;
$$;

revoke execute on function public.queue_closing_soon_emails() from public, anon, authenticated;

select cron.schedule('email-closing-soon', '*/10 * * * *', 'select public.queue_closing_soon_emails()');

-- ---------------------------------------------------------------------------
-- The processor's side (service role only)
-- ---------------------------------------------------------------------------

-- Claims due rows for sending. A claim older than 10 minutes is assumed to
-- have crashed and is retried.
create or replace function public.claim_email_batch(p_limit integer default 100)
returns setof public.email_outbox
language sql
security definer
set search_path = ''
as $$
  update public.email_outbox o
  set status = 'sending', locked_at = now(), attempts = o.attempts + 1
  where o.id in (
    select id from public.email_outbox
    where (status = 'queued' and send_after <= now())
       or (status = 'sending' and locked_at < now() - interval '10 minutes')
    order by id
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
    for update skip locked
  )
  returning o.*;
$$;

revoke execute on function public.claim_email_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_email_batch(integer) to service_role;

-- Everything the processor needs to decide whether, and how, to email someone.
create or replace function public.email_recipients(p_user_ids uuid[])
returns table (
  user_id uuid,
  email text,
  confirmed boolean,
  handle text,
  replies boolean,
  campaign_updates boolean,
  closing_soon boolean,
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

-- pg_cron -> pg_net -> /api/email/process, only when something is due. The
-- route's address and shared secret live in Supabase Vault (owner action on
-- hosted: see DEMO.md). Missing either, it does nothing and the queue waits.
create extension if not exists pg_net with schema extensions;

create or replace function public.email_kick()
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
    select 1 from public.email_outbox
    where (status = 'queued' and send_after <= now()) or (status = 'sending' and locked_at < now() - interval '10 minutes')
  ) then
    return null;
  end if;
  select decrypted_secret into url from vault.decrypted_secrets where name = 'email_processor_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'email_processor_secret';
  if url is null or secret is null then
    raise log 'email_kick: email_processor_url or email_processor_secret is not set in Vault; emails stay queued';
    return null;
  end if;
  return net.http_post(
    url := url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 20000
  );
end;
$$;

revoke execute on function public.email_kick() from public, anon, authenticated;

select cron.schedule('email-kick', '* * * * *', 'select public.email_kick()');
