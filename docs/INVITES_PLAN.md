# Invites: admin-generated, email-bound codes and a public "ask to join" form

Written 16 November 2026 (plan only at the time), updated with the owner's answers, and again on 17 November 2026 for what actually happened. **Status:** the owner decided to ship only a small version before launch and to do the full build after it. In fact the full build (this plan's sections 2 to 4: hashed codes, join requests, the invite email through the queue, the budget panel, `/join`) was merged to `main` as PR #66 before that decision took effect, so it is on `main` but its migration `20261116000100_join_requests_invites.sql` is **not applied to hosted**. The reduced-scope branch `invites-admin-lite` was therefore not merged; only its small pieces were ported (section 8).

## 0. Decisions (owner, 16 November 2026)

| # | Question | Decision |
| --- | --- | --- |
| 1 | Hash codes, and which ones? | Hash **new** codes only, **later**. Older plaintext codes keep working. (The full build on `main` already hashes new codes; see section 8.) |
| 2 | Where does the public form live? | `/join`, **not advertised until after the first wave**. |
| 3 | After a rejection, can the person ask again? | Blocked for **30 days** (the rejected row stays until it is purged). |
| 4 | Pending requests and retention | Pending requests **expire at 30 days**; rejected, revoked, expired and joined ones are **deleted 30 days after the decision**. |
| 5 | Invite email limit | **25 invite emails a day**. |
| 6 | When does the 7 days start? | From the **send time**. |
| 7 | Invitation wording, subject and sender | Not decided yet. |
| 8 | "Invalid code" and "wrong address" | **Identical message** (shipped, section 8). |
| 9 | Pilot cap | The pilot cap of 100 **blocks approval**. |
| 10 | Who can approve | **Any admin**. |
| 11 | Disposable email domains | **No block**. |
| 12 | Approving an address that is already a member | **Skip** it and say so. |
| 13 | Privacy wording for join requests | **Parked** (legal): the public form waits for it. |
| 14 | Phases | Phase 1 and Phase 2 **after launch**. |

## 1. Today's system (checked against the code, origin/main)

- **Table** `invites` (`20261101000100_foundation.sql`): `code` (plaintext, unique, `^[A-Z0-9-]{8,32}$`), `note` (200), `max_uses`, `use_count`, `expires_at`, `revoked_at`, `created_by`, plus `invited_email` (`20261113000500`, lower case, nullable). RLS: admins can select, insert and update; nobody else can read it.
- **Codes:** `TGS-XXXX-XXXX-XXXX` from a 31-letter alphabet, about 60 bits (`src/lib/invite-code.ts`). Made only by the CLI (`npm run invite:create`, which supports `--email`, `--days`, `--count`). **There was no admin invites screen** (the runbook's "or Admin" was wrong).
- **Sign-up** (`src/app/(auth)/actions.ts`, `signUp`): validate the form; check the sign-up pause switch; apply the `sign_up_ip` limit (60 an hour); `invite_check(code, email)` (falls back to `invite_is_usable`); `supabase.auth.signUp` with `invite_code` in the user metadata; the trigger `handle_new_user()` re-checks everything under a row lock (code exists, not revoked, not expired, uses plus reserved places below max, email matches the bound address, three consents) and stores `profiles.invite_id`. Always redirects to `/signup/check-email`, so no one can test which emails have accounts.
- **Consumption:** at email confirmation (`use_count`). An unconfirmed sign-up holds the place for 24 hours (`invite_reserved_count`).
- **Email queue:** `email_outbox.user_id` is `not null` and references `profiles`, and the processor looks recipients up through `profiles`/`auth.users`. **The queue cannot address a person with no account.** Caps: `email_global_daily_cap` (60 a day, counted per UK day; at the cap essential kinds wait until 00:05 the next day, others are skipped) and `email_daily_cap` (6 per member, keyed by user). Essentials-only mode skips any kind not in `email_essential_kinds`.
- **Rate limiter:** `rate_limit_hit` (Postgres counters, hashed subjects), configured in `src/lib/rate-limit-config.ts`; it fails open.
- **Public-form pattern:** the privacy contact form (honeypot field `website`, service-role RPC, same response for every case).

## 2. The full design (Phase 1 and Phase 2, after launch)

**Migration outline (additive):**
1. `invite_code_hash(text)` = SHA-256 of the upper-cased, trimmed code, as hex (built-in `sha256`, no extension).
2. `join_requests` (`id`, `email` lower-case with a check, `note` up to 200, `status` pending/approved/rejected/revoked/expired/joined, `source` form/admin, `created_at`, `decided_at`, `decided_by`, `invite_id`, `approval_key`), a partial unique index on `email` where status is pending or approved, RLS with an admin-only select policy.
3. `invites`: add `code_hash` (unique, partial) and `join_request_id`; drop `not null` on `code` with a check that `code` or `code_hash` is set. `invite_is_usable`, `invite_check` and `handle_new_user` match either the plaintext code or the hash of what was typed, so the sign-up TypeScript does not change.
4. `email_outbox`: `user_id` nullable, `to_email`, kind `invite`, a shape check; `'invite'` added to `email_essential_kinds`; `enqueue_invite_email`.
5. Settings `invite_expiry_days` (7), `invite_daily_email_limit` (25), `resend_daily_limit` (100).
6. Functions (security definer, empty search_path, admin check inside, revoked from public and anon): `issue_invites`, `reject_join_requests`, `revoke_invite`, `reissue_invite`, `admin_invites_overview`, `invite_email_budget`, `request_to_join` (service role only), `purge_join_requests` (cron, not named `retention-*`, because the retention table, `docs/legal/RETENTION.md` and its test are legal-parked).
7. Audit rows carry ids and counts only: no email, no code.

**Email budget:** an invite costs one app email plus one Supabase confirmation email (Resend's 100 a day is shared), so about two a day per new member. Room today = the smallest of what is left of the app cap, what is left of the invite limit, and what is left of the provider limit after the app's mail and an estimate of Supabase's sign-up emails. Invites over today's room get later send times (00:05 UK on following days), so nothing is dropped; the invite's 7 days start at the send time. The code sits in the queue row only until the email is sent, then the processor clears it.

**Public form:** email plus an optional note (200 characters), honeypot, three limits (about 5 an hour per place, 3 a day per address, 300 a day overall), no acknowledgement email, and one answer whether the address is new, already asked, rejected or already a member. Residual risk: a small timing difference between a new insert and a no-op; the per-place limit makes it costly to exploit.

**Security review (summary):** flooding (limits, a backlog cap, honeypot, field limits); enumeration (same response and no acknowledgement; at sign-up the same message for every invite problem); code guessing (60 bits today with a 60-an-hour limit, about 99 bits for strong codes); no secrets in logs or audit rows; admin-only RLS; RPC parameters only, no dynamic SQL, no mass assignment; double-submit safety through a one-use key.

## 3. Tests (full design)
Unit (code generation and hash, schemas, budget split, status words), RLS (anon and members cannot read or call anything; non-admin gets `NOT_ADMIN`; unique pending per lower-case address; idempotent key; batch cap; legacy and hashed codes both work; expiry boundary; revoke; re-issue; no email or code in the audit log), Playwright (public form answers the same in every case, honeypot, approve, invitation in Mailpit, sign up with the right and wrong address, expired, revoked, reused, links shown once, deferral over a low cap, 375px), and the Linux Playwright image with `CI=true`.

## 4. Effort and risk (from the plan)
Phase 1 (admin approve and generate, email-bound codes, queue extension, budget) about 5 to 6 days; Phase 2 (public form, limits, retention job) about 2 to 3 days. Risk to 1 December: Phase 1 touches `handle_new_user` and the email processor, the two most critical paths, in the last two weeks; the CLI already makes email-bound, expiring invites, so none of this blocks launch. Hence the small version below and everything else after launch.

## 8. What was ported from `invites-admin-lite` (17 November 2026)

The reduced version (`origin/invites-admin-lite`, commit `3e54da6`: a smaller `/admin/invites`, an `admin_invites` migration, no emailing or hashing) is superseded by the full build on `main` and is not merged. Ported to `main` from it, in one small change:
- **Sign-up:** a mistyped, used, expired, revoked or wrong-address code all show the same message, "This code doesn't match this email. Use the address the invite was sent to.", so a person holding a code learns nothing about who it was made for. The generic check-email redirect for an already-registered address is unchanged. Tests updated.
- **`/join` not advertised:** the "No invite yet? Ask to join" link was removed from the sign-up page, and `/join` is marked `noindex`. The page still exists and is reachable by its address. Decision 2 (not advertised until after the first wave) and decision 13 (the public form waits for the parked privacy wording) are therefore honoured only partly: **the route itself is live once the migration is applied.** Do not apply the migration to hosted, or switch the route off, until the privacy wording is settled.
- **This plan** and the runbook wording.

**State of `main` (what an owner needs to know)**
- `/admin/invites`, `/join` and the email-queue extension are on `main`. Until `20261116000100` is applied to hosted, `/admin/invites` errors and `/join` answers "We could not save your request"; sign-up and email processing are unaffected.
- Applying that migration to hosted is an owner action with a dry run first (`--include-all`, from the owner's terminal), and it adds the `invite` kind to the essential email kinds, so check the email settings afterwards.
- Until it is applied, the supported way to make invites is the command line: `npm run invite:create -- --email <address> --days 7 --note "..."` (one code per address, bound to it).
