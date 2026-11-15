# Campaign: `vat-on-private-school-fees` (topic-bank entry added 15 Nov 2026)

Docs only. Nothing here has been loaded to hosted, entered in Admin, published or scheduled. The topic-bank entry is in `supabase/data/launch-topics.json`; the bank only loads drafts (`npm run topics:load`), and the loader never changes a Campaign that already exists.

## Entry
| Field | Value |
| --- | --- |
| Title (the question) | Should VAT on private school fees stay? |
| Web address | `vat-on-private-school-fees` |
| Category, format | Education, Open arena |
| Sensitive, opinion not advice | No, no |
| Planned dates (owner) | Opens 22 Dec 2026 00:00 UTC, closes 29 Dec 2026 00:00 UTC. The bank has no date fields, so set them in Admin, Campaigns (UK time: 00:00 on both days, because the UK is on GMT in December) |
| Summary | 1,247 characters (limit 2,000), the owner's exact text, in `public_summary` (what loads as the Campaign summary); facts checked 15 Nov 2026. The entry's `summary` field is a short bank brief, because the loader keeps the bank's facts out of the public summary (a test enforces it) |
| Rules | 1,444 characters (limit 10,000), below |

## Re-check before opening
Supreme Court hearing 1-2 Dec 2026 (UKSC/2026/0045 and 0056). If a judgment is handed down before 22 Dec, update the legal sentence in the summary ("Court challenges have failed so far ... the Supreme Court is listed to hear an appeal on 1 and 2 December 2026"). Also refresh the DfE and ISC figures and the £1.8 billion estimate on the day it opens.

## Rules (plain text, generic open arena)
Copied from section 3 of `docs/campaigns/under-16-social-media-ban.md` (the owner's edited text), with the "Changing your mind" paragraph in its corrected form (15 Nov 2026). The numbers in it are code defaults: confirm them with queries C and E in that brief before pasting.

```text
This is an open arena: there are no rounds. You can post at any time while the Campaign is open.

What you can post
An Argument can be up to 1,500 characters. A Rebuttal can be up to 1,000 characters. Evidence can be up to 600 characters.
You can post up to 10 Dispatches in this Campaign. If you reach the limit, the message may say "in this round": it means the Campaign.
You can post again 30 seconds after your last Dispatch, and you can edit a Dispatch for 5 minutes after posting it.

Being open about AI
Each Dispatch carries a declaration: none, assisted or generated. It is shown publicly. Please declare honestly.

Keeping it civil
Handles and Dispatches are screened. Anything held is hidden until a person has checked it. Screening never deletes anything, and only an admin can remove a Dispatch. Argue with the idea, not the person.

Changing your mind
If a Dispatch changes your mind, you can pick it. Your account must be at least 48 hours old and you must have taken part in this Campaign. You can pick while the Campaign is open or during its 72-hour peer-voting window. For your pick to count, your recorded position must have changed over at least 24 hours.

How it is judged
The four criteria and the blend of judging weights are set out under "How this Campaign is judged" on this page, and are fixed before the Campaign opens.

The clock
The countdown on this page uses the server's time. It is the only clock that counts.
```

## Admin form order
Save as a draft with Publish = Keep as draft; confirm the judging weights version (Admin, Judging); Publish the rubric (cannot be undone); then set Publish = Schedule it with the dates above; save; check `/admin/audit` for `campaign.rubric_published` and `campaign.updated`. Settle the summary and rules first: they stay editable after publishing and edits show on the public page.

## Not in the bank entry, on purpose
- **Rules:** the topic bank has no rules field (the loader sets rules to null), so the rules live here.
- **Sources:** six, added 15 Nov 2026: the government measure paper (94% state schools), DfE pupil statistics (560,300, down 3.8%), the Court of Appeal judgment [2026] EWCA Civ 170, the Supreme Court term sittings (1 and 2 December 2026, UKSC/2026/0045 and 0056), the ISC daily news summary of 3 June 2026 (about 30,000 fewer pupils) and a GB News report for the ISC closure figures (57 against about 42; an ISC claim, attributed in the summary).
- **Dates:** see above.
