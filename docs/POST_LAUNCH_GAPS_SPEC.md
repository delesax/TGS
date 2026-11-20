# Post-launch gaps: spec (spec only; nothing here is built)

Written 20 Nov 2026 on `docs/post-launch-gaps-spec`, from `origin/main` at `e5921e7`. **This is a spec.** Under CLAUDE.md rule 16, no item is built until Dele says "build" in a prompt that names the item. Approval of this document is not that instruction.

Sources: the Growth Ideas and Build Plan (post-launch) document, the code on `main`, `docs/CLAUDE_LOG.md`, `docs/CAMPAIGN_DRAFT_HELPER_SPEC.md`. Everything under "Current state" was read from the repository on 20 Nov. Nothing was checked on hosted.

## Contents

1. How to read the markers and the ship windows
2. Summary table
3. Items a to k
4. Open questions for Dele

## 1. Markers and ship windows

**Markers.** Each item carries one:

- **BEFORE-FIRST-VERDICT**: can ship before the first Verdict (about 12 Dec) without touching judging.
- **AFTER-FIRST-VERDICT**: wait until the first Verdict is published and its appeal window has been read, so real data and real behaviour shape it.
- **NEEDS-LEGAL/CONSENT**: cannot ship until a legal question is answered or a consent flow exists. Several items are AFTER-FIRST-VERDICT as well; where both apply, both are shown.

**Ship windows (Dele's rules).** Deploys Tuesday to Thursday only. Never within 24 hours of a Campaign closing or a Verdict publishing. No judging-touching change while judging runs.

**What those rules mean in practice (my derivation, please check).**

- Campaigns run in weekly slots that open and close on Tuesdays at 00:00 UTC (Campaign 1: 1 Dec to 8 Dec; the next slots follow every 7 days). A close at Tuesday 00:00 UTC puts the whole of Tuesday inside the 24-hour no-deploy period, so **in a week where a Campaign closes, only Wednesday and Thursday are open**, and a Verdict published on one of those days closes that day too.
- The default judging window is 96 hours after close (peer window 72 hours inside it, `judging_settings` defaults). A Campaign that closes on Tuesday is therefore in judging until about Saturday, and the next Campaign closes the following Tuesday. **While Campaigns close weekly, there is almost never a gap with no judging running.** A judging-touching change needs a gap that does not exist in December unless one is made (a skipped slot, or the holiday week). Items d and e are judging-touching and need this decision. See section 4.
- "Judging-touching" in this document means: changes `compute`, the blend, weights, the rubric, the AI scoring prompt, what is fed to the AI judge or the panel, mind-change or steelman counting, or anything in the judging SQL functions. Display-only changes to the public Verdict page (like the criteria and positions sections already merged) are not judging-touching, but they still obey the 24-hour rule around a Verdict publishing.
- Migrations are written, never applied by Claude. Dele applies them from the terminal after a dry run, on a Wednesday or Thursday that satisfies the rules.

## 2. Summary table

| Item | Marker | Migration | Estimate | Gate before build |
| --- | --- | --- | --- | --- |
| a. Verdict "what would have changed this" note | AFTER-FIRST-VERDICT | yes | 5 to 6 days | Real-model eval passes; Dele reads 3 drafts |
| b. Panel judge comments and profile pages | NEEDS-LEGAL/CONSENT, AFTER-FIRST-VERDICT | yes | 5 to 7 days | Each judge's written consent flow agreed by legal |
| c. Mind-change reason, notification, "moved N" count | NEEDS-LEGAL/CONSENT, AFTER-FIRST-VERDICT | yes | 4 to 5 days | Legal answer on free text beside a position change |
| d. Steelman as its own Dispatch type | AFTER-FIRST-VERDICT (judging-touching) | yes | 6 to 8 days | A judging gap; new Campaigns only; rubric text agreed |
| e. Peer-vote weighting, reviewer record | NEEDS-LEGAL/CONSENT, AFTER-FIRST-VERDICT (judging-touching) | yes | 8 to 10 days | Legal and fairness review; judging gap; data from 3 Verdicts |
| f. Notifications: inbox, push, weekly email | inbox AFTER-FIRST-VERDICT; push and email NEEDS-LEGAL/CONSENT | yes | inbox 6 to 8 days, push 3 to 5, email 2 to 3 | Inbox first; push keys set by Dele; consent for email |
| g. Archive, robots and sitemap, public Verdict pages | filters AFTER-FIRST-VERDICT; public pages NEEDS-LEGAL/CONSENT | public pages: yes | filters 2 to 3 days, public pages 4 to 5 | Legal on indexing and handle removal |
| h. Evidence cards | AFTER-FIRST-VERDICT | yes | 6 to 8 days | SSRF review of the link checker |
| i. Participation pulse | BEFORE-FIRST-VERDICT | no | 1 to 2 days | Threshold chosen by Dele |
| j. Campaign Studio follow-ups | mixed (see item) | reminders: yes | 4 to 6 days | Per sub-item |
| k. Coach v2 | AFTER-FIRST-VERDICT | no | 2 to 3 days (plus owner reading) | Variance run, hand-read, c12 fix |

Estimates are working days of Claude time including tests, not elapsed time, and exclude Dele's reading and any legal turnaround.

---

## a. Verdict "what would have changed this" note

**Marker:** AFTER-FIRST-VERDICT. Display only for readers, but it adds AI text to the Verdict page, so it also needs the Verdict-publishing 24-hour rule.

**Current state.** The Verdict page shows the rationale, awards, the component breakdown, and (merged 20 Nov, PR #111) per-criterion averages and an anonymous positions chart. The winner's summary exists: AI-drafted on demand, admin-approved, labelled as AI-assisted, with prompt v2, a strict validator and `npm run eval:summary` (PR #58). Nothing explains what would have changed the result for the runners-up.

**The gap.** Members who did not win see scores but no reason in their own terms for the gap, and the Verdict does not say what a different Dispatch might have done. The plan lists this as a way to raise the next Dispatch's quality.

**Design.** Copy the winner's-summary pattern exactly.
1. After a draft Verdict is computed, an admin can press "Draft a what-would-have-changed note". One AI call (Sonnet) is given only the Verdict's already-public facts: the criteria averages for the top 3, the weights, the rationale. It is **not** given other members' Dispatch text, panel comments, positions or anything private.
2. Output is a JSON object: up to three short sentences, each tied to a named component or criterion and each phrased as a general observation ("A higher evidence score would have closed most of the gap"), never a prediction of a different ranking and never about a named person's character.
3. A strict validator rejects: any figure not in the input, any claim that a specific change "would have won", any name not in the input, any advice about a person (not about the argument), any quote of Dispatch text, and anything longer than the cap. Invalid output shows nothing and is not stored.
4. The admin edits and approves; only approved text is public; it carries the same AI-assisted label as the winning case, wording from `notices.ts` unchanged (a new label string needs legal; see the privacy question).
5. Stored with prompt version, model, output and reason (rule 6), counted against the daily AI cap, and subject to the 80% judging stop.

**Migration (additive).** Nullable columns on `verdicts` (`change_note`, `change_note_ai_assisted`, `change_note_approved_by`, `change_note_approved_at`) and a drafts table mirroring `verdict_summary_drafts`, with RLS (admin only for drafts; the public read is through the existing `verdicts` row policy). No existing column changes.

**Privacy or legal question.** The note describes how scores compare, which is derived from scores already public in aggregate. The question for legal: does the AI-assisted label in `notices.ts` cover a second AI-written passage, or does it need a new string? Claude may not edit `notices.ts`; this item is blocked until that is answered.

**Tests.** Unit: validator fixtures built from real model output (invented figure, "would have won", unnamed person, over length). Fake-provider server action tests (cap, off switch, invalid output). RLS: drafts admin-only, public cannot read an unapproved note. Playwright at 375px: draft, edit, approve, publish, remove with reason. A real-model run (below).

**Estimate.** 5 to 6 days.

**Gate that must pass first.** `eval:change-note --real` on at least 3 real Verdict inputs: no unexplained discard, every discard classified as a correct rejection or turned into a fixture, and Dele has read the three notes. Not run in CI. Also the first Verdict must be published and read before this is shaped (Dele's rule).

---

## b. Panel judge comments and profile pages

**Marker:** NEEDS-LEGAL/CONSENT, and AFTER-FIRST-VERDICT.

**Current state.** `panel_scores` has a `comment` column (up to 1,000 characters). Judges are assigned in `judge_assignments` and score in the judging area; the comment is stored with the score. Neither the comment nor the judge's identity is shown publicly: the Verdict shows only aggregates, and the new criteria section deliberately hides individual judges. There is no judge profile page and no record of a judge consenting to be named.

**The gap.** The plan wants judges to have a reason to take part and the Verdict to carry credibility. Both need a named, public, written voice, which today does not exist.

**Design.** Do not assume consent. A judge is not named, quoted or given a page until they have consented, per Campaign, in writing.
- **Consent flow.** When a judge accepts an assignment, a separate screen (not a pre-ticked box, not bundled with accepting the role) offers three independent choices: (1) be named as a judge on the Verdict, (2) have one short comment (up to 400 characters, written by them for publication, separate from their private scoring note) shown, (3) have a public judge profile page. Each choice is recorded as `judge_consents` rows with the privacy-policy version and a timestamp, can be changed or withdrawn at any time before publication, and withdrawal removes the display on the next render. The scoring comment in `panel_scores` is never published; a judge writes a different public comment.
- **Display form.** On the Verdict page: a "Panel" section listing consenting judges by handle with their public comment, with no per-judge scores and no link between a judge and any score. If fewer than 3 judges consent to being named, show only "The panel had N judges" so a named judge cannot be matched to the aggregate. A judge's profile page shows their handle, role history (Campaigns judged) and their public comments, nothing else.
- **Moderation.** Public comments are screened like Dispatches (AI hold, admin decides); a held comment simply does not show.

**Migration (additive).** `judge_consents` (campaign_id, judge_id, name_on_verdict, public_comment, public_profile, consent_version, consented_at, withdrawn_at), `judge_public_comments` (campaign_id, judge_id, body, moderation_status), RLS so a judge reads and writes only their own rows and the public reads only consented, visible rows. Update the account-deletion and export functions to include both tables (legal-hardening owns those functions, so this needs care).

**Privacy or legal question.** Naming a judge is personal data processing needing a lawful basis: consent as described. Open: does a retired professional's profession or employer count if shown on the profile (we would show only handle)? Does the privacy policy need a new "judges" section and a new retention row? Is a judge acting as a volunteer in a capacity that needs a short written terms? These are for legal; Claude does not decide them.

**Tests.** RLS: a judge cannot read another judge's consent or comment; the public sees nothing unconsented or withdrawn; withdrawal hides at once. Unit: the fewer-than-3 rule. Playwright at 375px: the three choices, withdraw, the Verdict display. Export and deletion tests cover the new tables.

**Estimate.** 5 to 7 days.

**Gate.** Legal agrees the consent wording and the privacy-policy changes before any code. No judge is shown on any page without a recorded consent for that Campaign.

---

## c. Mind-change reason, author notification, public "moved N" count

**Marker:** NEEDS-LEGAL/CONSENT, and AFTER-FIRST-VERDICT. Touches the mind-change pick, which feeds the 10% mind-change component, so the pick form change is judging-adjacent: it adds a field but must not change which picks count or how.

**Current state.** A member who changed position can pick the one Dispatch that changed their mind (`mind_change_picks`: one per Campaign, requires an account at least 48 hours old, a recorded position change over at least 24 hours, a consented position). The pick counts via `pick_mind_changer()`. There is no reason, the author is not told, and no public count of how many minds moved. (The merged Verdict positions chart shows anonymous before and after totals from 10 members, but not "moved N", which needs each member's own before and after.)

**The gap.** The pick is invisible to the author and carries no explanation, so it does not teach anyone what persuades.

**Design.**
- **Reason.** An optional one-line reason (up to 140 characters) with the pick: "What changed your mind?" Screened like any free text (AI hold, admin decides).
- **Author notification.** The author is told "Someone changed their mind because of your Dispatch" once the Campaign's Verdict is published, not before (before would let authors see live which Dispatches are being picked and chase picks). The reason is shown to the author only if the picker ticks "Share my reason with the author", and never with the picker's handle. Delivery is through the in-app inbox when item f exists; until then, on the author's Dossier. No email.
- **Public "moved N".** The count of members whose recorded position moved between before and after, shown on the Verdict page only when at least 10 members recorded both (same threshold and consent filter as the positions chart), as a single number, never a direction by person.

**Migration (additive).** `mind_change_picks.reason` (nullable, check length), `reason_shared boolean default false`, moderation status columns; a security-definer function returning the moved count, with the 10-member threshold inside the function.

**Privacy or legal question.** A reason beside a position change can reveal political opinion (special category data under UK GDPR) even without a handle, especially to the author. Positions have their own explicit-consent text (`20261107000200`); does that consent cover free text about why the person's view moved, or does it need new, separate consent and a privacy-policy update? Also: is telling an author about a pick "profiling" or a notification needing a separate lawful basis? Claude does not decide.

**Tests.** RLS: the reason is readable only by the picker, and by the author only after publication and only if shared; the moved-count function returns nothing under the threshold. Unit: the threshold. Playwright: pick with and without a reason, the author's view after publication, unchanged scoring (the blend's inputs are identical with and without a reason, asserted in a test).

**Estimate.** 4 to 5 days.

**Gate.** The legal answer on free text before any code; and the pick-count code in `blend.ts` stays untouched, proved by a test.

---

## d. Steelman as its own Dispatch type, badge and "confirmed by N"

**Marker:** AFTER-FIRST-VERDICT. Judging-touching, so a judging gap is also needed (section 1). **New Campaigns only.**

**Current state.** Dispatch kinds are `argument`, `rebuttal`, `evidence`. A steelman today is not a type: the AI rubric detects one (`steelman_detected`, `steelman_confidence`, a note) and members confirm it on a rebuttal (`steelman_flags`, needing `steelman_min_confirmations` = 3 by default, at most `max_steelman_confirmations`, account at least 48 hours old). The bonus (up to 5 points) is blended in; it is capped so the final stays at or under 100. Members do not see a badge or the confirmation count on the Dispatch.

**The gap.** The behaviour the product most wants to reward, fairly restating the other side, is not something a member can do on purpose or see recognised. It is inferred.

**Design.**
- A fourth Dispatch kind, `steelman`: a Dispatch whose job is to restate the opposing view as its holders would. It is posted like any Dispatch (same AI-use declaration, moderation, edit window and per-round cap, counted like the others toward the cap).
- A "Steelman" badge on the Dispatch, and "Confirmed by N Strategists" shown only after the Campaign closes (showing it live would invite confirmation rings). Confirmation uses the existing `steelman_flags` rules unchanged.
- **Scoring.** The existing bonus rules are not changed in this item. A `steelman` Dispatch becomes an eligible target for the same confirmations and AI detection. Whether the bonus applies to a `steelman`-typed Dispatch in place of, or in addition to, a rebuttal that contains one is a rubric decision that changes what members are told before a Campaign opens (rule 7), so it is Dele's decision, not assumed here.
- **New Campaigns only.** A Campaign records the Dispatch kinds it allows. Campaigns scheduled before this ships keep three kinds and their published rubric. A Campaign whose rubric is already published is never altered.

**Migration (additive).** Add `steelman` to the Dispatch kind enum with `alter type ... add value` in its own migration file (it cannot be used in the same transaction that adds it), and a `campaigns.allowed_kinds` column defaulting to the current three. No change to existing rows or the Campaign 1 rules.

**Privacy or legal question.** None new for the type itself. The rubric text the public reads changes, and rubric wording about AI judging sits in `notices.ts` (Claude may not edit it), so any rubric sentence about the steelman type needs Dele's or legal's wording.

**Tests.** Unit: eligibility, caps, the blend is byte-identical for a Campaign without the new kind (a golden test over the existing fixtures, so no existing Verdict can change). RLS: posting a `steelman` in a Campaign that does not allow it is refused. Playwright: post, badge, confirmation count only after close. Judging eval re-run (`eval:judge`) to show scores are unchanged on the gold set.

**Estimate.** 6 to 8 days.

**Gate.** A judging gap (no Campaign in judging when the migration is applied and deployed); the rubric decision above; the first Verdict has shown how steelman confirmations behave in practice.

---

## e. Peer-vote weighting by agreement, plus reviewer record

**Marker:** NEEDS-LEGAL/CONSENT, and AFTER-FIRST-VERDICT. Judging-touching: a new weights version for **later Campaigns only**.

**Current state.** Peer votes are reputation-weighted (`reputation.points`: 10 per title, 4 per award, 1 per judged Campaign) with capped credits and a reputation cap multiple. The peer component is a share of the top Strategist's weight. The weights live in `judging_weights` by version; the live Campaign 1 uses version 2 (panel 40, peer 25, AI 25, mind-change 10). There is no measure of how well a voter's picks agree with the panel and AI, and no reviewer record.

**The gap.** A voter who consistently backs what neither the panel nor the AI rates well weighs the same as one who tracks quality. The plan proposes weighting by agreement and publishing a reviewer record to make reviewing a reputation activity.

**Design.**
- **Agreement score.** For each voter, after a Verdict is final, compute how often their votes went to Dispatches in the top half by the panel and AI blend, over a rolling window of their last N Campaigns, with a minimum number of votes before it applies (so one Campaign cannot move it).
- **New weights version.** `judging_weights` version 3 adds an agreement factor to peer vote weight (bounded, for example between 0.5 and 1.5, so nobody is silenced and nobody can swamp). It applies only to Campaigns whose rubric is published with version 3 after the version exists. Campaign 1 to 4 stay on version 2. It is never applied retroactively.
- **Reviewer record.** A private page for the member showing their own agreement history and how it affects their vote weight; a public figure only if the member opts in (see the legal question).
- **Circularity guard.** Agreement is computed from components that exclude peer votes (panel and AI only), so voters cannot agree with each other to inflate it.

**Migration (additive).** `reviewer_agreement` (user_id, campaign_id, votes, agreed, computed_at) written only by a service-role function after a Verdict is final; a new `judging_weights` row (version 3) with an extra nullable column for the agreement bounds (existing rows null, meaning version 2 behaviour); no change to existing rows.

**Privacy or legal question.** This builds a per-person quality record from their votes: profiling under UK GDPR, which needs a lawful basis, a privacy-policy statement and a way to object. It influences how much a vote counts, which affects the outcome for other people (the Grand Strategist title), so legal must say whether it is a significant automated decision and what must be told to members before it applies. Also: whether it may be shown to others, and the wording in `notices.ts` (Claude may not edit it; the AI judging notice and any peer-vote description there may need updating).

**Tests.** Unit: the agreement score and bounds with fixtures, including a voter at the minimum and one below it; a golden test that version 2 Campaigns compute exactly as today. RLS: a voter reads only their own record. A simulation test shows a crowd of low-agreement voters cannot swamp a small high-agreement group. The gold-set eval is re-run to show no change for version 2.

**Estimate.** 8 to 10 days.

**Gate.** Legal and fairness review first; data from at least 3 Verdicts to see how agreement is distributed (the bounds are chosen from data, not guessed); a judging gap; and Dele publishes the version-3 rubric text before any Campaign using it opens.

---

## f. Notifications: in-app inbox, then web push, then one capped weekly email

**Marker:** inbox AFTER-FIRST-VERDICT. Web push and the weekly email NEEDS-LEGAL/CONSENT. Build in that order, one at a time.

**Current state.** Email only. `email_outbox` has these kinds: `reply`, `campaign_opened`, `campaign_round_changed`, `campaign_closed`, `campaign_closing_soon`, `moderation_outcome`, `judge_assigned`, `peer_voting_open`, `verdict_published`, `verdict_appeal_outcome`, `invite`. Limits: an app email cap of 60 a day (global) and 6 a day per person, an essentials-only setting, and per-kind switches (`community_settings`). Resend's free plan is 100 a day, shared with Auth email. There is a PWA manifest and service worker (`public/sw.js`, `src/components/pwa.tsx`); no push subscription exists and no inbox.

**The gap.** Email cannot be the main channel at the free-plan limit; members have nowhere in the app that says what changed for them.

**Design.**
1. **In-app inbox (first).** A `notifications` table written by the same server events that now queue email (reply, campaign opened, closing soon, Verdict published, appeal outcome, judge assigned), plus a bell in the header with an unread count and an Inbox page. Each row: kind, a plain sentence, a link, read-at. No new visual style: reuse the existing list and card components and the header's existing icon-button pattern; if the bell needs a new style, stop and ask. Unread counts are computed server side; nothing is pushed in this step.
2. **Web push (second).** Opt-in only, from a button on the Profile page (never a prompt on first load). Uses the existing service worker and Web Push with VAPID keys that Dele creates and stores in environment variables (names to be agreed; Claude never sees or prints values). A `push_subscriptions` table keyed to the user; a "stop" is one tap and deletes the row. Push mirrors only inbox events the member chose (closing soon, Verdict published, reply).
3. **Weekly email (third).** One email a week at most, a digest of unread inbox items and what is open, sent through the existing outbox with the global and per-person caps, an unsubscribe link and the stop-links machinery that exists (`email_stop_links`). Off by default; the member turns it on.

**Migration (additive).** `notifications`, `push_subscriptions`, a new `email_outbox_kind_check` value for the digest (the check constraint is dropped and re-added in one migration, as earlier migrations did), and per-member preference columns. RLS: members read and update only their own rows.

**Privacy or legal question.** Push and a recurring email are electronic marketing-adjacent messages under PECR if they promote Campaigns; a service message about the member's own Dispatch is different from a digest of what is open. Legal should confirm which are service messages and which need opt-in consent, the lawful basis, the privacy-policy rows (push endpoints are personal data; retention for subscriptions and for read inbox items), and the cron retention job for both tables. Push endpoint storage needs a retention rule (suggest: delete after 30 days of failures).

**Tests.** RLS: a member sees only their own. Unit: event to inbox mapping, the per-person cap, the digest builder and its cap. Playwright at 375px: bell, unread count, mark read, opt-in, opt-out. Push tested with a stub push service, never a real one. Existing email tests stay green.

**Estimate.** Inbox 6 to 8 days; push 3 to 5 (Dele sets the keys); weekly email 2 to 3.

**Gate.** Inbox first and shipped before push is started. Push waits for the keys (set by Dele) and legal. The weekly email waits for the inbox and the legal answer. The email caps (60 a day) are not raised.

---

## g. Archive filters and paging, robots and sitemap, opt-in public Verdict pages

**Marker:** filters and paging AFTER-FIRST-VERDICT (nothing to archive before it); robots and sitemap AFTER-FIRST-VERDICT; opt-in public Verdict pages NEEDS-LEGAL/CONSENT.

**Current state.** `/campaigns` lists Open, Opening soon and Closed Campaigns in sections without filters or paging. `/search` exists (Dispatches, topics and handles). The leaderboard has category filters. There is no `robots.txt` and no sitemap in `src/app`; only `/join` and `/email/unsubscribe` set `noindex`. Verdict pages are publicly readable now (they show handles, linked to Strategist pages), because members acknowledged a public record at sign-up. There is no opt-in public page with handles removed.

**The gap.** The archive will not scale beyond a few dozen Campaigns, search engines get no guidance, and there is no safe, indexable surface for evergreen content.

**Design.**
- **Archive.** On `/campaigns`: filters by category, status and year; "Show more" paging (existing button) of 12 at a time; the filter state in the URL so a list is shareable. Server rendered, no new component styles.
- **robots.txt and sitemap.** `src/app/robots.ts` and `src/app/sitemap.ts`. Default: disallow everything private (`/admin`, `/judging`, `/api`, `/auth`, `/profile`, `/dossier`, `/onboarding`), and list only pages that are intentionally indexable (the home page, `/campaigns`, the About/How it works pages, and individual Verdict pages only if they are opted in). A sitemap never lists a page that sets `noindex`. Sitemaps list Campaign pages without Dispatch text.
- **Opt-in public Verdict pages, handles removed.** A per-Campaign admin switch `verdict_public_indexable`, off by default. When on and the Verdict is `final` (appeal window closed), a separate route (`/verdicts/[slug]`) renders the Campaign title, the Verdict rationale with every `@{user:id}` token replaced by "a Strategist" and the winning case summary also with handles stripped, and the criteria and positions aggregates; no Dispatch text, no handles, no links to Strategist pages, no appeal form. The canonical members-only Verdict page is unchanged. Only these pages are in the sitemap.
- Opt-in is by whom? Recommended: an admin sets the switch per Campaign **only after** each Strategist who is named in the rationale or awards has agreed to appear on a page search engines can index, even without a handle (see the legal question); where any of them has not, the switch cannot be set.

**Migration (additive).** `campaigns.verdict_public_indexable boolean default false`, and a per-Strategist consent record (new table or a column on profiles) if the legal answer requires consent from named Strategists. The filters and sitemap need none.

**Privacy or legal question.** Removing handles does not make a rationale anonymous: it describes arguments, a Strategist could be recognised from them or from a quoted line, and a search engine copy cannot be recalled when someone later exercises erasure. Legal should say whether (1) consent is needed from every named Strategist, (2) the rationale and winning case, being AI-assisted text, need extra wording, (3) a takedown path (a `noindex` flip within hours, and a request to remove cached copies) is enough, and (4) how this fits the privacy policy's current statement about the public record.

**Tests.** Unit: the handle stripper (every token form, none left; a rationale containing a handle written in prose is flagged for the admin to edit); the sitemap lists no private or `noindex` page. Playwright: the filter and paging URLs at 375px; an opted-out Campaign's public route returns 404; an opted-in one has no `@` anywhere in the HTML (asserted by test).

**Estimate.** Filters and paging 2 to 3 days; robots and sitemap 1 day; public Verdict pages 4 to 5 days.

**Gate.** Legal on indexing before any public Verdict page route exists. The archive and the restrictive `robots.txt` can come first; the sitemap lists only indexable pages and, until the public pages exist, only the home page and `/campaigns`.

---

## h. Evidence cards: source type, link check, reuse

**Marker:** AFTER-FIRST-VERDICT. Must not feed into judging (see below).

**Current state.** A Dispatch can carry up to five sources: `dispatches.sources` is a JSON array of `{url, title}` (`20261103000200`, at most 5 items), shown with the Dispatch. Evidence-kind Dispatches exist. Nothing classifies a source, nothing checks that a link works, and each Dispatch repeats its own sources.

**The gap.** Members cannot tell a government statistic from a blog, dead links accumulate, and the same source is re-typed across Dispatches.

**Design.**
- **Source type.** A small fixed set: Government or official, Academic or research, News, Organisation or campaign, Other. The author picks it when adding a source; the server may suggest from a short allow-list of well-known domains, but never decides for the author and never shows a type as verified. A card shows the title, the domain, the type and the link status.
- **Link check.** A background job (never inline in the post request) fetches the URL once on posting and again weekly until the Campaign closes, recording only a status: ok, redirected, broken, blocked, or not checked. No page content is stored. The check is a **hint**, shown as "Link last checked on 3 Dec: working", never as an endorsement of the source.
- **Reuse.** A normalised `evidence_sources` table (canonical URL, title, type) that Dispatches reference, so one source is one card across Dispatches and its link status is checked once. A member sees "Also cited in N other Dispatches" counted over visible Dispatches.

**SSRF and timeout safeguards for the link checker (all required).** User-supplied URLs are an SSRF vector, so:
1. **Scheme and port.** Allow only `https` (and `http` only if redirected to `https`), ports 80 and 443 only; refuse credentials in the URL (`user:pass@`), non-standard schemes and IP-literal hosts.
2. **Resolve and pin.** Resolve the hostname ourselves, reject any address that is loopback, private (RFC 1918), link-local (including 169.254.169.254 cloud metadata), carrier-grade NAT, multicast, reserved or IPv6 unique-local, then connect to the resolved IP (not the hostname again), so a second DNS answer cannot rebind to an internal address. Re-apply the same check after **every** redirect.
3. **Redirects.** At most 3, same rules at each hop, never to a different scheme without the check.
4. **Timeouts and size.** 3 seconds to connect, 5 seconds total, response body read capped at 64 KB and discarded (a HEAD first, then a ranged or capped GET only if HEAD is refused); no cookies, no credentials, no `Authorization`, a fixed user agent that names TGS, no following of meta refresh or JavaScript.
5. **Rate limits.** A per-member daily limit on new sources checked, a global queue limit, and one fetch in flight per host, so the checker cannot be used to hammer a third-party site.
6. **Isolation.** Run from a queue worker with a deny-by-default egress policy where the platform offers it, log only the status, never the response, and never expose the fetch result to the poster beyond the status word.
7. **Tests.** A unit suite with a fake resolver covering every blocked range, a redirect to an internal address, a DNS-rebinding answer, a slow-loris server, an oversized body and a redirect loop. A security review of this module before merge.

**Migration (additive).** `evidence_sources` and `dispatch_sources` (join table), a `source_type` enum, a `source_checks` table (status, checked_at); the existing `dispatches.sources` column stays and is back-filled lazily, never dropped.

**Privacy or legal question.** The checker makes outbound requests from TGS's IP to addresses members choose, which is low risk but should be in the privacy policy's list of what we do on a member's behalf. Titles and URLs are member-supplied and already public. Copyright: we store no content. The source type is a member's claim and must not be labelled as TGS's judgement.

**Tests.** As above, plus RLS (members write only their own references) and Playwright for the card at 375px.

**Estimate.** 6 to 8 days (about half of it the checker and its security tests).

**Gate.** The security review of the checker passes before it is enabled; the source type, check status and reuse count must **not** be given to the AI judge, the panel or the blend without a separate, explicit decision (that would be judging-touching and would change a published rubric). Display only.

---

## i. Campaign page participation pulse

**Marker:** BEFORE-FIRST-VERDICT. Display only, no migration, not judging-touching.

**Current state.** The Campaign page shows the countdown, the position form (before and after), the rules, the rubric and the Dispatch threads. It does not show how many people are taking part, so a Campaign with few Dispatches looks empty rather than starting.

**The gap.** The plan wants a "live participation pulse" to make the Campaign feel active. A raw count on a quiet Campaign does the opposite.

**Design.** A single line near the countdown: "12 Strategists have posted 31 Dispatches" (distinct visible authors and visible Dispatches, both already public data), shown **only when at least N distinct Strategists have posted** (proposed N = 10, the same figure as the positions chart threshold; Dele sets it). Below N, show nothing, not "0" and not "Be the first" (the empty-state copy from PR #101 already invites the first post). Never count positions (private, consent-based), reactions, readers, votes or members who only viewed. The count refreshes on page load, not live, to avoid a polling load on the free plans. Reuse the existing text styles; no new component.

**Migration.** None: counts come from the same public read of visible Dispatches that the page already makes (one extra aggregate query, or a security-definer count function if the existing row-level policy makes the aggregate awkward, in which case that function is a small additive migration and the item's marker stays but the migration line changes).

**Privacy or legal question.** Counts of public Dispatches are public; no new personal data. Withdrawn or hidden Dispatches must not be counted. Small counts can single out a person ("1 Strategist has posted") hence the threshold.

**Tests.** Unit: the threshold and that hidden, withdrawn and held Dispatches are excluded. Playwright at 375px: below and above N, no overflow.

**Estimate.** 1 to 2 days.

**Gate.** Dele picks N. Ship on a Wednesday or Thursday that is not within 24 hours of a Campaign closing or a Verdict publishing. For the first Campaign (opens Tuesday 1 Dec), the only compliant days before it are Wednesday 25 and Thursday 26 Nov, and no Campaign closes before 8 Dec, so those two days are open; after 1 Dec the weekly-close rule applies.

---

## j. Campaign Studio

The admin-only draft helper (`/admin/campaigns/[id]/draft-helper`, merged as PR #109) is live. Dele decided on 20 Nov to keep it live. It does not meet the approved spec's changes 1 to 3. This item covers its follow-ups.

**Current state.**
- Built and live: admin-only draft of a summary, fact-check table, re-check dates and a rules template, with a validator and a 10-a-day bucket.
- Not built (all from `docs/CAMPAIGN_DRAFT_HELPER_SPEC.md`): (1) **normalisation** before the substring, figure and date checks, so a format difference (smart quotes, "£1m" and "£1 million", dashes, spaces, "1st" and "1") is not read as an invention; (2) the **no-logging sentinel test** (a unique string in the notes must reach no `console`, event log, database row or result); (3) `npm run eval:campaign-draft -- --real` and the real-model first-use check on 2 or 3 real note sets; (4) the **month check** (bare month names such as "march" or "august" must not count as dates; today they do, causing false rejections); (5) the public wording on `/ai-use` and `/privacy` and the page notice; (6) the check that Vercel's logs and any drain do not record request bodies, recorded in `docs/CLAUDE_LOG.md`.
- Not built and not in that spec: stored re-check reminders and one-click copy into the campaign form. Today the re-check dates are text in the draft only, and the admin copies and pastes by hand.

**The gap.** A privacy sentence the spec requires ("TGS does not store the notes") is not yet true to a standard we can prove, and the helper currently rejects some honest drafts.

**Design, by sub-item.**
1. **Normalisation, sentinel test, month check, `eval:campaign-draft`.** As specified in the approved helper spec, unchanged. No new design. Sentinel test first, because it backs the privacy claim.
2. **Stored re-check reminders.** A table of reminders per Campaign (date, a short note, done flag), created from the helper's re-check dates after the admin approves each, shown on the Admin home page as "To re-check" in date order, with a mark-done button. No email in the first version; an admin-only in-app list reuses the existing admin list styles. Reminders hold the admin's approved text, never the notes.
3. **One-click copy of a draft into the campaign form.** Fills the summary field (and rules, if the admin ticks it) on the Edit Campaign page, client side, leaving the admin to review and save. It never saves, publishes or changes a Campaign by itself, and it never overwrites a field without showing the text it will replace. Subject to rule 7: summary and rules stay editable after the rubric is published, so the admin sees a warning if the Campaign is already scheduled or open.
4. **Public wording (`/ai-use`, `/privacy`).** Text only, in the spec's proposed form. These are legal pages, so Dele or legal approves the strings first; Claude does not write them into `notices.ts` or legal strings on its own.

**Migration (additive).** Only for reminders: `campaign_recheck_reminders` with admin-only RLS. Everything else needs none.

**Privacy or legal question.** The helper sends notes to Anthropic. The helper spec's open items stand: the public statements, and confirming hosting logs do not record request bodies. The real-model run uses real source notes, so Dele chooses which sets and confirms the sources may be sent.

**Tests.** As in the helper spec (normalisation table with near misses; the sentinel test; month-check cases); RLS for reminders; Playwright for the copy button (fills fields, saves nothing).

**Estimates.** Sub-item 1: 3 to 4 days; reminders 1 to 2; copy 1.

**Markers.**
- Sentinel test, normalisation, month check, eval script: **BEFORE-FIRST-VERDICT** (these fix a live admin tool and back a privacy claim; they touch no judging and no member).
- Reminders and copy: **AFTER-FIRST-VERDICT** (convenience; Campaign 2 onward).
- Public wording: **NEEDS-LEGAL/CONSENT**, plus the hosting-log check.

**Gate.** Per sub-item, only when Dele says "build" for it. The real-model first-use gate stands: no unexplained discard, every discard classified, Dele has read the drafts.

---

## k. Coach v2 (the weakest link)

**Marker:** AFTER-FIRST-VERDICT. Display only to the author while drafting; never changes a score.

**Current state.** The coach prompt v2 (`prompts/coach.v2.md`) adds an optional `weakest_link` and one "Weakest link:" line in the UI (PR #102, merged). `PROMPTS.coach.version` is **1**: v1 is the default and v2 runs only when asked for (the eval and tests). The real-model eval after the validator fix was 20 of 20 ok for both versions at about $0.45 for a two-version run. The validator `weakestLinkRule` has a known false rejection (c12, below).

**The gap, and what must happen before it is switched on.**
1. **Variance run.** The 20-draft run is one pass. Model output varies between runs, and the validator was tuned against one set of outputs. Run `eval:coach --versions=1,2` repeatedly (say 5 full runs, about $2.25 in total), and record for each draft how often a weakest link is present, kept, omitted by the model, or dropped by our rules, and how often the answer fails any rule. Switch-on needs a stable result: no rule failures that were not already classified, and a weakest-link rate that is similar between runs.
2. **Hand-read by Dele.** Dele reads every weakest link the run produced (not a sample), against its draft. The questions: is it the real weakest link, is it kind, does it avoid rewriting the draft for the member (AI must not write the argument), and does it avoid anything that looks like a score or ranking.
3. **The c12 fix.** A valid sentence is dropped because it names two part words ("The clarity is the main problem: … no claim for evidence or a counter-argument to attach to."). The proposed fix, counting only the first part word named and allowing others in the same sentence, is **not applied**. Before switch-on it must be decided and built with its tests: add c12's real answer as a fixture to `evals/coach-validator-false-positives.json`, add adversarial cases (a sentence that names two parts to hedge; one that uses "evidence" only as an ordinary noun), and show the false rejection is gone without letting a hedged answer through.

**Design of the switch-on.** After the three steps pass, change `PROMPTS.coach.version` to 2 in one tiny commit, behind the existing AI-off and cap controls. Keep the one-line revert (set it back to 1) written in the PR. The privacy and AI-use wording does not change (the coach already exists); confirm this with legal before the switch.

**Migration.** None.

**Privacy or legal question.** None new beyond what v1 already has; confirm the `/ai-use` description of coaching still reads true ("names the weakest link" is a new thing the coach does).

**Tests.** The existing coach unit tests, the updated fixtures, the real-model variance run (manual, never CI), and a render test that the line appears only when present.

**Estimate.** 2 to 3 days of Claude time, plus Dele's reading.

**Gate.** The three steps above, in order, and not within 24 hours of a Campaign closing. The coach is not judging-touching, so the "no judging-touching change while judging runs" rule does not apply, but the Tuesday to Thursday rule does.

---

## 4. Open questions for Dele

1. **Judging gap (items d and e).** With weekly Campaigns closing every Tuesday and a 96-hour judging window, judging is almost always running. When may a judging-touching change land: a skipped slot, the holiday week, or a pause between Campaign blocks?
2. **Threshold N for the pulse (item i)** and whether to align it with the positions chart (10).
3. **Order.** My suggested order after the first Verdict: k, j (sentinel first), i (if not already shipped), a, f (inbox), g (filters and robots), h, then the legal-gated items (b, c, d, e, g public pages, f push and email) as each legal answer arrives.
4. **Legal list.** The questions that need legal, gathered: judge consent and named display (b); free text beside a position change and author notification (c); profiling by agreement and significant effect on outcomes (e); PECR for push and weekly email, push endpoint retention (f); indexing a Verdict, consent from named Strategists, takedown of cached copies (g); public AI wording for the helper and the change note (a, j).
5. **Rubric text (items d and e).** Any change that members are told before a Campaign opens is Dele's wording.

## Not covered

Nothing here has been run on hosted. Estimates are rough. No code, migration, dependency or legal string was changed to write this document.
