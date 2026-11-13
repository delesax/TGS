# Runbook: privacy requests and complaints

For the owner and any future helper. Plain English. A request arrives through **Contact us about your data**
(`/privacy/contact`) or by email to the privacy mailbox. Emailed requests: add them to the queue yourself by
sending the form's fields to yourself, or note them in the admin note of a request you create for them
**[OWNER TO DECIDE how emailed requests are logged]**.

## The clocks

- **One month** to reply to any request (the queue shows the due date and highlights under 7 days and overdue).
  For a complicated request you may take **up to two more months**: tell the person why, within the first month.
- **A complaint:** acknowledge within **30 days** (we aim for 7) and tell the person the outcome without
  unnecessary delay. The form sends an acknowledgement email at once.

## Step by step

1. **Open** Admin → Privacy requests. Read the request. (Opening is logged.)
2. **Verify who they are.**
   - A signed-in request came from the account: the email is the account's. Reply to that address.
   - A request not signed in: **reply to the email address on the account** and ask them to reply from it.
     Never send personal data to an address you cannot tie to the account.
   - If you still doubt it, ask one question only the account holder would know (for example the handle, the
     date they joined, or the title of a Campaign they posted in). Do not ask for ID unless you must.
   - Third parties (a solicitor, a relative): ask for written authority from the person.
3. **Set the status** to *In progress* and write an outcome note as you go. The note stays with the request.
4. **Do what they asked** (table below).
5. **Reply** using the templates below. Set the status to *Closed*, with the outcome in the note.

## What each type means, and where to do it

| Type | What it means | What to do |
| --- | --- | --- |
| Question | A question about their data | Answer it. Close. |
| Access | "Show me my data" | Tell them to use **Download my data** (Account page): it covers account, consents with versions, the invite code, Dispatches and AI-use declarations, reactions, follows, positions and consent, email settings, passkey names and dates, reports and appeals they made, decisions about their Dispatches and handle, coach feedback and ratings, and their privacy requests. If they cannot sign in, ask an admin to run the same export for them (a developer task; **[OWNER TO CONFIRM how]**). Other people's data is left out by design. Close. |
| Correction | Wrong data | They can edit name, expertise and bio on the Account page. For anything else (for example the email), do it for them and note it. Handles cannot be changed by the person: if there is a good reason, an admin decides. |
| Deletion | Delete the account or some data | Account: run `npm run account:delete -- --email <their account email>` **without** `--confirm` first (a dry run shows what goes and what stays), send them the dry-run summary if they want it, then run with `--confirm`. Make sure they have downloaded their data if they want it. Remind them their Dispatches stay without their name. One Dispatch only: see the next row. |
| Dispatch removal | Remove or look at one Dispatch (it is about them, mentions them, or holds their data) | Admin → Moderation: find the Dispatch, decide (keep, hold, remove), with a reason. Removal seals the text (kept for our records) and shows "Removed by a moderator". Note the decision. Tell them. |
| Restriction | "Limit how you use my data" | Decide and note it. Practical steps: hold the Dispatch; stop sending them emails (their email settings or "Stop all emails"); pause posting (Admin → Users). |
| Objection | "I object to you using my data for X" (legitimate interest) | Weigh their reasons against ours (see `LIA.md`). Note the decision and the reasons. If you uphold it, take the step (for example stop AI-checking is not possible for posting: explain; consider closing the account instead). |
| Withdraw consent | Usually positions | The person can use **Stop recording my positions** on the Account page. If they ask you to: an admin calls `withdraw_positions_consent` (a developer task today; **[OWNER TO DECIDE on an admin button]**). Confirm to them what was deleted. |
| Complaint | Unhappy about how we handled data | Acknowledge within 30 days (done by the form), investigate, reply with the outcome, tell them they can complain to the ICO. |

## If you refuse (or only part-do) a request

Say **why**, in writing, within the month. Reasons the law allows: clearly unfounded or excessive; the law lets
or requires us to keep it (for example the safety and accountability record, or a pending claim); it would
reveal someone else's data. Always add: *"You can complain to the Information Commissioner's Office at
ico.org.uk or on 0303 123 1113."* Close the request with the reason in the note.

## Template replies

Fill in the square brackets. Keep them short.

**Question / access:**
> Hello [first name or handle],
> Thank you for your message. [Answer. For access: you can download everything we hold about you from Your account → Download my data.] If anything is unclear, reply to this email.
> The Grand Strategist

**Correction (done):**
> Hello, we have corrected [what] as you asked. [Nothing else changed.] Thank you for telling us.

**Deletion (done):**
> Hello, we have deleted your account. We removed your email address, sign-in, passkeys, handle, profile, reactions, follows, email settings, coach records and positions on open Campaigns. Your [n] Dispatch(es) stay in the debates, shown as by "a deleted Strategist". We keep a safety and accountability record for [six years], then delete it. If you are unhappy, you can complain to the ICO at ico.org.uk.

**Dispatch removal (done / not done):**
> Hello, we have [removed / hidden] the Dispatch you told us about. / We looked at the Dispatch you told us about and decided to keep it because [reason]. You can ask us to look again, and you can complain to the ICO at ico.org.uk.

**Restriction / objection (decision):**
> Hello, we have [done X] / we have decided not to [do X] because [reason]. You can complain to the ICO at ico.org.uk.

**Withdraw consent (done):**
> Hello, we have stopped recording your positions. We deleted your positions on open Campaigns and kept the numbers from closed Campaigns with no link to you.

**Needs more time:**
> Hello, your request is complicated because [reason], so we need up to two more months. We will reply by [date].

**Verify identity:**
> Hello, before we send or change anything, please reply to this email from the address on your account, or tell us [a question only you would know].

**Complaint outcome:**
> Hello, we have looked into your complaint. [What we found. What we have done.] If you are not satisfied, you can complain to the Information Commissioner's Office at ico.org.uk or on 0303 123 1113.
