-- Development seed only. Runs on `npm run db:reset` against the LOCAL database.
-- Never run this against the hosted project; use `npm run invite:create` there.

insert into public.invites (code, note, max_uses)
values ('LOCAL-DEV-INVITE', 'Local development invite (reusable)', 100)
on conflict (code) do nothing;
