# Session log: hosted invites, sign-in confirmation, admin role, launch email docs, legal sprint (7 to 12 November 2026)

For sharing with Claude. Written after re-checking hosted. No code, migration or branch changed; only data on hosted (one new invite). Working branch at the time: `sprint-4-audit-handle` (head `bc88132`, in sync with origin, untouched).

## Diagnosis (one sentence)
`TGS-QATF-5TGH-T2CG` is not missing, revoked, expired or used up: its single place is **held by an unconfirmed sign-up** (`boy1+delesax@gmail.com`), so `invite_is_usable` returns **false**.

## Read-only evidence (hosted, 7 November 08:06 UTC)
- Invite row: `max_uses 1`, `use_count 0`, `revoked_at` null, `expires_at` 9 Nov 2026 11:37 UTC (still in the future), created 2 Nov 2026.
- `invite_reserved_count` = **1**. Rule (migration `20261103000100`): a sign-up reserves a place for 24 hours until its email is confirmed.
- One profile has this `invite_id`: `boy1+delesax@gmail.com`, `email_confirmed_at` **null**, profile created 7 Nov 06:17:34 UTC, `invite_consumed_at` null, no handle.
- Reservation lapses at about **8 Nov 06:17 UTC** unless that email is confirmed first. If it is confirmed, the code's one use is consumed.
- No user or invite row was edited or deleted.

## Fresh code
- **`TGS-STX4-SH3A-79Y3`**: 5 uses, expires 21 Nov 2026, note "Owner QA test, plus-address sign-up, retries allowed". Created with `npm run invite:create` against hosted (target checked as hosted).
- `invite_is_usable('TGS-STX4-SH3A-79Y3')` = **true**; `use_count 0`, not revoked. It was the only invite created in the last 30 minutes.

## Practical notes
- A new sign-up with the same address `boy1+delesax@gmail.com` is probably not a clean retry: that account already exists unconfirmed, so no new reservation is made against the new code. Either use a different plus-address (for example `boy1+delesax2@gmail.com`), or confirm the existing account from its confirmation email.
- Not established: why the first confirmation never happened (email not delivered, or link not opened). I did not check hosted Auth email settings or logs.

## Problems met
- None blocking. Throwaway read scripts were copied into `scripts/`, run, and deleted; `git status` shows only the pre-existing untracked session logs in `docs/` plus this file.

## Still open
- Decide whether to confirm or let the old unconfirmed sign-up lapse (it clears itself by about 8 Nov 06:17 UTC).
- Everything listed under "Still open" in `SESSION_LOG_SPRINT4_FOLLOWUP.md` is unchanged and was not touched.

## Follow-up (7 November, later): confirm link and email template
- **Account on `TGS-STX4-SH3A-79Y3`** (read-only, hosted, 08:23 UTC): one profile, `delesax+tgs2@gmail.com`. Signed up 08:13:40; `email_confirmed_at` **08:14:16** (36 seconds later); `invite_consumed_at` 08:14:16; `last_sign_in_at` 08:18:01; no handle yet. Invite `use_count 1` of `max_uses 5`.
- **Answer:** yes, Supabase confirmed the email and consumed the invite place, so the `confirm_failed` redirect was the app failing to start a session, not the confirmation failing. The later sign-in (08:18) fits the person then signing in by hand. I did not see the redirect itself; that is the owner's report.
- **Link format the app expects:** `src/app/auth/confirm/route.ts` takes either `token_hash` + `type` (calls `verifyOtp`, works on any device) or `code` (calls `exchangeCodeForSession`, which needs the code-verifier cookie from the browser that signed up). `signUp` in `src/app/(auth)/actions.ts` sets `emailRedirectTo = <SITE_URL>/auth/confirm?next=/onboarding` and sends no custom template.
- **Likely cause (not proven):** hosted still uses Supabase's default **Confirm sign up** template, whose link ends in a `code`; opened in a different browser or device the verifier cookie is missing, so the exchange fails after Supabase has already confirmed the address.
- **Docs:** `docs/LAUNCH_EMAIL_SETUP.md` had no step for the Confirm sign up template. Added step **12a** (template body written by me from what the route expects, because the message said "the template above" but no template was attached), a test-checklist item for opening the link on another device, and a troubleshooting line. Branch `launch-email-confirm-template`, one commit from `origin/main` (`cbc3d7a`). **Pushed to origin on 7 November. It has since been merged into `main` (`9dffdd0` is an ancestor of `origin/main` `eec5c7c`), so step 12a is on `main`.**
- **Not done:** the hosted template itself is unchanged (dashboard setting, owner action). No data edited or deleted.

## Later: launch email doc edits (7 November), not committed
- Owner asked for `docs/LAUNCH_EMAIL_SETUP.md` to match the real setup: Resend sending subdomain `updates.thegrandstrategist.com` (Ireland, receiving off), registrar 20i with existing root records left alone, sender `notifications@updates.thegrandstrategist.com`, DMARC optional and skipped, API key limited to the `updates` domain, Vercel domains already added with `www` redirecting, `.co.uk` redirect still to do, checklist sender updated. Step 12a, the checklist item for another device and the troubleshooting line were left exactly as they were.
- **State (checked 12 November): these edits are still UNCOMMITTED** in the main checkout (`TGS/`, branch `launch-email-confirm-template`, `git diff` shows 10 insertions and 10 deletions in that one file). `main` does not have them yet (`origin/main` has step 12a but no `updates.thegrandstrategist.com` text). Needs: commit, push, owner opens a PR. Docs only; no code or data.

## Later: admin role on hosted (7 November)
- Owner asked to give the existing account `delesax@gmail.com` the admin role on hosted. Target checked first: host `jsbgactqutgoacogsoct.supabase.co` (hosted). Account existed and was email-confirmed (1 Nov 09:01 UTC) with no role.
- Ran `npm run admin:set -- --email delesax@gmail.com`; read-back showed `app_metadata.role = "admin"`. The script also wrote one `audit_log` row (`admin.role_granted`, user id only). Nothing else changed.
- The account must sign out and back in before the admin link appears (the role is read from the sign-in token).

## Later: legal hardening sprint (7 to 12 November)
- Built by a separate Claude session from `docs/LEGAL_HARDENING_BRIEF.md` (untracked in this checkout) on branch `legal-hardening`, worktree `TGS-legal/`. Detail is in `docs/SESSION_LOG_LEGAL_HARDENING.md` on that branch, plus `docs/CLAUDE_LOG.md`.
- **State (checked 12 November):** pushed (19 commits ahead of `origin/main` as of 12 November); code and docs complete at `ccb2822`, later commits only change the logs, and one further log-only commit may still be unpushed. Run `git log origin/main..origin/legal-hardening` in `TGS-legal/` for the exact head. No PR yet. Six migrations `20261107000100` to `20261107000600` written and **not applied to hosted**. Tests reported by that session: unit 174, RLS 238, Playwright 29 pass. `sprint-4-audit-handle` is on origin but not merged into `main`.

## Open for the owner (all items from this log)
1. Decide what to do with the old unconfirmed sign-up `boy1+delesax@gmail.com` (it held the first invite's only place; the reservation lapses about 8 Nov 06:17 UTC). The 5-use code `TGS-STX4-SH3A-79Y3` has 1 use so far.
2. Set the **Confirm sign up** template on hosted (dashboard step 12a in `docs/LAUNCH_EMAIL_SETUP.md`).
3. Commit and push the uncommitted launch-email doc edits, then open a PR.
4. Open the `legal-hardening` PR, supply the bracketed facts, and apply its six migrations only after a dry run and review.
