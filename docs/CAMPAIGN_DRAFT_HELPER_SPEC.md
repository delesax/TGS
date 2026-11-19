# Campaign draft helper: spec (not built)

Status: **proposal for the owner to review. No code, migration or hosted change has been made.** Written 19 Nov 2026 against `main` at `45371bc`.

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
| Rules | **Code, not the model** | Built from one template in code that reads the live limits (Dispatches per member, Argument, Rebuttal and Evidence lengths, cooldown, edit window) and contains the corrected "Changing your mind" paragraph. It stays within the form's 10,000-character limit. |

Every part is labelled "AI draft - verify every fact". Character counts are shown the way the existing Campaign admin form shows them (to be matched exactly when built).

**Rules cannot go stale.** The template is the single source of truth. A unit test fails if the template and the live limits disagree, and if the rules text in `docs/campaigns/*.md` differs from what the template produces. A stale rules paragraph was copied once already; the docs files are checked, not trusted.

## What it must never do

- Publish, schedule, save or change a Campaign, or write to any table other than the usage counter below.
- Fetch a URL or follow a link in the notes. Text only.
- Invent a fact, figure, date, quote or source. The validator (below) rejects the whole draft if it finds one.
- Take a side, or use motive words the notes do not use.
- Name a member or include a handle.
- Present a claim as checked. Every claim is "unverified" until the admin checks it.

## Validator

Reuses the patterns in `summaryProblems` (`src/lib/ai/engine.ts`): every figure, quotation and web address must appear in the pasted notes; no handles; no inferred motive. Added for this feature: every date must appear in the notes; every "exact quote" in the table must be a verbatim substring of the notes; the status must be "unverified"; each claim must have a source line. Anything that fails is discarded, never partly shown, and the admin sees a reason ("a figure that is not in your notes"). A draft that fails is still one counted call.

## Where output is stored

**Nowhere.** It is returned to the page and held in the browser only; leaving the page loses it. No new table, no column, no migration. Neither the pasted notes nor the draft is stored by us, and the notes are not written to logs. The usage counter (below) records counts and token totals only.

## AI daily cap and spend

- **Feature key:** the nearest existing key is **`judge_rationale`**, the one the winner's summary already uses. A new key would need a migration (`ai_usage.feature` is a CHECK list), which is out of scope. Consequence: its calls are counted with the summary's in Admin's usage panel and cannot be told apart there.
- **Daily cap:** the call goes through `ai_reserve_call`, so it counts against `ai_daily_cap_global`, and is refused when AI is off or the cap is reached. Like other judging calls it is also refused once 80% of the day's cap is used, which keeps room for screening Dispatches.
- **10 calls a day per admin:** `ai_reserve_call` has no per-admin cap for this key, so the limit is added in the app as a new bucket in `src/lib/rate-limit-config.ts` (`campaign_draft_admin`, max 10, one day, keyed on the admin's hashed id). No migration is needed. Two caveats: the window is a fixed 86,400-second block aligned to UTC midnight (the database allows at most that), not the UK calendar day, so the day rolls over at 00:00 UTC (01:00 or 00:00 UK); and the limiter fails open if the counter errors, in which case only the global cap applies.
- **Spend:** tokens go to `ai_usage` through the existing `record` path. The page shows the estimated cost of the call, as the summary block does. One call per press, no automatic retries beyond the engine's one retry. Model: the judging model setting (`resolveModel("judging")`). Notes are capped (proposal: 12,000 characters) and over-length notes are refused before any call.

## Do the AI-use and privacy pages already cover it?

**No.** `/ai-use` and `/privacy` cover the safety check, tone check, coach and the winner's summary (admin-only). None mentions an admin sending their own source notes to Anthropic to draft a Campaign. Proposed: one sentence on each, "Admins can paste source notes to get a draft Campaign summary; the notes are sent to Anthropic, are not stored, and nothing is published without an admin," for the owner to approve before build. No member data is involved.

## Prompt-injection exposure

- The notes are untrusted (they may be copied from articles or other people). They go to the model only through `buildUserMessage` and `untrustedBlock`, which defuse look-alike delimiters and tell the model the text is data.
- Output is a fixed JSON schema; anything that does not validate is discarded.
- The model has no tools and cannot fetch, write or publish. The worst realistic outcomes are a slanted or wrong draft, which the validator catches for figures, dates, quotes and handles but **cannot** catch for framing or omission. That is the reason for "verify every fact" and for the admin reading it. Output is rendered as plain text only (no HTML, no auto-links).
- New injection fixtures are added to the existing injection test, as for the other AI features.

## Implementation footprint (for scale, not built)

New: `prompts/campaign-draft.v1.md`, an AI task and JSON schema, the validator, the rules template, the admin page and one server action. No migration, no new table. Existing files touched: `src/lib/ai/engine.ts`, `prompts.ts`, `providers/types.ts`, `providers/fake.ts`, `src/lib/rate-limit-config.ts`, `ai-use` and `privacy` pages (wording, if approved).

## How it is tested without the real model

- **Unit:** validator fixtures (invented figure, date, quote, URL and handle each rejected; an exact quote accepted; a non-"unverified" status rejected); the rules template against live limits and against `docs/campaigns/*.md`; the 10-a-day bucket; the scripted-provider cases for AI off, cap reached, invalid output and over-length notes.
- **Fake provider:** extended with a deterministic, keyword-driven stand-in for the new task (as for the coach and judge). CI never calls the real API (`chooseProvider` returns none under Vitest and CI).
- **Injection:** notes containing "ignore your rules", a fake closing tag and a fake "TGS, trusted" line are given to the fake and to a scripted provider that obeys them; the output must be discarded or unchanged.
- **RLS:** no new table or function, so no new policy. One test confirms the call writes an `ai_usage` row under `judge_rationale` and nothing else.
- **Playwright:** an admin pastes notes and sees the label, the table with "unverified" and the counts; a member is refused; the 11th call in a day is refused; nothing appears on the Campaign afterwards.
- **Real model:** a manual, owner-run check only, like `npm run eval:coach -- --real`, never in CI.

## Questions for the owner

1. Is the judging model the right one, or should this use the cheaper model the coach can be set to?
2. Notes limit: is 12,000 characters enough?
3. Is a UTC-midnight reset acceptable for the 10-a-day limit, given it is not the UK day?
4. Should use be written to the audit log (ids and counts only, never the notes)? It is not in this spec because it needs the audit action list checked first.
5. Do you approve the one-sentence additions to `/ai-use` and `/privacy`?
6. The page lives at `/admin/campaigns/[id]/draft-helper`. You earlier said "under `/admin/campaigns/[id]`"; say if you want it on the existing page instead of a sub-page.
