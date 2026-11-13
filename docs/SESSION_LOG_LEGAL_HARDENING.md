# Session log: legal hardening (branch `legal-hardening`)

Working notes, written as the work went. The final summary sits at the end.

## Start-up checks

- `origin/main` at the start of the work: `eec5c7c` (it had moved on from `cbc3d7a` with two docs-only commits).
- **Branch `sprint-4-audit-handle` is NOT merged** (it is on `origin`, but `git branch -r --merged origin/main` does not list it). Its migration `20261104000500_audit_no_handle.sql` is therefore not in this branch. Consequence for Part 4D: the sentence "In rare cases a moderator's note may mention your handle." IS included on the delete page. If you merge that branch, remove the sentence (the line is marked in `src/app/profile/delete/page.tsx`).
- Migration timestamps in this branch all start with `20261107`, after `20261104000500`.
- The local Supabase had `20261104000500` applied (from testing that branch), so I asked you and ran `supabase db reset --local` to rebuild it from this branch. Local only. Hosted was never touched.

## Part 3 inspection: how positions work today (before this sprint)

1. **Where a position is recorded.** Table `campaign_positions` (migration `20261102000100`): one row per Strategist per Campaign, with `before_position` and `after_position` (`for`, `against`, `undecided`) and timestamps. Row-level security: you can read and write only your own row (admins can read). The before position locks when the Campaign starts, the after position opens then, and everything locks at close. No delete policy existed. When an account is deleted, positions on closed Campaigns move to `anonymous_positions` with no link to a person.
2. **Was it optional?** No. `post_dispatch()` raised `POSITION_REQUIRED` unless a position was on record, and the Campaign page told people "Record your position to post".
3. **Did posting require one?** Yes (as above), and in an Oxford-style Campaign it had to be For or Against.
4. **Was the Oxford side (For/Against) stored publicly with the Dispatch?** Yes, and that was the problem: `post_dispatch()` copied the author's private position into `dispatches.position`, which is publicly readable and shown as a For/Against tag on every Dispatch (open-arena Campaigns too). So the "private" position was published the moment someone posted. This was untrue to the wording "We keep it private", so I changed it (see below).
5. **How the mind-change score uses positions.** It does not yet: judging is Sprint 5 and no code reads positions for scoring (only the comment "for the Sprint 5 mind-change measure"). I added the view `consented_positions` as the only thing that measure may read.

## Part 3 what was built

- Migration `20261107000200_positions_consent.sql`:
  - `profiles.positions_consent_at` and `positions_consent_version` (not in any browser column grant; only the server reads or writes them).
  - Recording a position needs consent (insert policy calls `has_positions_consent()`); existing rows are untouched.
  - A Strategist can clear their own position while the Campaign is open (new delete policy). The notice you gave says "withdraw ... by clearing your position", so this had to exist.
  - `withdraw_positions_consent(user)` (service role only): deletes open-Campaign positions, moves closed-Campaign positions to `anonymous_positions` (no link to a person), clears the consent, writes one audit entry `positions.consent_withdrawn` with counts only.
  - `consented_positions` view (service role only): positions of people who consented.
  - `post_dispatch()` no longer needs or reads a position. New optional argument `p_side`: in an Oxford-style Campaign the author chooses For or Against when posting, and that is what is shown publicly. In every other Campaign a Dispatch carries no side.
- App: first-time notice and required tick box (your exact wording) on the position form; "Clear my position" button; "Stop recording my positions" on the Account page; Oxford compose form asks "Which side does your Dispatch argue?".
- Tests: `tests/rls/positions-consent.test.ts` (new), changes to `dispatches.test.ts`, `rounds-positions-scheduler.test.ts`; e2e first-position notice in `tests/e2e/dispatches.spec.ts`.

### Part 3: what is NOT done / to know

- Existing Dispatches already on hosted keep the `position` that was copied onto them earlier. If any real ones exist, decide whether to blank `dispatches.position` for non-Oxford Campaigns (test data only so far, as far as I know).
- Until a person withdraws or deletes their account, their positions on **closed** Campaigns stay linked to them (private to them and admins). The privacy policy's retention table says closed-Campaign positions are "kept with no link to you". I worded that row to say when the link is cut (see Part 4A).
- The mind-change measure itself does not exist yet, so "only counts people who gave consent" is enforced by the `consented_positions` view; Sprint 5 must read from it.

## Part 4D: what deleting an account leaves behind

**(a) What do Verdict pages, award lists, the Dossier and search show for a deleted person?**

- **Dispatch threads:** "A deleted Strategist" (already so).
- **Search:** showed "By @null" for a Dispatch by a deleted author. Fixed: it now says "a deleted Strategist". Tombstones have no handle, so they are not found as people.
- **Dossier / Strategist pages:** a Dossier is the signed-in person's own page, and `/strategists/<handle>` needs a handle; a tombstone has none, so there is no page to show.
- **Admin moderation queue:** showed "@a deleted Strategist". Fixed.
- **Verdict pages and award lists do not exist yet** (Sprint 5). The database is ready (`awards.profile_id` points at the tombstone and the rationale text is scrubbed, below), but **Sprint 5 must render a tombstone as "a deleted Strategist" and must never print a handle stored as text.**
- **Other people's queued reply emails** carried the replier's handle in their payload. Now scrubbed.

**(b) Columns or text that keep a copy of a handle or name as plain text**, and whether `anonymise_profile()` covers them (migration `20261107000300_anonymise_text_copies.sql`, tested in `tests/rls/anonymise-text-copies.test.ts`):

| Where | Covered now? |
| --- | --- |
| `ai_decisions.subject_id` / `output` for handle, display_name, bio | Yes (already) |
| `ai_decisions.reason`, `override_reason` | **Yes (new)**: handle mentions replaced with "a deleted Strategist" |
| `moderation_flags.details.handle` | **Yes (new for every flag**; before, only open handle flags) |
| `moderation_flags.resolution_reason` | **Yes (new)** |
| `awards.rationale` (Verdict and award rationales) | **Yes (new)** |
| `dispatch_appeals.decision_reason`, `dispatch_reports.details` (other people's words) | **Yes (new)** |
| `email_outbox.payload.replier_handle` in OTHER people's queues | **Yes (new)** |
| `email_outbox` / notification rows of the deleted person | Yes (deleted) |
| **`audit_log.details`** | **No, cannot be fixed.** The table is append-only. Two writers put a handle in: `decide_held_handle()` (fixed by `sprint-4-audit-handle`, **not merged**) and the onboarding step `profile.handle_set`, which wrote `{handle}` for **every** account. I fixed the second going forward (`src/app/onboarding/actions.ts` now writes `{}`). **Existing rows keep their handles until the six-year purge.** On hosted these are probably test accounts only: [OWNER TO CONFIRM]. This is why the delete page keeps the sentence "In rare cases a moderator's note may mention your handle", and why "uses a reference number, not your name" is not strictly true for older rows |
| Dispatch bodies, edit history, sealed text | By design they stay (the delete page says so). A Dispatch by someone else that mentions the handle also stays |
| `dispatch_appeals.reason` (the deleted person's own text) and `dispatch_reports.details` they wrote, `coach` text | Not scrubbed: their own free text may contain their name. Appeals have no retention job. **Decision needed** |
| `display_name` written into other people's text | Not matched: names are short and common |
| Provider copies (Anthropic 30 days, Resend, Supabase and Vercel logs) | Out of our control; the privacy policy says so |

## Part 6: inventory of the real tables and columns

| Data | Table and column used | Notes |
| --- | --- | --- |
| Never-confirmed sign-ups | `auth.users.email_confirmed_at is null and created_at < now() - 30 days` | Deleting the auth user fires `before_auth_user_deleted`, which anonymises and then removes the profile (nothing depends on it). Safe: profiles no longer cascade from auth.users (migration `20261104000200`), so I relied on that trigger, not on a cascade. Tested: confirmed users (even 400 days old, or confirmed late) are never touched; an open privacy request protects an account; the invite stays usable |
| AI decisions | `ai_decisions.created_at`, subject types dispatch/handle/display_name/bio | Coach and nudge decisions are in the 90-day job |
| Coach feedback | `ai_decisions` (coach, nudge) and `coach_feedback.created_at` | The feedback text lives in `ai_decisions.output`; ratings in `coach_feedback` |
| Reports | `dispatch_reports.resolved_at` (status not open) | |
| Moderation flags | `moderation_flags.resolved_at` (status resolved) | |
| Emails | `email_outbox.created_at` | Not rows currently `sending` |
| Passkey challenges | `webauthn_challenges.expires_at` | |
| Privacy requests | `privacy_requests.closed_at` | |
| Audit | `audit_log.created_at` | |

Not covered by an approved period (decision needed): `dispatch_appeals`, `ai_usage`.

pg_cron runs in **UTC**: the jobs run at 03:17 to 03:31 UTC, which is 03:17 to 03:31 UK in winter and an hour later in summer.

## Part 7: what the export still cannot include safely

- **Soft undeclared-AI flags** (`moderation_flags`) and the AI's structured output for Dispatch decisions: owner decision 2 says the flag is never shown to the author. A solicitor should say whether that survives a subject access request, because it is personal data about the person. Today it is left out of the self-service download and could be given on request by an admin.
- Reports other people made about the person's Dispatches, reviewer and administrator identities, who follows them: other people's data, left out (tested).
- Provider-held data (Anthropic, Resend, logs): not in our database, so not in the file.

## Part 9 notes

- `topics:load` only inserts; it never updates. So the hosted DRAFT Campaigns are updated with `scripts/update-draft-topics.ts`. It matches the three slugs, changes only rows with `status = draft` (also enforced in the UPDATE itself), never the schedule, status, wave or slug, and is a dry run unless `--confirm`.
- The Bank of England **slug** still contains "november" (`bank-of-england-rate-decision-november`). I left it: it is an identifier, and changing it would make the next `topics:load` create a duplicate on hosted. Say if you want it renamed.
- Assisted dying: "three rounds" is written in the admin note. I did **not** create round rows, because rounds need dates and you said not to change its schedule.
- Your assisted-dying note is 519 characters; the column allowed 500. I raised the limit to 1,000 (migration `20261107000600`, plus the admin form and validation) rather than shorten your wording.
- Setting the AI cap by `UPDATE` also fires the existing settings trigger, so the audit log gets your `settings.changed` entry **and** the usual `settings.updated` one.
- The topics file's other fields for the three topics (summary, sources) were reworded only where they carried a date or the old title.

## Wording that was untrue to the code, and what I changed

1. **Positions "private" / "Anyone outside our moderation team sees only anonymous totals":** the code copied the private position onto every public Dispatch. Changed so a private position is never published; an Oxford Dispatch's side is chosen at posting.
2. **Retention table, "Positions on open Campaigns / Until the Campaign closes or you withdraw..." and "Positions on closed Campaigns / Kept with no link to you":** positions stay linked to the person when a Campaign closes; they are unlinked only on withdrawal or deletion. I worded the two rows to say exactly that.
3. **"It uses a reference number, not your name" (safety record):** not true for older audit rows (see 4D(b)). Kept the brief's sentence and the conditional handle sentence; fixed the source going forward.
4. **Accessibility: "We test with [tools]":** the repo has no automated accessibility scanner. The page says what is really run (Playwright at 375px, overflow checks) and says plainly that there is no scanner or screen-reader audit yet. It does not claim a manual keyboard check, since none is recorded.
5. **"We use only the cookies needed to keep you signed in":** the audit found sign-up also sets code-verifier cookies (400 days, random value) and the app stores two small things in the browser. The cookie table lists all of it; the sentence is kept because they are all strictly necessary.
6. **"Search engines may list them" vs "We ask search engines not to list them":** there is no robots file or noindex setting, so the true sentence is "Search engines may list them". Public Campaign and Dispatch pages are readable without signing in. If you would rather ask them not to, that is a small code change [OWNER TO DECIDE].
7. **"Dispatches on sensitive topics are held until a person has looked":** true in the code only when the AI is unavailable (fallback) or the AI itself flags the text at the lower sensitive threshold; it is not a blanket hold on every Dispatch in a sensitive Campaign. Kept the brief's sentence; **[OWNER TO CONFIRM it is what you mean]**.
8. **"You can withdraw ... by clearing your position":** there was no way to clear one. Built it.

## What I did not finish or could not do

- **Hosted dry run of the draft-Campaign script:** done once with your OK, read-only, run from the main checkout so it could load the hosted keys without printing them. All three hosted rows are still `draft`; the diff is exactly the decisions (Bank of England: new title, template summary, notes, owner decision cleared, brief; Rosebank: new title and the three-conditions note; assisted dying: Oxford, your content note, notes, brief). Output is in the shared notes folder (`hosted-draft-topics-dry-run.txt`). **Not run with `--confirm`.**
- **Supabase-sent emails** (sign-up confirmation, password reset): their footer is set in the Supabase dashboard; the snippet is in `docs/legal/AUTH_EMAIL_FOOTER.md`.
- **A real `reviewed = true` flip:** by design not done.
- **Age assurance, appeals and AI-usage retention, emailed-request logging, an admin "withdraw consent" button:** recorded as owner decisions in the `docs/legal/` files.
- **Lifetimes of cookies:** measured on a local production build, not the live site.
- **Existing hosted rows:** hosted Dispatches that already carry a copied private position (non-Oxford) and `profile.handle_set` audit rows keep them. Probably test data: [OWNER TO CONFIRM].

## Anything surprising

- The **local Supabase had `20261104000500` applied** (from testing `sprint-4-audit-handle`), which blocked applying new migrations. With your OK I reset the local database. If you work on that branch again, reset again.
- A **pre-existing bug**: handles were written into the append-only audit log for every account (above).
- **`campaign_positions` copying onto `dispatches.position`** made the "private" position public (above).
- `main` moved while I worked (two docs commits); this branch is on `eec5c7c`.
- The main checkout still holds your uncommitted edits to `docs/LAUNCH_EMAIL_SETUP.md` (Resend subdomain, 20i registrar, and so on). I worked in a separate worktree (`/Users/deleolaoye/Project/TGS/TGS-legal`) and did not touch them or commit them to this branch.
- `evals/out/` files are written by the evals and are git-ignored.

## Every bracketed fact still owed

See `docs/LEGAL_WORDING.md` (thirteen items, plus the owner actions in `docs/legal/README.md`).

## Verification

Typecheck and lint clean. Unit 174, RLS 238, Playwright 29 pass on a freshly reset local database. `eval:moderation` and `eval:coach` (fake provider): recall 100%, false holds 0%.

## Where it stands (checked 12 November)

- **Pushed.** `origin/legal-hardening` is pushed and is 19 commits ahead of `origin/main` (`eec5c7c`) as of 12 November. The code and docs were complete at `ccb2822`; every later commit changes only `docs/CLAUDE_LOG.md` and the session logs. Run `git log origin/main..origin/legal-hardening` for the exact head: it is deliberately not written here, because each log update would make it stale.
- **No pull request yet** (the owner opens it on GitHub; CI runs only once it exists). Nothing is merged.
- **Hosted:** nothing applied. The six migrations (`20261107000100` to `20261107000600`) wait for review, a hosted dry run that lists exactly those six, and the owner's OK. The draft-Campaign script was never run with `--confirm`.
- `sprint-4-audit-handle` is on `origin` and still not merged into `main`; `sprint-5-judging` is not on `origin` yet.
