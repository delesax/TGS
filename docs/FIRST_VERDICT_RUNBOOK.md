# Admin runbook: the first Verdict (Campaign 1 closes 8 December 2026 00:00 UTC; draft about 12 December)

Written from the code and the Sprint 5 demo (`docs/DEMO_SPRINT_5.md`) on 17 Nov 2026. It was rehearsed once on a local stack on 18 Nov 2026 (see "Not verified"), not on hosted. Everything here is done by an admin in the browser; nothing needs a deploy.

## Timeline (from the judging functions)

| When | What happens |
| --- | --- |
| Close, 8 Dec 00:00 UTC | The Campaign closes. Participants get a "Voting is open" email. Peer voting is open for 72 hours (5 votes each, plus "It fairly restates the other side"). |
| From close | pg_cron queues AI rubric scoring (`judging-tick`, `judging-kick`) and calls `/api/judging/process`. Jobs the daily AI cap refuses are released and retried an hour later; they are never counted as failed. |
| Close + 96 hours, about 12 Dec 00:00 UTC | The draft Verdict is computed once every Dispatch is scored and the panel has submitted. It then shows "Draft: ready to publish" in Admin, Judging. |
| After you publish | An appeal window (7 days by default) opens. After it, the Verdict becomes final. |

## Before the Campaign closes (check on 7 Dec)

1. Admin, Judging reads **Judge prompt version 1** (decided 16 Nov; the database default is 2).
2. Admin home reads "of 2,000 calls" for the AI cap (owner-reported raise). Judging stops at 80% of it (1,600 a day).
3. At least one **judge is assigned** to the Campaign (Admin, Judging, the Campaign, "Assign a judge"; they are emailed) and knows to submit their scores.
4. `/api/health` returns 200 and Admin, Health shows empty queues.

## Publishing the Verdict

1. **Admin, Judging, the Campaign.** Read the status board: panel submitted (e.g. 2/2), AI scores (all Dispatches), votes, picks. If AI scores are missing, wait (the cap or an hour's retry) or use "Re-run AI scoring" (one button per Dispatch, shown once the Campaign has closed) on the stuck item. If a score looks wrong, an admin can override it with a reason; the override is audited.
2. **Review the draft:** weights used, the ranking (every Strategist by current handle), proposed awards, the rationale, and any "Needs attention" items. A tie or missing input is shown as "needs attention", never silently re-weighted.
3. **Only if you must change the weights:** tick "Override the weights", set them, give a **reason** (required), and recompute. The public page then says "Set by an admin for this Verdict: <reason>."
4. **Edit the rationale** if needed ("Edit the rationale"; the before and after are audited). The scores are never changed by editing the wording.
5. **The winning-case summary (feature on `feat/verdict-winning-case`, NOT yet on main; skip this step until it is merged and its migration applied).** In the Admin block: "Draft with AI" (on demand only; nothing is drafted automatically), read the draft against the winner's Dispatches, edit it, choose the "Best Dispatch", tick the confirmation that you have read it against the Dispatches, and "Approve this summary". If the AI is off or its draft fails the checks (an invented quotation, figure, label or motive) you get a clear message and can write the summary yourself. Without an approved summary the Verdict page simply shows none. Nothing AI-written is public until you approve it and publish.
6. **Publish:** tick "I have reviewed the scores, awards and rationale" and "Publish the Verdict". Awards are issued and the Verdict is public with its rationale and the appeal section.
7. **Check the public page** `/campaigns/<slug>/verdict`: Grand Strategist card, (winning case), Why, Awards, "How the scores add up", the AI notice and the appeal form. Check the Leaderboard and the winner's Dossier.

## If the AI is unavailable

- **API down or key problem:** scoring jobs wait and retry; nothing fails and nothing is published automatically. The draft Verdict waits for every Dispatch to be scored. You can raise or wait out the cap, re-queue items, or (Admin, Settings) switch AI off, in which case screening falls back as set in Settings and no AI scoring runs; discuss with Dele before publishing a Verdict without AI scores, because the weights assume them.
- **Spend:** the Anthropic monthly limit (decision D8, $30) is not enforced by the in-app cap; check the Anthropic console on judging days.

## After publishing

- **Appeals:** a participant can appeal once during the window. Admin, Judging, the Campaign: decide each with the form "Decide the appeal by @handle": choose "Reject: the Verdict stands" or "Uphold: recompute and publish a revised Verdict", write the reasons (required, kept in the audit log) and press "Record decision". Until a second admin exists the decided appeal shows "(decided by the admin who published the Verdict)"; that is expected with one admin.
- **Removing a published summary** (once the feature is live): "Remove the summary" with a reason of at least 10 characters; the removed text is kept in the audit entry `verdict.summary_removed`.
- **Audit trail:** Admin, Audit log shows `verdict.computed`, `verdict.rationale_edited`, `verdict.published`, `verdict.appealed`, `verdict.appeal_decided`, `panel.submitted`, `ai_rubric.scored` and, with the feature, the `verdict.summary_*` entries.

## Not verified

**Rehearsed locally on 18 Nov 2026** (fake AI provider, a seeded test Campaign with 11 Dispatches, on the branch that contains the winning-case feature): drafting, approving, publishing, the public page (Grand Strategist, winning case, Why, Awards, how the scores add up, AI notice, appeal form), the Leaderboard, an appeal and its rejection, removing the summary, and the audit entries `verdict.computed`, `verdict.published`, `verdict.appealed`, `verdict.appeal_decided`, `panel.submitted`, `ai_rubric.scored` and `verdict.summary_*` all behaved as described above. Two wording slips found and fixed in this file: the button is "Re-run AI scoring" (not "Re-queue") and the appeal form is as described under "After publishing". Locally, Judge prompt version reads 2 (the database default) and the Admin home AI cap shows the local default, not 2,000. `verdict.rationale_edited` was not exercised.

This runbook has not been followed on hosted, and the appeal-window and finalisation timings come from the code and the demo, not from a hosted run. The Campaign 1 judge assignment and the live AI cap are owner-reported only.
