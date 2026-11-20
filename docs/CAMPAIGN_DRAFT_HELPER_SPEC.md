# Campaign draft helper: spec (approved with changes; not to be built until Dele says so)

Status: **approved with changes on 20 Nov 2026. Do not build, merge or deploy until Dele says so.** This revision is docs only: no code, migration or hosted change.

> **Note on an existing branch.** A first implementation was built before this approval and is pushed as `feat/campaign-draft-helper` (one commit, unmerged, nothing deployed). It follows the earlier version of this spec. It does **not** yet meet changes 1 to 3 below (full normalisation, real-model fixtures and check, the no-logging test) or the new privacy wording (change 4). It must not be merged. When Dele says to build, it is the starting point, or it can be deleted.

## What it is

An admin-only page, `/admin/campaigns/[id]/draft-helper`, linked from the Campaign admin page. The admin pastes source notes (text only). One AI call returns a draft the admin can read and copy. **Nothing is saved to the Campaign.** The admin pastes what they accept into the existing Campaign form themselves.

## Who can use it

Admins only, checked on the server for the page and for the action (the same `admin()` check the winner's summary uses). Members and signed-out visitors get the usual redirect or refusal. It is not a member feature and members' text never goes to it.

## What it drafts

| Part | Made by | Notes |
| --- | --- | --- |
| Public summary | The model | Plain text, within the Campaign form's 2,000-character summary limit. Neutral: sets out the question and the main considerations; takes no side. |
| Fact-check table | The model | One row per factual claim in the summary: **claim, source line, exact quote, status**. Status is always "unverified". The source line and quote must come from the pasted notes. |
| Re-check-by dates | The model | Plain text lines, only for dates that appear in the notes (for example a hearing). |
| Rules | **Code, not the model** | Built from one template in code that reads the live limits (Dispatches per member, Argument, Rebuttal and Evidence lengths, cooldown, edit window) and contains the corrected "Changing your mind" paragraph. Within the form's 10,000-character limit. |

Every part is labelled "AI draft - verify every fact" (the rules block adds that the site, not the AI, built it). Character counts are shown on every output against the Campaign form's limits (summary 2,000, rules 10,000) and on the notes box against its own limit.

**Rules cannot go stale.** The template is the single source of truth. A unit test fails if the template and the live limits disagree, and if the rules text in `docs/campaigns/*.md` differs from what the template produces. An RLS test fails if the database defaults differ from the code defaults.

## What it must never do

- Publish, schedule, save or change a Campaign, or write to any table other than the usage counter below.
- Fetch a URL or follow a link in the notes. Text only.
- Invent a fact, figure, date, quote or source. The validator rejects the whole draft if it finds one.
- Take a side, or use motive words the notes do not use.
- Name a member or include a handle.
- Present a claim as checked. Every claim is "unverified" until the admin checks it.
- Write the notes or any model output to a log, a table or the audit log (see "Nothing is logged").

## Validator

Reuses the patterns in `summaryProblems` (`src/lib/ai/engine.ts`): every figure, quotation and web address must appear in the pasted notes; no handles; no inferred motive. Added for this feature: every date must appear in the notes; every "exact quote" in the table must be a verbatim substring of the notes and of its own source line; each claim has a source line; the status must be "unverified". Anything that fails is discarded, never partly shown, and the admin sees a reason. A draft that fails is still one counted call.

### Normalisation before the checks (change 1)

Both the notes and every model-written string are normalised the same way **before** the substring, figure and date checks, so a format difference is never mistaken for an invention. Normalisation is for comparison only: the admin always sees the model's own text. It makes formats equal, never values: nothing that is a different figure or date may match.

| What | Treated as the same |
| --- | --- |
| Case, Unicode form | Lower case; NFKC; zero-width characters removed |
| Quotes | ‘ ’ ‚ ′ ` all become `'`; “ ” „ ″ « » all become `"` |
| Dashes and hyphens | – — ‒ ― − and the Unicode hyphens all become `-`; spaces around a dash between digits are removed (2026–27 = 2026-27) |
| Ellipsis | … becomes `...` |
| Whitespace | Every run of spaces, tabs, line breaks, non-breaking and thin spaces becomes one space; ends trimmed |
| Numbers | `1,000` = `1000` = `1 000` (thin or non-breaking space); `£1.2 million` = `£1.2m` = `1,200,000`; ordinals `3rd` = `3`. Compared by value, so `1,000` is not `100` and `1.0` is `1` |
| Percentages | `10%` = `10 %` = `10 percent` = `10 per cent` = `10 per-cent` |
| Dates | `3 December 2026` = `3 Dec 2026` = `3rd December, 2026` = `December 3, 2026` = `3/12/2026` (day first, UK) = `2026-12-03`. Compared as day, month and year. An output date matches a date in the notes if day and month are equal and the years are equal or one side gives none. A month and year, or a year alone, must appear in the notes in the same way. Two-digit years are not interpreted (compared as plain numbers) |
| Source line and quote | Compared after the same normalisation. A quote must be one unbroken stretch: it may not use `...` or `[...]` to join pieces |

Number words ("ten", "a third") are not treated as figures; the prompt tells the model to use the notes' own digits. If a form is not in this table, it is not equal.

Tests for this (table-driven, both directions): every equivalent pair above passes; every near miss fails (`1,000` against `100`; `3 December` against `13 December`; `3 Dec 2026` against `3 Dec 2025`; `10%` against `1.0%`; `£2.4 million` against `£24 million`; a quote with a changed word; a quote joined with `...`).

### Tests built from real model output, and a real-model check (change 2)

The fake provider cannot show whether the validator is right (the coach eval passed 20 of 20 on the fake provider while the real model failed 8 of 20 on one over-greedy rule). So:

- **Fixtures from real outputs.** Validator tests are built from real model answers. Every real answer that the validator rejects wrongly (a valid draft discarded) or accepts wrongly (an invention let through) is kept as a fixture, as `evals/campaign-draft-validator-fixtures.json` (the raw model JSON, the notes it came from, and the verdict that is correct). A validator change must keep every fixture's verdict. Fixtures use only notes that are public and that Dele agrees can be committed.
- **A manual real-model check before first use.** Run on **2 or 3 real note sets** chosen by Dele (proposed: the sources for `under-16-social-media-ban` and `vat-on-private-school-fees`, and one more). A script, `npm run eval:campaign-draft -- --real` (modelled on `eval:coach`), reports per note set: ok or discarded, the reason category for each discard (JSON, schema field, validator rule, refusal, truncation), tokens and cost, and writes the raw failing outputs to `evals/out/` (git-ignored). It exits non-zero on any failure. The first-use gate is: no unexplained discard, every discard classified as a correct rejection or turned into a fixture and fixed, and Dele has read the three drafts and their tables. No first use before that. It is not run in CI and never with the real key in CI.

## Nothing is logged (change 3)

**A validator failure, or any failure, never writes the notes or the model's output to a log.** Checked against the first implementation: `campaign-draft.ts` and the action contain no `console`, `logEvent`, audit or insert call; the engine's call function logs nothing; the only log lines on this path carry an error code or a bucket name (`ai_record_usage failed <code>`, `rate_limit_hit failed <code>`, `rate_limited <bucket>`). Two things the spec now fixes:

- The on-screen reason for a discard may name the rejected figure, month or word, and nothing longer: never a line of the notes, never more than 40 characters of model text. It goes to the admin's browser only.
- The action catches everything from the AI call and returns a message, because the framework logs the text of an uncaught server error. A provider error message is not shown or logged.

**Required test.** With spies on every `console` method, on the event logger, and on every database write, run the helper and the action with notes that contain a unique sentinel string, against scripted providers that (a) return an invalid draft containing the sentinel as a figure, (b) return broken JSON containing the sentinel, (c) throw an error whose message contains the sentinel, and (d) return a valid draft. In every case the sentinel (and any other part of the notes or the draft) must appear in no spy argument, and the only database write is the usage counter. The call's result must not carry the raw model text. A Playwright check confirms no `ai_usage`, `system_events` or `audit_log` row contains the sentinel.

## Where output is stored

**Nowhere.** It is returned to the page and held in the browser only; leaving the page loses it. No new table, no column, no migration. TGS does not store the notes or the draft. The usage counter (below) records counts and token totals only.

## AI daily cap and spend

- **Feature key:** the existing **`judge_rationale`** key, shared with the winner's summary (a new key would need a migration, because `ai_usage.feature` is a CHECK list). Accepted consequence: Admin's usage panel cannot tell the two apart.
- **Daily cap:** the call goes through `ai_reserve_call`, so it counts against `ai_daily_cap_global`, is refused when AI is off or the cap is reached, and, like other judging calls, is refused once 80% of the day's cap is used (room is kept for screening Dispatches).
- **10 calls a day per admin:** a new bucket in `src/lib/rate-limit-config.ts` (`campaign_draft_admin`, max 10, one 86,400-second window aligned to UTC midnight, keyed on the admin's hashed id). No migration. It resets at 00:00 UTC, not at the UK day. The limiter **fails open** if its counter errors (only the global cap then applies). Accepted for this admin-only bucket, because the global cap still bounds the spend.
- **Spend:** tokens go to `ai_usage` through the existing path. The page shows the estimated cost of the call. One call per press, with the engine's one retry. Model: the judging model setting. Notes are limited to 12,000 characters (and at least 100); anything outside that is refused before any call or reservation.

## Public wording (change 4)

The privacy sentence is **"TGS does not store the notes."** Checked against the existing wording:

- **Privacy page, "Automated checks and AI help":** the coach says "We do not keep your draft", the tone check and coach list what is kept (coach feedback and its rating: 90 days in "How long we keep it"), and one paragraph says Anthropic processes the text under a data processing agreement, deletes inputs and outputs within 30 days (marked for the owner to confirm), and does not train on them. The new sentence is consistent: it says what TGS keeps, and it does not claim anything about Anthropic, which the existing Anthropic paragraph already covers for "this text".
- **Proposed changes:** add a fifth bullet under the AI uses and change "There are four uses" to "five"; add the bullet "**Campaign drafting (admin only).** An admin can paste source notes to get a draft Campaign summary, a fact-check table and dates to re-check. The notes are sent to Anthropic. TGS does not store the notes. Nothing is published without an admin."; add to "For each check we keep a record…" that for Campaign drafting TGS keeps only a count of calls and tokens; add a row to "How long we keep it": "Campaign drafting notes and drafts: not stored by TGS". On `/ai-use`, add the same bullet as a paragraph. The helper page's own notice changes from "we do not keep them" to "TGS does not store the notes."
- **To confirm before it is true:** that our hosting provider's ordinary request logs do not record request bodies (the privacy table already lists "Security logs at our providers"). Not verified in this spec; Dele or the build must check the Vercel logging setting before the sentence goes live.

## Prompt-injection exposure

- The notes are untrusted (they may be copied from articles or other people). They go to the model only through `buildUserMessage` and `untrustedBlock`, which defuse look-alike delimiters and tell the model the text is data.
- Output is a fixed JSON schema; anything that does not validate is discarded.
- The model has no tools and cannot fetch, write or publish. The worst realistic outcome is a slanted or wrong draft. The validator catches figures, dates, quotes and handles but **cannot** catch framing or omission, which is why every output says "verify every fact" and the admin reads it. Output is rendered as plain text (no HTML, no auto-links).
- Injection fixtures are added to the existing injection test, as for the other AI features.

## How it is tested without the real model

- **Unit:** the normalisation table (both directions, with near misses); validator fixtures (invented figure, date, quote, URL and handle each rejected; an exact quote accepted; a non-"unverified" status rejected); the rules template against live limits and `docs/campaigns/*.md`; the 10-a-day bucket; scripted-provider cases for AI off, cap reached, invalid output and over-length notes; the no-logging test above.
- **Fake provider:** a deterministic, keyword-driven stand-in for the new task (as for the coach and judge). CI never calls the real API (`chooseProvider` returns none under Vitest and CI).
- **Injection:** notes containing "ignore your rules", a fake closing tag and a fake "TGS, trusted" line go to the fake and to a scripted provider that obeys them; the output must be discarded or unchanged.
- **RLS:** no new table or function, so no new policy. One test confirms the database limits equal the code defaults.
- **Playwright:** an admin pastes notes and sees the label, the table with "unverified" and the counts; a member is refused; the 11th call in a day is refused; nothing is written to the Campaign; nothing sensitive appears in the usage, event or audit rows.
- **Real model:** only the manual check above, owner-run, never in CI. The fake provider's pass is not evidence about the real model.

## Decisions recorded (20 Nov 2026)

1. **Model:** the judging model setting (`resolveModel("judging")`).
2. **Notes limit:** 12,000 characters maximum, 100 minimum.
3. **Rate limit:** 10 a day per admin; **UTC reset accepted**; **fail-open accepted** for this admin-only bucket given the global cap.
4. **Feature key:** `judge_rationale` stays shared. No migration.
5. **Audit log:** **deferred.** Not in the first version; revisit after the audit action list has been checked. Counts only, never notes.
6. **Location:** the sub-page `/admin/campaigns/[id]/draft-helper`, linked from Edit Campaign.
7. **Public pages:** the privacy sentence is "TGS does not store the notes." (change 4), once the hosting-log check passes.

## Footprint (for scale)

New: `prompts/campaign-draft.v1.md`, an AI task and JSON schema, the normaliser and validator, the rules template, the admin page and one server action, an eval script and a fixtures file. No migration, no new table. Existing files touched: `src/lib/ai/engine.ts`, `prompts.ts`, `providers/types.ts`, `providers/anthropic.ts`, `providers/fake.ts`, `src/lib/rate-limit-config.ts`, the Edit Campaign page, and the `ai-use` and `privacy` pages (wording).
