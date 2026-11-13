# Backup and restore (free Supabase plan)

The free plan has no backups and no point-in-time recovery. Decision D7 (13 Nov 2026): **you take manual dumps; no database address is stored anywhere new** (no GitHub secret, no scheduled job). This file says what a backup contains, how to take one, how to restore it, and what it does not cover.

## What you get
`bash scripts/backup-dump.sh` writes three files to `~/TGS-backups` (outside the repository, mode 600):

| File | What it is | Why |
| --- | --- | --- |
| `data-<time>.sql` | Data only, schemas `auth` and `public`, as COPY statements | The part that is **not** in git: members, Dispatches, votes, Verdicts, settings, audit log |
| `schema-<time>.sql` | The public schema | To compare with `supabase/migrations` (drift check). The schema itself is rebuilt from the migrations, not from this file |
| `manifest-<time>.txt` | Row counts per table and a SHA-256 of both files | To prove a restore is complete |

Left out on purpose (people just sign in again; nothing of value): `auth.sessions`, `auth.refresh_tokens`, `auth.audit_log_entries`, `auth.flow_state`, `auth.one_time_tokens`, `auth.mfa_challenges`, `auth.schema_migrations`.

The script refuses to keep a dump that has no `auth.users` or no `public.profiles`: **a dump that restores `public` without `auth.users` is not a backup**, because every profile points at an account and nobody could sign in.

The files hold personal data and password hashes. Never commit them, email them or put them in a shared folder. Copy them to an encrypted drive or a private cloud folder you control.

## Taking a backup
Needs Docker running (the Supabase CLI runs `pg_dump` inside it) and `DATABASE_URL` in `.env.local`: the Session pooler address from Supabase dashboard, Connect. The script reads that one line while it runs; it never prints it, writes it anywhere or sources the file, and it redacts anything that looks like a connection string from the CLI's output.

```bash
bash scripts/backup-dump.sh
```

It prints the file names, sizes and the number of users and profiles. Look at those two numbers: they should be what you expect.

When: the day before launch, then weekly, and **immediately before every migration** you apply to hosted. Keep the last four.

For a rehearsal that never touches hosted: `bash scripts/backup-dump.sh --local`.

## Restoring
Always restore into a **scratch** place first, check it, and only then decide what to do with live data.

### Rehearsal (local, tested)
```bash
./node_modules/.bin/supabase start                         # local Supabase
./node_modules/.bin/supabase db reset                      # empty database rebuilt from supabase/migrations
bash scripts/backup-restore-local.sh ~/TGS-backups/data-<time>.sql
```
The script (it refuses anything but the local database container):
1. clears rows the migrations seed (every public table and `auth.users`, with `session_replication_role = replica` because `audit_log` refuses TRUNCATE by design);
2. loads the data file in one transaction, also with triggers off, so rows go in exactly as dumped and no trigger re-runs (no duplicate audit entries, no emails queued);
3. sets every identity counter just past its highest value;
4. compares row counts with the manifest and prints `ROW COUNTS MATCH` or the differences.

### Restoring for real (hosted): documented, NOT rehearsed
This path was not run, because nothing was allowed to touch hosted. The steps are the same four with a different address; treat them as a draft and rehearse on a spare free project first.
1. Create a new free Supabase project (London). Do not touch the live one.
2. Rebuild the schema: from this repo, `supabase db push --db-url "<new project session pooler address>"` applies every migration, which also recreates the pg_cron jobs and functions.
3. Run steps 1 to 3 above against the new database. Use the SQL in `scripts/backup-restore-local.sh` and load the data file with `docker run --rm -i postgres:17 psql "<address>" -v ON_ERROR_STOP=1 -1`. Unverified: whether the hosted `postgres` role is allowed `set session_replication_role = replica`. If it is not, the load fails at the first foreign key; ask Claude to help with the supported alternative before an emergency.
4. Re-create what the dump does not hold (next section), then point Vercel's Supabase variables at the new project, redeploy, and check `/api/health`.

## What a backup does NOT cover
Be clear-eyed about this list; each item is something to redo by hand after a disaster.
- **Vault secrets** (`email_processor_url`, `email_processor_secret`, `moderation_processor_*`, `judging_processor_*`): not in the dump. They are in your head and your password manager; recreate them (`docs/LAUNCH_EMAIL_SETUP.md`).
- **Supabase Auth settings**: rate limits, email templates, redirect URLs, providers, passkey settings. Dashboard only. Write the values in `docs/CLAUDE_LOG.md` when you set them.
- **Vercel variables and the Resend, Anthropic accounts**: separate services with their own settings.
- **Sessions**: everyone is signed out and signs in again (passwords and passkeys survive: hashes and credentials are in `auth.users` and `auth.identities`, which are dumped; verified for passwords only, see below).
- **Anything after the last dump**: up to a week of Dispatches and votes if you only dump weekly. Dump more often during a busy Campaign.
- **`audit_log` older than six years** is purged by the retention job on purpose; a restore brings back whatever the dump held.
- **pg_cron job history and `cron` tables**: the jobs come back from the migrations, history does not.
- **Storage buckets**: the app stores no files, so there is nothing to back up. If that changes, this file must change.
- **The hosted database itself was not dumped by Claude.** Only the local database was dumped and restored.
- **Restore speed and size**: the rehearsal database was small (12 members). A real restore of a bigger database takes longer; measure it on the first real dump.

## Rehearsal result (13 November 2026, local)
Seeded local database (`npm run seed:judging`, 12 members, 1 Verdict), then:
1. `scripts/backup-dump.sh --local`: three files, 61 tables counted, 12 users, 12 profiles.
2. `supabase db reset`: empty database (0 users).
3. `scripts/backup-restore-local.sh`: row counts match for all 61 tables compared (the seven deliberately excluded auth tables are skipped).
4. Content fingerprints identical before and after: MD5 over all Dispatch ids and bodies, over every account's password hash and over every handle. A restored member can sign in with the old password (HTTP 200).
5. Cron jobs: the same 15 jobs, rebuilt by the migrations.

One real finding from the rehearsal: `audit_log` refuses `TRUNCATE`, which stopped the first restore attempt. The restore script now clears tables with triggers off. The dump script's file check also had to accept the quoted names the CLI writes (`COPY "auth"."users"`).

Not covered by the rehearsal: restoring onto a new hosted project, the passkey credentials (no passkey existed in the seed), a large database, and a restore from a dump taken on the hosted database (its `auth` schema may be a newer version than local; dump and restore against the same Supabase CLI version, and if the restore reports a missing column, apply the migrations first).
