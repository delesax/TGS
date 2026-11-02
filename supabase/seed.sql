-- Development seed only. Runs on `npm run db:reset` against the LOCAL database.
-- Never run this against the hosted project; use `npm run invite:create` there.

insert into public.invites (code, note, max_uses)
values ('LOCAL-DEV-INVITE', 'Local development invite (reusable)', 100)
on conflict (code) do nothing;

-- Three SAMPLE Campaigns for local development and tests. Not the real launch
-- topics (those are loaded with `npm run topics:load`). Times are relative to
-- the moment the database is reset.
insert into public.campaigns (slug, title, summary, rules, category, format, status, starts_at, ends_at, opinion_not_advice, current_round)
values
  ('sample-open-four-day-week', '[Sample] Should the four-day week become the norm?',
   'A sample Campaign for local development. It is open now.',
   'Be civil. Argue the point, not the person. Cite your sources.',
   'technology', 'progressive', 'open', now() - interval '1 hour', now() + interval '6 days', false, 1),
  ('sample-soon-pension-age', '[Sample] Should the state pension age rise faster?',
   'A sample Campaign for local development. It opens in two days.',
   'Be civil. Argue the point, not the person. Cite your sources.',
   'financial_services', 'oxford', 'scheduled', now() + interval '2 days', now() + interval '9 days', true, null),
  ('sample-closed-school-phones', '[Sample] Should phones be banned in schools?',
   'A sample Campaign for local development. It has closed.',
   'Be civil. Argue the point, not the person. Cite your sources.',
   'education', 'open_arena', 'closed', now() - interval '10 days', now() - interval '3 days', false, null)
on conflict (slug) do nothing;

insert into public.campaign_rounds (campaign_id, position, title, starts_at, ends_at)
select c.id, r.position, r.title, c.starts_at + r.from_start, c.starts_at + r.to_end
from public.campaigns c
cross join (values
  (1, 'Opening arguments', interval '0', interval '2 days 1 hour'),
  (2, 'Rebuttals', interval '2 days 1 hour', interval '4 days 1 hour'),
  (3, 'Closing statements', interval '4 days 1 hour', interval '6 days 1 hour')
) as r(position, title, from_start, to_end)
where c.slug = 'sample-open-four-day-week'
on conflict (campaign_id, position) do nothing;

-- Email processor for LOCAL development: pg_cron calls the app on port 3100
-- through pg_net. Dummy local secret, not used anywhere else. On the hosted
-- project the owner stores the real address and secret in Vault (see DEMO.md).
select vault.create_secret('http://host.docker.internal:3100/api/email/process', 'email_processor_url', 'Local development only');
select vault.create_secret('local-email-processor-secret', 'email_processor_secret', 'Local development only');

-- Moderation sweeper for LOCAL development (Sprint 4): pg_cron re-screens
-- Dispatches stuck in "Checking…" through the app on port 3100. Dummy secret.
select vault.create_secret('http://host.docker.internal:3100/api/moderation/sweep', 'moderation_processor_url', 'Local development only');
select vault.create_secret('local-moderation-processor-secret', 'moderation_processor_secret', 'Local development only');
