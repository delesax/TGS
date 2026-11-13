# Incident checklist

For the owner on the day something goes wrong. Work top to bottom; stop when the harm has stopped, then carry on to the record. Related: `docs/LAUNCH_RUNBOOK.md` (switches, rollback), `docs/BACKUP_RESTORE.md`.

## 1. Stop the harm (first five minutes)
Do not delete anything. Do not "fix" data by hand yet.
- Abusive or harmful content: Admin, Moderation: hide the Dispatch (it is hidden, never deleted). Mute the account's posting from Admin, Users if needed.
- A flood or a bot wave: Admin, Settings, switches: pause sign-ups, then posting.
- Email going wrong (wrong content, too many, a loop): pause emails. Queued mail waits.
- AI misbehaving or costing too much: turn AI off (`ai_enabled`); then check the Anthropic console against the $30 cap.
- A bad release: Vercel, Deployments, promote the previous Ready deployment (Instant Rollback).
- A secret may have leaked: rotate it now (see section 4).

## 2. Write down what you see
Time (UK), what you saw, who reported it, screenshots. Then look, read-only:
- `/api/health`, then Admin, Health (queues, last job runs, AI calls today).
- Admin, Health, recent events (`system_events`: counts and codes, kept 30 days) and `/admin/audit` (who did what).
- Vercel, the project's runtime logs (about an hour on Hobby, so look soon) and Supabase, Logs.
- Admin, Signals (`/admin/signals`) if the problem is about votes or accounts.

## 3. Decide what kind of problem it is
| Kind | First step |
| --- | --- |
| Deployment broke something | Roll back in Vercel. Database changes stay (they are additive); the old code ignores new columns. |
| Wrong data written (a bug or a bad statement) | Stop writes (pause posting). Take a dump now. Restore the latest earlier dump into a scratch project (`docs/BACKUP_RESTORE.md`), compare, then fix live data with a reviewed migration. Never restore over live without a scratch rehearsal. |
| Abuse or collusion | Pause sign-ups or posting; use Signals to find accounts; flags are for human decision only (D4), nothing changes weights by itself. |
| Service outage (Supabase, Vercel, Resend, Anthropic) | Check the provider status page. Nothing to restore; say so on the site if long. The app fails safe: emails wait, AI falls back as set, unscreened posts are flagged. |
| Free Supabase project paused | Open the dashboard and restore the project; then check `/api/health`. |
| Quota hit (Resend, Anthropic) | Emails paused or capped; judging waits for the next UK day. Raise the AI cap in Settings only if you accept the cost. |

## 4. Secrets
If any key might be exposed: rotate it in its own dashboard (Supabase, Resend, Anthropic, Vercel), update Vercel, and for the three processor secrets update the matching Vault secret as well, then confirm each processor route answers 401 without the secret. Never paste a secret into chat, a log or a commit.

## 5. Personal data
If personal data may have been seen by someone who should not have it, or lost, this is a legal step, not a code step. Contact the owner's legal adviser and follow the legal documents (parked, `docs/legal/`). The UK GDPR time limit for telling the regulator is 72 hours from becoming aware, so write the time you became aware in step 2.

## 6. Afterwards
- Add an entry to `docs/CLAUDE_LOG.md`: what happened, times, what stopped it, what was lost.
- Ask Claude to add a test for the cause.
- Take a fresh dump once things are stable.
- Resume what you paused, one switch at a time, watching Admin, Health.
