> **Superseded on 7 November 2026 by [LEGAL_WORDING.md](LEGAL_WORDING.md).** This file records the Sprint 4 placeholder wording as it stood on 6 November and is no longer what the site shows.

# DRAFT wording awaiting owner approval

Every piece of Sprint 4 copy that is marked DRAFT or awaits your approval, copied **verbatim** from the code on 6 November 2026. Nothing here has been edited or improved: this is what Strategists would read today. Text in `{braces}` is filled in by the page (a name or a number).

To change any of it, edit the file named in each entry (a normal release). Each entry says what the wording must make clear to the reader.

All of these decisions come under owner decision 8 (account deletion) or 5 (privacy), listed in `docs/OWNER_DECISIONS.md`.

---

## 1. `/profile/delete` (Delete my account)
File: `src/app/profile/delete/page.tsx`. The whole page is DRAFT. The page opens with the shared DRAFT banner (see section 7).

**Shown while deletion is switched off (the default):**

> Deleting your account is not switched on yet during this closed test. If you want your account deleted now, reply to your invitation email and we will do it by hand.

Button: "Back to your account"

*Must make clear:* deletion is not yet self-service, and who to contact (the invitation email) to have it done by hand.

**Shown when deletion is switched on:**

> **1. Download your data first**
> Once your account is deleted we cannot send you a copy.
> Button: "Download my data"

*Must make clear:* the data export is the only chance to keep a copy.

> **2. What happens**
> **Removed for good:**
> - your email address and the ability to sign in, including passkeys
> - your handle @{handle}, name, expertise and bio
> - your reactions, who and what you follow, and your email settings
> - your positions on Campaigns that are still open
>
> **Kept, with no name attached:**
> - your {n} Dispatch{es}, shown as by “a deleted Strategist”, because Verdicts and the record of each debate depend on them
> - your positions on closed Campaigns, kept without any link to you, for the record of how minds changed
> - the audit record of what happened, kept for safety and accountability

*Must make clear:* exactly what is erased and what stays, why Dispatches stay (Verdicts and the debate record), that kept data is no longer tied to the person, and that the audit record is kept. (Whether positions on closed Campaigns are kept is itself part of decision 8.)

> **3. Confirm**
> (the confirmation form in section 3 below)
> Button: "Keep my account"

*Must make clear:* the person can still back out.

## 2. `/account-deleted` (shown after deletion)
File: `src/app/account-deleted/page.tsx`. Title: "Your account has been deleted". Shared DRAFT banner above the text.

> Your email address, sign-in, handle and profile have been removed. Your {n} Dispatch stays in the debates, shown as by “a deleted Strategist”.

(With more than one: "Your {n} Dispatches stay in the debates, shown as by “a deleted Strategist”." With none, the second sentence is left out.)

Button: "Go to the home page"

*Must make clear:* the deletion has happened, what was removed, and that the Dispatches remain without a name.

## 3. The deletion confirmation (checkbox and form)
File: `src/app/profile/delete/delete-form.tsx`.

> Type your handle, {handle}, to confirm
> Your password
> ☐ I understand this cannot be undone. (DRAFT wording)
> Button: "Delete my account" (while working: "Deleting…")

Messages from the form (file `src/app/profile/delete/actions.ts`, not marked DRAFT but part of the same flow):

> Type your handle, {handle}, exactly to confirm.
> Enter your password.
> Tick the box to confirm you understand what happens.
> That password is not right. (hint: Nothing has been deleted. Try again, or reset your password first.)
> We could not delete your account. (hint: Nothing has been deleted. Please try again in a moment.)

*Must make clear (checkbox):* deletion is permanent and the person has understood what the page above said. The checkbox label itself still contains the words "(DRAFT wording)", which must be removed when the wording is approved.

## 4. The Account page entry point
File: `src/app/profile/page.tsx` (not marked DRAFT, but it points to the pages above).

> **Deleting your account**
> See what is removed and what is kept, and delete your account if this is switched on.
> Button: "Delete my account"

*Must make clear:* where to go to see the consequences before deleting.

## 5. The AI paragraph on `/privacy`
File: `src/app/privacy/page.tsx`. Heading and text, marked `[DRAFT]` and `[Placeholder, needs legal review]` (owner decision 5; UK GDPR):

> **[DRAFT] Automated checks by AI**
> [Placeholder, needs legal review] To keep debates safe, the text of every Dispatch and every handle is sent to our AI provider, Anthropic, to check it against our community rules. If you ask for feedback or a tone check, your draft is sent too. We send only the text and the Campaign's question and topic, never your name, email address or other details. The AI can hold a Dispatch for a person to check; it never deletes anything, and a person reviews every hold and every appeal. We keep a record of each AI decision and of coach feedback, but not your drafts.

*Must make clear:* that Dispatch text, handles and requested drafts are processed by Anthropic; what is and is not sent; that AI can only hold, never delete; that a person reviews every hold and appeal; what is recorded and what is not. It must say this before real invitees arrive and needs a lawyer's review.

## 6. The AI help note in the compose box
File: `src/components/dispatch/ai-help.tsx`. Shown above "Check my tone" and "Get feedback" when the AI is switched on:

> Optional, private help from AI. Your draft is sent to our AI provider to check it, and is not stored. Nothing here is shown to anyone else.

*Must make clear:* the help is optional, the draft is sent to an AI provider, the draft is not kept, and nobody else sees the result.

Related lines in the same box (same file, and `src/components/dispatch/compose-form.tsx` for the second):

> The coach asks questions and points at weaknesses. The argument and the words stay yours.
> A private note: {nudge} Only you can see this.
> (after posting) {nudge} You can still edit your Dispatch for a few minutes.
> Thank you. Your rating helps us improve the coach.

## 7. The shared DRAFT banner
File: `src/components/page.tsx` (component `DraftNotice`), shown at the top of the pages in sections 1 and 2 and on the policy pages:

> DRAFT — placeholder text, not yet reviewed.
> This page will be replaced with reviewed wording before the pilot opens. Do not rely on it.

---

## Also marked DRAFT, from Sprint 1 (outside this list, not changed in Sprint 4)
These are older placeholder pages, listed so nothing is missed. Only the privacy page was extended in Sprint 4 (section 5).
- `src/app/privacy/page.tsx`: the other sections ("Who we are", "What we collect", "Why we use it, and our lawful basis", "How long we keep it", "Your rights", "Cookies and analytics") are `[DRAFT]` / `[Placeholder]` text.
- `src/app/terms/page.tsx`: 7 DRAFT markers.
- `src/app/ai-use/page.tsx`: 5 DRAFT markers (it links from every Dispatch's AI-use label).
- `src/lib/launch-topics.ts`: the placeholder content note "DRAFT: content note to be written by the owner" and the placeholder summary used by the launch-topic loader (see `docs/OWNER_DECISIONS.md`).
