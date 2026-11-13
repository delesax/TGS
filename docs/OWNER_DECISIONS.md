# Owner decisions: current defaults and how to change them

**Decisions were taken on 7 November 2026: see "Decisions taken, 7 November 2026" at the end of this file.** The tables below are the facts as they stood on 6 November 2026 and are left as they were, so you can see what changed.

Facts from the repo as of 6 November 2026 (CHANGELOG.md, the migrations, `supabase/data/launch-topics.json` and the source). No recommendations. "Settings" means **Admin → Settings** (admin sign-in required); a change there takes effect at once, is audited, and needs no release. "Needs a release" means a code or file edit and a deploy.

## The nine Sprint 4 decisions

| # | Question | Current default | Where it is set | How to change it without a release |
| --- | --- | --- | --- | --- |
| 1 | What happens when the AI is unavailable, over its cap or switched off? | Normal Campaigns: the Dispatch is posted, marked unscreened, and flagged for a human look. Sensitive Campaigns: held until a person looks | `community_settings.ai_fallback_normal` = `post_unscreened`; `ai_fallback_sensitive` = `hold`. The kill switch is `ai_enabled` (on) | Settings → AI: the two fallback menus and "AI features on" |
| 2 | Flag Dispatches declared "none" that read like pasted AI text? | Yes, as a soft flag for review only: never a hold, never shown to the author | `community_settings.undeclared_ai_flag` = on | Settings → AI: the "Flag Dispatches declared 'none'…" box |
| 3 | Which model does the coach use, and may it ever suggest wording? | Sonnet (`claude-sonnet-5-5`); screening and nudges use Haiku (`claude-haiku-5-5`). The coach never suggests wording | Models: `community_settings.ai_model_coach` / `ai_model_nudge` / `ai_model_screening` (blank), then env `AI_MODEL_COACH` etc., then `src/lib/ai/config.ts`. No-wording rule: `prompts/coach.v1.md` and `containsReplacementText()` in `src/lib/ai/policy.ts` | Model: Settings → AI, "Model for the coach" (for example `claude-haiku-5-5`). The no-wording rule needs a release |
| 4 | Cost caps | 3,000 AI calls a day for everyone; 40 nudge and coach calls per Strategist a day; coach 3 per draft and 10 a day; nudges and coaching stop at 80% of the daily cap; text over 6,000 characters is not sent; evaluation budget £5 | `community_settings.ai_daily_cap_global`, `ai_daily_cap_per_strategist`, `coach_uses_per_draft`, `coach_daily_cap`, `ai_input_max_chars`. The 80% rule is in `ai_reserve_call()` (migration `20261104000300`). The £5 evaluation cap is `CAP_GBP` in `scripts/eval-moderation.ts` and `scripts/eval-coach.ts` | The first five: Settings → AI. The 80% rule and the £5 evaluation cap need a release |
| 5 | Privacy policy wording about Anthropic processing Dispatch text to moderate and coach | A `[DRAFT]` paragraph marked "needs legal review" | `src/app/privacy/page.tsx`, section "Automated checks by AI" (full text in `docs/DRAFT_WORDING.md`) | Not possible without a release |
| 6 | How long to keep `ai_decisions` and coach feedback | No default was given. Nothing is deleted automatically; a deleted account's coach and nudge records are deleted, and its handle and name decisions are scrubbed | No setting or job exists. Behaviour is in `anonymise_profile()` (migrations `20261104000200` and `20261104000300`) | Not possible without a release (a retention job would be new code) |
| 7 | Appeals with only one admin | Allowed. The queue warns when the same admin made the original decision, and the audit entry records `same_admin_as_original` | In code: `moderate_dispatch()` and `appeal_dispatch()` (migration `20261104000100`) and `src/app/admin/moderation/page.tsx`. No setting | Not applicable (no switch). Recruiting a second admin is done with `npm run admin:set -- --email …` |
| 8 | Account deletion: wording, whether positions on closed Campaigns are kept, when to switch it on | Built and **off**. All wording is DRAFT. Positions on closed Campaigns are kept with no link to a person | `community_settings.account_deletion_enabled` = off. Wording: `src/app/profile/delete/*`, `src/app/account-deleted/page.tsx` (text in `docs/DRAFT_WORDING.md`). Positions: `anonymise_profile()` and table `anonymous_positions` | Switch on or off: Settings → Accounts. Wording and the positions rule need a release |
| 9 | Handle screening scope | Handles only (always screened). Display names and bios are not screened | `community_settings.screen_display_names` = off; `screen_bios` = off | Settings → AI: "Also screen display names" and "Also screen bios" |

Related AI thresholds, set at the same place and not separate decisions: `hold_threshold` 0.70 (normal Campaigns) and `sensitive_hold_threshold` 0.40 (sensitive Campaigns); Settings → AI.

## The four launch-topic decisions (CHANGELOG.md, Sprint 2)

| Topic | Question | Current default | Where it is set | How to change it without a release |
| --- | --- | --- | --- | --- |
| Bank of England, 5 November | Pick the next MPC date or replace the topic | Loads as a draft flagged "owner decision needed". The database refuses to schedule it while the flag is set. The topic file says the 5 November decision falls before the 1 December soft launch | `supabase/data/launch-topics.json` (`needs_owner_decision`), then `campaigns.needs_owner_decision` | Edit the Campaign in Admin → Campaigns (title, dates). Clearing the flag has no admin screen (CHANGELOG, Sprint 2; the Sprint 4 console did not add one), so it is cleared in the database |
| Assisted dying | The real content note and any support-resources wording (CLAUDE.md rule 15) | Loads as sensitive with the content note "DRAFT: content note to be written by the owner". No real wording exists | `SENSITIVE_NOTE_PLACEHOLDER` in `src/lib/launch-topics.ts`; `supabase/data/launch-topics.json`; then `campaigns.content_note` | Admin → Campaigns → Edit → Content note |
| "Closed, moderated debate" | Which format to use | Loads as Open arena. The intended setting is recorded in the admin notes | `supabase/data/launch-topics.json` (`format`, `suggested_format`); `campaigns.notes` | Admin → Campaigns → Edit → Format (and the admin notes) |
| Topic facts | Refresh the background before a Campaign opens | The facts are kept hidden (`campaigns.brief`, not shown). The public summary is the placeholder "DRAFT: background to be refreshed by the owner before this Campaign opens…" | `SUMMARY_PLACEHOLDER` in `src/lib/launch-topics.ts`; `campaigns.brief` | Admin → Campaigns → Edit → Summary |

The topic file also flags a third topic with an owner decision: `rosebank-after-jackdaw` ("Owner suggests holding back until the AI moderator is tested on calmer topics"). It is recorded in the file but not in the CHANGELOG decision list; it changes the same way as the Bank of England row.


---

## Decisions taken, 7 November 2026

The owner accepted every recommendation in the launch pack. Where the decision needs the database or a release, the work is in the `legal-hardening` branch and **nothing is applied to the hosted project until you apply it**.

### The nine Sprint 4 decisions

| # | Decision taken | What it changes | Status |
| --- | --- | --- | --- |
| 1 | AI unavailable: keep the defaults (normal Campaigns post unscreened; sensitive Campaigns are held) | Nothing | Confirmed, no change |
| 2 | Undeclared-AI flag: keep as a soft flag, never a hold, never shown to the author | Nothing in the product. **Review trigger:** after the first 50 flags, if more than half are wrong, turn it off (Settings → AI, "Flag Dispatches declared 'none'…") | Confirmed; trigger recorded here |
| 3 | Coach model: Sonnet for the first two weeks; the coach never suggests wording | Nothing. **Switch rule:** change to Haiku in Settings → AI ("Model for the coach") if spend passes the limit, or if Haiku scores within 0.3 of Sonnet on `npm run eval:coach` | Confirmed; rule recorded here |
| 4 | Cost caps: global daily cap **3,000 → 1,000** for the first fortnight; keep 40 per Strategist, coach 3 per draft and 10 a day, evaluation budget £5 | Migration `20261107000600_launch_decisions.sql` sets the settings row and the column default to 1,000 and writes one audit entry (`settings.changed`, from 3000 to 1000, actor system). **Raise to 3,000 in Admin → Settings after two weeks if usage needs it.** The £25 monthly limit on the Anthropic key is yours to set in the Anthropic console | Migration written, **not applied** to hosted |
| 5 | Privacy wording | Implemented in the rewritten privacy policy, terms, AI page, accessibility statement and deletion pages. **Solicitor sign-off is still a gate before any real invitee** | Draft complete; awaiting facts and the solicitor (`docs/LEGAL_WORDING.md`) |
| 6 | Retention | Implemented as eight pg_cron jobs (`docs/legal/RETENTION.md`): AI decisions 12 months; coach 90 days; emails 30 days; reports and flags 12 months after resolved; never-confirmed sign-ups 30 days; passkey challenges 1 day; privacy requests six years after closed; audit record six years | Migration written, **not applied** to hosted |
| 7 | Appeals with one admin: no change. **A second reviewer is required before the first sensitive Campaign** (give them the role with `npm run admin:set -- --email …`) | Nothing in the product | Confirmed; condition recorded here |
| 8 | Account deletion: keep **OFF**. Keep positions on closed Campaigns unlinked. Deletion by email or the contact form until the solicitor signs off **and** the three sign-up boxes have been live | `account_deletion_enabled` stays off. By-hand route: `npm run account:delete` (`docs/legal/RUNBOOK_PRIVACY_REQUESTS.md`) | Confirmed, no switch change |
| 9 | Handle screening scope: handles only. Add display names and bios once `eval:moderation --real` shows **10% or fewer false holds**; `screen_display_names` and `screen_bios` stay off | Nothing | Confirmed; condition recorded here |

### The four launch-topic decisions

| Topic | Decision taken | Status |
| --- | --- | --- |
| a) Bank of England | New title "Should the Bank of England keep interest rates high until inflation is firmly back at 2%, even if that slows growth?"; open arena; finance; opinion not advice on; public summary stays a placeholder template until the day it opens ("As of [opening date], Bank Rate is [x]% and CPI inflation is [y]%. The Bank's target is 2%. [One sentence on the latest decision and vote.]"); hidden brief carries the For and Against; no dates in title or text; **`needs_owner_decision` cleared** (you approved the new title) | In `supabase/data/launch-topics.json` and `src/lib/launch-topics.ts`. Existing hosted DRAFT row to be updated by the one-off script (dry run first) |
| b) Rosebank | Title "Should the UK approve new North Sea oil and gas projects such as Rosebank?"; stays wave 4; `needs_owner_decision` stays set. Admin note: open only when ALL are true: (1) `eval:moderation --real` met its targets; (2) at least two wave-1 Campaigns have finished with every hold and appeal answered within 48 hours; (3) a second reviewer is in place | Same |
| c) Assisted dying | Your content note (519 characters, so the limit on a content note is raised from 500 to 1,000 in the same migration); stays wave 4, Oxford format, three rounds, sensitive on, `needs_owner_decision` set. Admin note: check each phone number on the day it opens; open only after the three Rosebank conditions, with the second reviewer on call for the first 48 hours. **Not opened and the schedule is unchanged.** The three rounds are described in the admin note; the round rows are created in Admin → Campaigns when you set the dates | Same |
| d) Wave 1 | `npm run topics:load -- --start YYYY-MM-DD --concurrent` makes all wave-1 Campaigns (under-16 social media ban; in-person exams vs AI cheating (Oxford); lifelong learning loans at 60) share one start and one end, 7 days. The default behaviour is unchanged | Built and tested |

`npm run topics:load` only inserts new slugs and never changes an existing Campaign, so the hosted DRAFT Campaigns are updated by a separate one-off script, `scripts/update-draft-topics.ts` (`npx tsx scripts/update-draft-topics.ts`). It is a **dry run unless you pass `--confirm`**, touches only Campaigns still in draft status matched by slug, never their schedule, and prints a before-and-after diff. It has **not** been run with `--confirm`.
