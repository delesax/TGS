# Campaign 1: `under-16-social-media-ban` (for owner approval)

Prepared 13 November 2026. **Nothing here has been entered, published or scheduled.** Claude read only the repo. Claude could not read hosted (no Supabase access token in its shell, and `.env.local` was not read), so every "hosted" value below is marked **to confirm**, with a read-only query you can run in the SQL Editor.

## 1. What the repo says (and what hosted still has to confirm)

| Item | Finding | Source |
| --- | --- | --- |
| `rules` column | `text`, optional, **at most 10,000 characters**. The form trims it. | `supabase/migrations/20261101000200_campaigns_dispatches_awards.sql`, `src/lib/campaign-schema.ts` |
| How the page renders `rules` | A "Rules" heading, then the text as **plain text** with `whitespace-pre-line`: line breaks and blank lines are kept, **no Markdown** (asterisks, `#` and links show as typed). Shown only if not empty. | `src/app/campaigns/[slug]/page.tsx` (about line 188) |
| `summary` | `text`, at most 2,000 characters, required in the form. Same rendering (plain text, line breaks kept). The form hint says "two or three sentences", but nothing enforces it. | same files |
| `format` and arena | Form options: Open arena (`open_arena`), Oxford-style (`oxford`), Progressive rounds (`progressive`). The topic bank sets Campaign 1 to **`open_arena`**, which is the "arena" (no rounds needed). Rounds are optional (up to 10). | `src/lib/campaigns.ts`, `supabase/data/launch-topics.json` |
| Category | `technology` in the topic bank. | `supabase/data/launch-topics.json` |
| Labels | `is_sensitive` false, `opinion_not_advice` false in the topic bank. | same |
| Dispatch length limits (code defaults) | Argument **1,500**, rebuttal **1,000**, evidence **600** characters; 10 Dispatches per Strategist per round (in an open arena with no rounds, all of a Strategist's Dispatches in the Campaign count, so it is 10 in total); 30 seconds between posts; 5 minutes to edit. The database accepts a body of 1 to 5,000. These are admin-editable settings, so **the live values are to confirm** (query C). | `src/lib/dispatches.ts` (`DEFAULT_LIMITS`), `20261103000200_dispatches_discussion.sql` |
| Judging weights | Version 1 is seeded as panel 40, peer 25, AI rubric 25, mind-change 10 ("CLAUDE.md rule 7 defaults"). Versions are insert-only and **publishing pins the latest version at that moment**. The **latest hosted version and its four weights are to confirm** (query B). | `20261104000100_ai_moderation.sql`, `20261113000800_rubric_publish.sql` |
| Is Campaign 1's rubric published? | **Not read from hosted.** The log records the owner's SQL Editor check on 13 Nov: all 15 Campaigns are drafts with `rubric_published_at` null (owner-reported, not seen by Claude). Query A confirms it. | `docs/CLAUDE_LOG.md` |
| The TEST Campaign `1d4d7eb1-f2b9-4535-bb16-931f47bae58c` | **Not readable by Claude.** Its rules and summary live only on hosted. The repo only says its summary starts "TEST ONLY" and it has no rounds (`docs/LAUNCH_RUNBOOK.md`, step 9). Query D shows both if you want a structural comparison. | n/a |

### Read-only queries for you (SQL Editor; no secrets)

```sql
-- A. Campaign 1 state
select slug, title, status, format, category, starts_at, ends_at,
       rubric_published_at, judging_weights_version, is_sensitive, opinion_not_advice,
       char_length(coalesce(summary,'')) as summary_chars, char_length(coalesce(rules,'')) as rules_chars
from public.campaigns where slug = 'under-16-social-media-ban';

-- B. Latest judging weights (publishing pins the highest version)
select version, panel, peer, ai_rubric, mind_change, note, created_at
from public.judging_weights order by version desc limit 3;

-- C. Live Dispatch limits
select argument_max_chars, rebuttal_max_chars, evidence_max_chars,
       max_dispatches_per_round, cooldown_seconds, edit_window_seconds
from public.community_settings;

-- E. Judging settings that the pick rule text relies on
select min_voter_account_age_hours, min_position_span_hours, peer_window_hours
from public.judging_settings;

-- D. TEST Campaign, as a structural example only
select slug, format, rules, summary
from public.campaigns where id = '1d4d7eb1-f2b9-4535-bb16-931f47bae58c';
```

## 2. Proposed summary (verbatim, not yet approved)

923 characters, so within the 2,000 limit. Paste exactly; the blank lines render as paragraph gaps.

```text
On 15 June 2026 the UK government announced a ban on under-16s holding accounts on major social media platforms, modelled on Australia's law, which took effect on 10 December 2025. The UK version would also block features such as livestreaming and contact from strangers. Regulations are due to be laid before Parliament in December, with the ban expected from spring 2027.

Supporters, including many bereaved parents and parent-led campaigns, argue voluntary measures and parental controls have failed. Critics, including some child-safety charities, argue a ban could push children towards less regulated spaces and cut vulnerable young people off from support. Early evidence from Australia is mixed. The eSafety Commissioner found under-16 account holding fell from 52.4% to 42.1%, while a BMJ survey study found over 85% of under-16s were still using covered platforms.

Should the UK ban under-16s from social media?
```

## 3. Proposed rules (plain text, exactly the format the app renders)

Plain text only, because the page does not render Markdown. Every mechanic below was checked against the repo (migrations and code, 13 Nov). The numbers marked "default" are admin settings: **only use them if query C and query E match**, otherwise change them to the live values.

```text
This is an open arena: there are no rounds. You can post at any time while the Campaign is open.

Before you post
Choose a handle, then say where you stand ("Where do you stand before the debate?"). Recording your position is optional and needs your agreement; you need one to post. You can record where you stand now once the debate has moved you.

What you can post
An Argument can be up to 1,500 characters; it cannot contain links, so post sources as Evidence. A Rebuttal can be up to 1,000 characters and must answer another Dispatch; you may add sources. Evidence can be up to 600 characters and must include at least one source, with a short note on why it matters.
You can post up to 10 Dispatches in this Campaign, and replies count. You can post again 30 seconds after your last Dispatch, and you can edit a Dispatch for 5 minutes after posting it.

Being open about AI
Each Dispatch must say whether you used AI: none ("Written without AI"), assisted ("Written with AI help") or generated ("Mostly written by AI"). Your answer is shown on your Dispatch. Please answer honestly.

Keeping it civil
Handles and Dispatches are screened. If something is held, a person checks it before others can see it; you can still see your own. Screening never deletes anything: only a person can remove a Dispatch, and a removed Dispatch shows as "Removed by a moderator."

Changing your mind
If a Dispatch changed your mind, you can pick it (one pick a Campaign). Your account must be at least 48 hours old, you must have taken part in this Campaign, and picks are open while the Campaign runs and for a short while after it closes. A pick only counts if you recorded where you stood before and where you stand now, and those two records are at least 24 hours apart.

How it is judged
The four criteria and the blend of judging weights are set out under "How this Campaign is judged" on this page, and are fixed before the Campaign opens.

The clock
The countdown on this page runs from the server's closing time. It is the only clock that counts.
```

Length: 2,044 characters of the 10,000 allowed.

Checked against the repo:

| Rule text | Source |
| --- | --- |
| Handle, then a position, needed to post | `post_dispatch` raises `NOT_ONBOARDED` and `POSITION_REQUIRED: record your position first` (`20261103000200_dispatches_discussion.sql`, redefined in `20261107000200_positions_consent.sql`) |
| Position optional, needs agreement | consent checkbox "I agree to you recording my position on Campaigns." (`position-form.tsx`); `has_positions_consent` (`20261107000200`) |
| Kind rules (no links in an Argument, a Rebuttal answers another Dispatch, Evidence needs a source) | `KIND_LABELS` in `src/lib/dispatches.ts` |
| 1,500 / 1,000 / 600 characters, 10 Dispatches, 30 seconds, 5 minutes | defaults in `src/lib/dispatches.ts` and `community_settings`; **live values: query C** |
| 10 Dispatches **in the Campaign**, replies counted | with no rounds the cap counts all the author's Dispatches in the Campaign (`post_dispatch`, `round_position is not distinct from round_pos`); members see "You can post N more here" before the limit and "You have posted N Dispatches here" at it in an open arena (`src/app/campaigns/[slug]/dispatch-section.tsx:93-96, 111`); "in this round" appears only in the server error text (`src/lib/dispatches.ts:247-250`) if the database refuses a post |
| AI declaration wording | `AI_USE_LABELS` in `src/lib/dispatches.ts`; "Your answer is shown on your Dispatch." (`compose-form.tsx:278`) |
| Held items, nothing deleted by screening | `apply_dispatch_screening` and `moderate_dispatch` (`20261104000100_ai_moderation.sql`); handles: `onboarding/actions.ts`, `decide_held_handle` |
| Pick conditions | `pick_mind_changer` (`20261113000300_voter_eligibility.sql`): 48 hours default (`min_voter_account_age_hours`), must have posted or recorded a position, one pick per Campaign, open until `ends_at` plus `peer_window_hours` (default 72, `20261111000200_judging_functions.sql`); 24-hour span default (`min_position_span_hours`) applied in `src/lib/judging/blend.ts` |
| Server clock | `getServerNow` and `server_now()` (`campaign-data.ts`, `20261102000100`) |

Not included on purpose: any statement of the 40/25/25/10 weights, vote-credit numbers, any Verdict or appeal wording, and any age rule. The pick text says "a short while" for the 72-hour default peer window rather than a number; add the number if query E shows the live value and you want it stated.

## 4. Field-by-field checklist for Admin, Campaigns, Edit (`under-16-social-media-ban`)

Times in the form are **UK time**. On 1 December UK time equals UTC, so 00:00 UTC is entered as 00:00.

| Field (label on the form) | Enter | Note |
| --- | --- | --- |
| Title (the question) | **Decide first, see mismatch 1 below.** Topic bank: `Should the UK's under-16 social media ban go ahead as planned?` | 5 to 160 characters |
| Web address | `under-16-social-media-ban` | Leave as is. Do not change a slug that exists. |
| Summary | The text in section 2, verbatim | Up to 2,000 |
| Rules (optional) | The text in section 3 (after checking queries C and E) | Up to 10,000 |
| Category | Technology | Already set from the topic bank |
| Format | Open arena | Already set from the topic bank |
| Opens | `2026-12-01 00:00` | = 00:00 UTC |
| Closes | Keep the loaded value; **expected 2026-12-08 00:00** (7 days, from the topic loader). **You did not specify a close date, so confirm it.** | Must be after Opens |
| Rounds | Leave all rows blank | Open arena |
| Sensitive topic | Unticked (topic bank). Your call: it is about children and bereaved parents. If you tick it, a content note is required. | Owner decision |
| Content note | Empty (not sensitive) | |
| Opinion, not advice | Unticked (not financial or medical) | |
| Admin notes | Optional, not shown publicly | |
| Publish | **Keep as draft** for the first save | Scheduling comes after the rubric |

## 5. Click order

1. **Open** Admin, Campaigns, Edit for `under-16-social-media-ban`. Run query A first to see its current state.
2. **Fill the fields** per section 4, with Publish = **Keep as draft**. **Save Campaign.** Reload and check the summary and rules show correctly (preview at the draft page as admin).
3. **Confirm the weights version before publishing:** Admin, Judging, "weights" section (or query B). Publishing **pins the latest version at that moment and fixes it for this Campaign**. If the weights are not what you want, change them first (a new version), then publish.
4. **Settle the summary and rules first: they stay editable after publishing, and edits show on the public page.** Then **publish the rubric** (button "Publish the rubric" on the same edit page). **It cannot be undone from the app.** The page then reads "Published <date>" and the public page will show "How this Campaign is judged".
5. **Set Publish to "Schedule it"**, confirm Opens `2026-12-01 00:00` and the Closes value, **Save Campaign.** (Before step 4 this save is refused with `RUBRIC_NOT_PUBLISHED`.)
6. **Check `/admin/audit`:** a `campaign.rubric_published` row (details show the pinned weights version) and `campaign.updated` rows for the saves. (Publishing also changes the Campaign row, so you may see an extra `campaign.updated` next to `campaign.rubric_published`.) The scheduler writes `campaign.opened` itself within a minute of Opens; nothing is needed at midnight.
7. Re-run query A: status `scheduled`, `rubric_published_at` set, `judging_weights_version` set.

## 6. Facts in the summary Claude could not verify from the repo

The repo's only source for this topic is one law-firm article (Lewis Silkin, 15 June 2026) in `supabase/data/launch-topics.json`, checked "around 1 November 2026" and described there as moving. Check each of these against primary sources before publishing.

| # | Claim in the summary | Status | Check at |
| --- | --- | --- | --- |
| 1 | UK government announced the ban on **15 June 2026** | Matches the topic bank date, but only via the law-firm article | gov.uk announcement |
| 2 | Ban on under-16s **holding accounts on major platforms** | Topic bank says "social media platforms serving under-16s" with age assurance; wording differs | gov.uk |
| 3 | "Modelled on Australia's law" | Topic bank says "broadly following Australia's model": consistent | gov.uk |
| 4 | Australia's law **took effect 10 December 2025** | **Not in the repo** | eSafety Commissioner, Australian government |
| 5 | UK version would **also block livestreaming and contact from strangers** | **Not in the repo**. The topic bank instead mentions age assurance and a minimum age of 18 for AI romantic-companion chatbots | gov.uk |
| 6 | **Regulations due to be laid before Parliament in December** | **Not in the repo** (topic bank only says first regulations "could take effect in spring 2027") | gov.uk, Parliament |
| 7 | **Ban expected from spring 2027** | Consistent with the topic bank | gov.uk |
| 8 | Supporters include **many bereaved parents and parent-led campaigns**; critics include **some child-safety charities** | **Not in the repo** (the topic bank's arguments are general). Name-check the groups or soften | named organisations' own statements |
| 9 | eSafety found under-16 account holding **fell from 52.4% to 42.1%** | **Not in the repo.** Check the exact measure (accounts held, not use), the date and the population | eSafety Commissioner |
| 10 | A BMJ survey study found **over 85%** of under-16s **still using** covered platforms | **Not in the repo.** Check the study, sample, date and that "using" is not compared directly with "holding accounts" in item 9 | BMJ |
| 11 | "Early evidence from Australia is mixed" | A judgement from items 9 and 10 | follows from them |

Also worth a look: items 9 and 10 measure different things (accounts held versus use), and the summary places them side by side with "while", which could read as a like-for-like comparison.

## 7. Mismatches between the summary and the app's fields

1. **Title versus the closing question.** The summary ends "Should the UK ban under-16s from social media?", which is the form's example hint, but the loaded title (topic bank) is "Should the UK's under-16 social media ban go ahead as planned?". They ask slightly different questions (whether to ban, or whether to proceed as planned). Pick one: either change the title to match, or drop the last line of the summary, since the page already shows the title.
2. **Summary length versus the form hint.** The hint says "two or three sentences"; the proposal is 9 sentences in three paragraphs (923 characters). Allowed (limit 2,000), just not the house style.
3. **Facts differ from the topic bank** (items 2, 5 and 6 in section 6): the topic bank says nothing about livestreaming or contact from strangers and describes age assurance and AI companions instead.
4. **No close date was given.** The proposal sets only the start. The loader's draft closes 7 days after it starts, which makes the first possible close **8 December 2026** (also what `docs/LAUNCH_RUNBOOK.md` assumes). Confirm.
5. **Content note limits differ** (database 500, form 1,000). Not relevant while the Campaign is not sensitive; it would matter if you tick Sensitive.
6. **Dispatch limits and pick conditions in the rules** come from code defaults, not from hosted (queries C and E).
7. **"Round" wording.** In an open arena the 10-Dispatch cap is for the whole Campaign. The post area says "here" (`dispatch-section.tsx:93-96, 111`), so it matches the rules text "in this Campaign". Only the server error text says "in this round" (`src/lib/dispatches.ts:247-250`), and a member sees it only if the database refuses a post, for example from a stale page.
8. **What the post area tells members in advance.** It says how many more they can post ("You can post N more here") and the edit window in minutes (`dispatch-section.tsx:111`), and the form shows a live character count. The cooldown appears only once it is running, so the 30-second length is not stated beforehand: the rules text is where members learn it.
10. **Verdict and consent (confirmed in the code).** The mind-change measure reads only consented positions: `judging_inputs` takes positions from `judging_positions()`, which reads the `consented_positions` view (`20261111000200_judging_functions.sql:455-472`, `20261107000200_positions_consent.sql:56-61`). The pick rule text is therefore accurate on consent.
9. **Editing after publishing.** Nothing in the app blocks changing the summary or rules after the rubric is published or the Campaign is scheduled or open, and the public Campaign page shows the edited text. Only the judging weights version is fixed at publish. Settle the summary and rules **before** step 4 of the click order.
