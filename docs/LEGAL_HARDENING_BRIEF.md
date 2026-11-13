TASK: Legal hardening and launch decisions. One sprint, branch "legal-hardening" from main. Read CLAUDE.md, docs/PLAN.md, docs/UX_LESSONS.md, docs/DRAFT_WORDING.md, docs/OWNER_DECISIONS.md and docs/LAUNCH_EMAIL_SETUP.md first.

WHO I AM AND THE RULES
I am the owner. This work was reviewed from a UK GDPR / UK lawyer's point of view; it is not legal advice and a solicitor will still review it. Follow CLAUDE.md. In particular:
- Ask before git push, deletes, database commands and anything touching env files. NEVER print or commit secrets.
- Do not apply any migration to hosted. Write migrations, run them against a local or scratch database, run a dry run against hosted only if you already do that safely, then STOP and report. I apply them after review.
- Do not switch account deletion on. Do not remove the DRAFT banners (see Part 1).
- Do not invent facts. Where a fact is mine (company number, address, ICO number, mailbox), use the config placeholders in Part 1.
- Do not add a paid service. Nothing outside the out-of-scope list in CLAUDE.md.
- Migration timestamps must come after 20261104000500. Before you start, check whether branch sprint-4-audit-handle (migration 20261104000500, stops handle being written into the audit log) is merged. Tell me which it is. It affects one sentence in Part 4D.
- Definition of done applies (typecheck, lint, tests, 375px, empty/loading/error states, no console errors). Plain, large-type wording for older readers.
At the end: CHANGELOG entry, DEMO.md click-through, SESSION_LOG_LEGAL_HARDENING.md (what you did, what you could not do, anything surprising), then STOP.

======================================================================
PART 1. LEGAL FACTS IN ONE PLACE, AND THE DRAFT GATE
======================================================================
Create src/lib/legal.ts exporting one object LEGAL with: companyName "The Grand Strategist Limited", companyNumber, registeredOffice, jurisdiction "England and Wales", icoNumber, privacyEmail, contactEmail, termsVersion "2026-11-a", privacyVersion "2026-11-a", effectiveDate, reviewed (boolean, false).
Every value I have not given you is the empty string. A helper legalValue(key) returns the value, or the visible text "[to be added]" when empty. Pages never hard-code these values.
- While LEGAL.reviewed is false: keep the existing DraftNotice banner on privacy, terms, ai-use, accessibility, and the deletion pages, but change its text to: "DRAFT: this page is complete but has not yet had its final legal review. Some details are still to be added."
- A Vitest test: if LEGAL.reviewed is true, it fails when any LEGAL value is empty or any page still renders "[to be added]" or "[DRAFT". That is the gate for me flipping the flag later.
- Footer (src/components/site-footer.tsx): show companyName, "Registered in England and Wales, company number X", registered office, and the contact email, plus links to Terms, Privacy, How we use AI, Accessibility and "Contact us about your data". (This is a UK legal requirement for company websites; the e-commerce regulations and the Companies Act trading disclosures.)

======================================================================
PART 2. SIGN-UP CONSENTS
======================================================================
Current sign-up has two boxes (18 or over; terms and privacy). Change to three, in this order and with this exact wording:
1. "I am 18 or over."
2. "I understand that my Dispatches are public, and that if I delete my account they stay in the debate record without my name."
3. "I agree to the [terms of use] and have read the [privacy policy]. (Links open in a new tab.)"
All three are required. Server-side checks too (src/app/(auth)/actions.ts), with a clear error for each missing box.
Migration (new, create or replace handle_new_user() from 20261103000100, keeping its invite logic exactly): require raw_user_meta_data public_acknowledged = true; store on profiles: terms_version, privacy_version (taken from LEGAL in the server action and passed in metadata), public_acknowledged_at. Add those three columns in the same migration. Existing rows stay null. Update EVERY test helper, seed script and e2e flow that creates users so they pass the new metadata, or the trigger will reject them. Column grants: follow the pattern already used (no new browser-readable columns beyond what the owner of the row needs; RLS tests for them).

======================================================================
PART 3. PRIVATE POSITIONS: EXPLICIT CONSENT (special category data)
======================================================================
A Strategist's before/after position on a Campaign can reveal political opinion, which UK GDPR treats as special category data. It needs explicit consent. The Dispatch text is different: people publish it themselves.
First INSPECT, and report in the session log: where a position is recorded (table campaign_positions), whether it is optional today, whether posting a Dispatch requires one, whether the Oxford side (For/Against) is stored publicly with the Dispatch, and how the mind-change score uses positions.
Then implement, if it fits in this sprint without redesigning the product:
- Recording a position is optional. A Strategist can post without one.
- The first time someone is asked to record a position, show this notice and a required checkbox before saving: "Recording your position is optional. It shows your view on a public issue, which UK law treats as sensitive. We keep it private and use it only to measure how minds change. Anyone outside our moderation team sees only anonymous totals. You can withdraw at any time by clearing your position, or by deleting your account. [How we use your positions]" Checkbox: "I agree to you recording my position on Campaigns."
- Store consent: profiles.positions_consent_at and positions_consent_version. Withdrawing consent (a "Stop recording my positions" button on the Account page) deletes that person's open-Campaign positions, clears the consent, and writes an audit entry. Positions already archived anonymously in anonymous_positions are not linked to a person and stay.
- The mind-change measure only counts people who gave consent.
- Add RLS tests: a person cannot read or write another person's position or consent.
If making positions optional needs more than a modest change, DO NOT redesign. Implement the notice and consent storage only where it is cheap, list exactly what remains in the session log, and stop that part.

======================================================================
PART 4. THE LEGAL PAGES (replace every placeholder)
======================================================================
Text in {{DOUBLE BRACES}} comes from LEGAL. Text in [square brackets] is a fact the owner supplies later: render it with the legalValue placeholder style, and list every bracket in the session log. Keep headings as H2, short paragraphs, plain words, 18px+ body type, tables that work at 375px (stack on mobile).

--- 4A. /privacy  (src/app/privacy/page.tsx) ---
Title: Privacy policy. Under it: "Version {{privacyVersion}}, in force from {{effectiveDate}}."

H2 Who we are
The Grand Strategist Limited ("we", "us") decides how your personal data is used. Company number {{companyNumber}}, registered in England and Wales, registered office {{registeredOffice}}. We are registered with the Information Commissioner's Office (ICO), registration number {{icoNumber}}. You can reach us at {{privacyEmail}} or through the "Contact us about your data" form. You must be 18 or over to use The Grand Strategist. We do not knowingly hold data about anyone under 18. If we find an account belongs to someone under 18, we will close it and delete their data.

H2 What we collect
Your account: your email address; your password (stored scrambled by our sign-in provider, never readable by us); your confirmation that you are 18 or over; the invite code you used; the version of these terms and this policy you accepted; any passkeys you add. If someone invited you, we may already hold your email address from that invitation.
Your profile: your handle, and any name, expertise or bio you choose to add.
What you do on the site: your Dispatches, your AI-use declarations, reactions, follows, reports and appeals, and your Campaign positions if you agree to us recording them.
Messages you send us: privacy requests and complaints.
Records we make: decisions about Dispatches and handles (some made with AI), the reasons for them, and a safety and accountability record of actions on the site.
Technical data: our hosting providers keep ordinary security logs, such as your IP address. We use only the cookies needed to keep you signed in.

H2 Sensitive subjects
We do not ask you about your health, religion, politics or similar subjects. Debates are about public issues, so what you write may reveal them.
- What you publish in a Dispatch: you are choosing to make it public, and that is the legal condition we rely on for handling it.
- Your private positions on Campaigns: your view on an issue can reveal political opinion, which UK law treats as sensitive. We record a position only if you agree first. You can withdraw at any time (see Your rights). We keep positions private, use them only to measure how minds change, and publish only anonymous totals.

H2 Why we use your data
Table with columns: What we do / Why / Our legal basis.
- Run your account; send the emails you asked for / To provide the service you signed up for / Contract
- Publish Dispatches, run Campaigns, name Verdicts / To provide the service / Contract; our legitimate interest in running fair debates
- Check handles and Dispatches (including with AI), and handle reports and appeals / To keep debates safe and respectful / Our legitimate interest
- Record your positions on Campaigns / To measure how minds change / Your explicit consent
- Keep a record of moderation and account actions / To deal with complaints and legal claims / Our legitimate interest
- Keep logs and limit abuse / To keep the site secure / Our legitimate interest
- Answer your privacy requests and complaints / To meet our legal duties / Legal obligation
- Analytics (only if we add them) / To improve the service / Your consent
After the table: "Where our basis is legitimate interest, we have weighed our interests against your rights and you can object (see Your rights). We do not send marketing emails. The emails we send are about your account and the debates you follow, and each has a link to stop that kind of email."

H2 Your Dispatches are public
Dispatches, your handle and your AI-use declarations are shown on the website. [Choose after reading the site's robots/indexing settings and state the TRUTH: either "Search engines may list them." or "We ask search engines not to list them. We cannot stop other people copying what is public."] Think before you publish personal information about yourself or anyone else. If a Dispatch is about you, mentions you or has your personal data in it and you want it looked at, tell us (see Your rights).

H2 Automated checks and AI help
We use an AI service from Anthropic to help keep debates safe and to help you write better. There are three uses.
- Safety check. When you choose a handle or post a Dispatch, we send the text, with the Campaign's question and type, to Anthropic to check it against our community rules.
- Tone check (optional). If you press "Check my tone", we send your draft.
- Coach (optional). If you press "Get feedback", we send your draft. The coach asks questions. It never writes your text.
We send only the text and the Campaign's question and type. We do not send your name, email address or profile. We do send your text exactly as you wrote it, so anything in it, such as another person's name, goes too.
The AI can hold a Dispatch so that a person reads it first. It cannot delete or remove anything and it never decides alone. A person reviews every hold and every appeal. No decision with a legal or similarly significant effect on you is made by AI alone. If the AI is not available, an ordinary Dispatch may appear without a check and a person looks at it later. Dispatches on sensitive topics are held until a person has looked. You can ask a person to look again at any automated check.
For each check we keep a record of the decision and the reason so a moderator can review it. We keep coach feedback and your rating of it. We do not keep your draft. See "How long we keep it".
Anthropic processes this text for us under a data processing agreement. Its current terms say it deletes inputs and outputs within 30 days, may keep them longer only to enforce its usage policy or to meet the law, and does not use them to train its models without permission. [Owner: confirm against Anthropic's terms on the day you publish.]
The tone check and coach are optional. The safety check protects other Strategists, so we cannot switch it off for posting. If you object to it, contact us and we will consider it.

H2 Who we share it with
Companies that work for us (they may use your data only for us): Supabase (database and sign-in), Vercel (hosting), Anthropic (AI checks), Resend (email delivery) [and any others added]. Moderators and administrators of The Grand Strategist can see what they need to do their work. We may disclose data if the law requires it or to protect people from serious harm, and only where we have a proper legal basis. We do not sell your data.

H2 Sending data outside the UK
Our database is in London. Some of our providers are in, or process data in, the United States or elsewhere (Vercel, Anthropic, and Supabase's company). [Owner: for each, state the safeguard: the UK–US data bridge or the UK's standard contract terms (the IDTA or the UK Addendum). Resend processes in Ireland (EEA).] These safeguards give your data protection equal to UK law.

H2 How long we keep it
Table: Data / Kept for.
- Account and profile / Until you delete your account
- Sign-ups never confirmed by email / 30 days
- Dispatches / In the debate record. Shown without your name after you delete your account
- Positions on open Campaigns / Until the Campaign closes or you withdraw or delete your account
- Positions on closed Campaigns / Kept with no link to you
- Decisions about Dispatches and handles / 12 months
- Reports and moderation flags / 12 months after they are resolved
- Coach feedback and ratings / 90 days
- Queued and sent emails / 30 days
- Privacy requests and complaints / [six years]
- Safety and accountability record / [six years]
- Security logs at our providers / The short periods they set
NOTE FOR CC (do not render): only publish a period if the job in Part 6 deletes at that time. If a job is not built in this sprint, render that row as "Being set up: we will confirm the period before the pilot opens" and tell me.

H2 Deleting your account
See the "Delete my account" page for the full list. In short: your email, sign-in, profile and private records go. Your Dispatches stay in the debate record without your name. A safety and accountability record stays for [six years]. Until self-service deletion is switched on, email {{privacyEmail}} from the address on your account.

H2 Your rights
You can: see your data (Download my data); have wrong data corrected (edit your profile, or ask us); ask us to delete it; ask us to limit how we use it; object to us using it on the basis of our legitimate interest; withdraw a consent you gave (for example, stop recording your positions); take your data elsewhere; and ask a person to look again at any automated check. Use the "Contact us about your data" form or email {{privacyEmail}}. We will reply within one month. For complicated requests the law lets us take up to two more months, and we will tell you why. It is free. We may ask you to confirm who you are, and we normally reply to the email address on your account. We may refuse a request that is clearly unfounded or excessive, or where the law lets us keep the data, and we will say why.

H2 Complaints
Please tell us first. Use the form or email {{privacyEmail}}. We will acknowledge your complaint within 30 days (we aim for seven), look into it, and tell you the outcome without unnecessary delay. You can also complain to the Information Commissioner's Office at ico.org.uk or on 0303 123 1113, at any time.

H2 Keeping your data safe
We use encrypted connections, access controls and row-level security so people see only what they should. No system is perfectly secure. If a breach puts your rights at serious risk, we will tell you and the ICO as the law requires.

H2 Cookies and similar technologies
We use only what is needed to keep you signed in and keep the site secure. We do not use analytics or advertising cookies, and we will ask for your agreement first if that ever changes. [CC: audit the real cookie and local/session storage names set on a signed-in session and a signed-out session, and render them as a table: Name / What it does / How long. Do not guess names. If a third-party script sets anything, tell me.]

H2 Changes
If we change this page in a way that matters, we will tell you by email before it takes effect.

--- 4B. /terms  (src/app/terms/page.tsx) ---
Title: Terms of use. "Version {{termsVersion}}, in force from {{effectiveDate}}."

H2 About these terms
These terms are between you and {{companyName}} (company number {{companyNumber}}, registered office {{registeredOffice}}). By creating an account you agree to them. Please read them with our Privacy policy. The Grand Strategist is a pilot: it is invite-only, and features may change.

H2 Who can join
You must be 18 or over and have a valid invite. Your invite is personal: do not share your code. Give true information, keep one account, and keep your password and passkeys safe. Tell us at once if you think someone else is using your account.

H2 Community rules
Argue the point, not the person. You must not post: hate or abuse aimed at people because of who they are; harassment, threats or pile-ons; impersonation; content that encourages self-harm or suicide; anything unlawful, including defamatory statements, content that infringes someone's copyright, and other people's private information; spam, or anything that tries to manipulate a vote or a Verdict. Do not use the site to do anything the law forbids.

H2 Your Dispatches
You keep the rights in what you write. You give us a non-exclusive, worldwide, royalty-free licence to host, display, copy and format your Dispatches on The Grand Strategist, to include them in Verdicts and the debate record, and to have them checked, including by our AI provider as described in the Privacy policy. This licence lasts as long as the Dispatch is in the debate record, including after you delete your account (when it is shown without your name). You promise that you wrote it or have the right to post it, and that it does not break these terms or the law. Quote others briefly and say where it came from.

H2 Declaring AI use
Every Dispatch carries a declaration: none, assisted or generated. You must be honest. See "How we use AI" for what each means. A Dispatch declared "none" that looks like pasted AI text may be flagged for a person to look at. A flag is a prompt for a moderator to look, not a finding that you did anything wrong.

H2 Moderation, removal and appeals
We may hold, edit the visibility of, or remove a Dispatch or a handle that breaks these terms, and we may mute posting or close an account for serious or repeated breaches. We will tell you what we did and why, unless the law stops us. AI may hold a Dispatch for a person to read; it does not remove anything and does not decide alone. You can appeal a hold, removal or other decision from the notice we send you; a person decides appeals. We aim to answer promptly but cannot promise a time. You can also appeal a Verdict from its page.

H2 Reporting a Dispatch
Use the Report button on any Dispatch, or email {{contactEmail}}. For something you believe is unlawful, including defamatory, please tell us which Dispatch it is, what is wrong and why, and give your name and email. We will look at it quickly. We may remove the Dispatch, or may contact its author. If a person is identified in a defamation complaint we may share the complaint with the author where the law allows or requires it.

H2 Verdicts and judging
Verdicts blend a panel, peer votes, an AI rubric and the movement of positions. The weights and rubric are published before a Campaign opens. A person approves outcomes, and AI never decides alone. Titles and awards have no cash value. We make the final decision, subject to the appeal process.

H2 Opinion, not advice
Campaigns on money, health, law or similar subjects are opinion and debate, not professional advice. Do not rely on anything you read here to make a financial, medical or legal decision. Ask a qualified professional.

H2 Sensitive Campaigns
Some Campaigns have a content note and stricter moderation. The Grand Strategist is not a crisis or support service. If you are struggling, Samaritans are free on 116 123, at any time.

H2 Closing your account
You can close your account at any time. Until self-service deletion is switched on, email {{privacyEmail}} from the address on your account. What is removed and what stays is explained on the "Delete my account" page and in the Privacy policy. We may suspend or close your account if you break these terms.

H2 Our responsibility to you
Nothing in these terms limits liability that cannot be limited by law, including for death or personal injury caused by our negligence, or for fraud. The Grand Strategist is provided as it is during the pilot and we do not promise it will always be available or error-free. We are not responsible for what Strategists post, but we will act on reports as set out above. Otherwise, we are not liable for losses that were not reasonably foreseeable, or for loss of business or profit, and our total liability to you for any one matter is limited to £100 [Owner/solicitor: confirm this cap]. These limits do not affect your legal rights.

H2 Changes, law and contact
We may change these terms. For changes that matter we will email you at least 14 days before they take effect, and you can close your account instead of accepting them. These terms are governed by the law of England and Wales and the courts of England and Wales; if you live in Scotland or Northern Ireland you may use your local courts. Questions: {{contactEmail}}.

--- 4C. /ai-use  (src/app/ai-use/page.tsx), title "How we use AI" ---
Two parts, plain and short.
Part 1, "What the AI-use label means on a Dispatch". None: you wrote it without AI help. Assisted: you used AI for things like checking spelling, finding a source or testing an idea, and the argument and the words are yours. Generated: AI wrote all or most of the words. Every Dispatch must carry an honest label. We show it publicly so readers can judge. No AI detector is reliable, so a person always reads before anyone acts on a flag.
Part 2, "How we use AI behind the scenes": three short paragraphs that match the privacy policy's "Automated checks and AI help" (safety check, tone check, coach) and link to it. Say that AI holds, never deletes, never decides alone, that a person reviews every hold and appeal, and that the optional help is private, the draft is not kept, and only you see the result.

--- 4D. Delete-my-account pages (src/app/profile/delete/*, src/app/account-deleted/page.tsx, src/app/profile/page.tsx entry) ---
Replace the wording with the following. Keep the existing structure, the confirmation form logic, the messages in actions.ts, and the DRAFT-banner mechanism.
When deletion is OFF: "Self-service deletion is not switched on yet during this closed test. To delete your account now, use the 'Contact us about your data' form or email {{privacyEmail}} from the address on your account. We will delete it by hand and confirm within one month." Button: Back to your account.
When ON, three steps:
1. Download your data first. "Once your account is deleted we cannot give you a copy." [Download my data]
2. What happens. Removed for good: your email address and sign-in, including passkeys; your handle @{handle}, name, expertise and bio; your reactions, who and what you follow, and your email settings; your private tone-check and coach records; your positions on Campaigns that are still open; your consent records for positions. Stays, without your name: "Your {n} Dispatch{es}. You published them in public debates, and Verdicts and the record of each debate rely on them. After deletion they show as by 'a deleted Strategist' and are no longer linked to your name or email. If a Dispatch says something that identifies you, readers could still recognise you from it. To ask us to remove a particular Dispatch, use the 'Contact us about your data' form or email {{privacyEmail}} before you delete, and say which one. We will consider each request and reply within one month." / "Your positions on closed Campaigns, kept with no link to you, so we can measure how minds change." / "A safety and accountability record of actions on the site, such as moderation decisions and appeals. It uses a reference number, not your name. We keep it for [six years] to deal with complaints and legal claims, then delete it." [If branch sprint-4-audit-handle is NOT merged, add the sentence "In rare cases a moderator's note may mention your handle." If it IS merged, leave that sentence out.]
3. Confirm. "Type your handle, {handle}, to confirm." Password. Checkbox: "I understand that deleting my account is permanent, and that what is listed under 'Stays, without your name' remains." [Delete my account] [Keep my account]. Remove the "(DRAFT wording)" text from the checkbox label.
After deletion (/account-deleted): "We have removed your email address, sign-in, passkeys, handle and profile. Your {n} Dispatch{es} stay in the debates, shown as by 'a deleted Strategist'. We keep a record of safety and accountability actions for [six years], then delete it. To ask us about your data, use the 'Contact us about your data' form or email {{privacyEmail}}. If you are unhappy with how we handled it, you can complain to the Information Commissioner's Office at ico.org.uk." [Go to the home page]
Account page entry: heading "Deleting your account"; text "See exactly what is removed and what stays, then decide."; button "Delete my account". Also add a "Stop recording my positions" entry (Part 3) and a "Contact us about your data" link.
Check and fix for truth (report in the session log): (a) after deletion, what do Verdict pages, award lists, the Dossier and search show for this person? The wording above says Dispatches show as "a deleted Strategist". Everything else that named the person must also stop naming them. (b) Search the schema and code for any column or text that stores a copy of a handle or display name as plain text (verdict rationales, award records, notification payloads, email_outbox payloads, moderation notes, reports, ai_decisions output). anonymise_profile() must cover each one or you must tell me exactly which one it misses. Fix what is simple (add to anonymise_profile in a new migration with tests); report what is not.

--- 4E. Accessibility statement (new page /accessibility, link in footer) ---
Short. "We aim for The Grand Strategist to meet WCAG 2.2 level AA, and to work with a keyboard, a screen reader, large type and high contrast. We test with [tools used: list what the repo really runs, e.g. axe in Playwright; do not claim more]. Known problems: [list from the repo's accessibility tests or 'none recorded yet']. If something does not work for you, tell us at {{contactEmail}} and we will try to fix it or give you another way to take part." Do not claim compliance. Say "aim".

--- 4F. Compose-box AI note (src/components/dispatch/ai-help.tsx) ---
"Optional, private help from AI. If you use it, your draft is sent to our AI provider, Anthropic, to check it. We do not keep your draft, and only you see the result. [How we use AI]" (the link goes to /ai-use).

--- 4G. Outgoing emails ---
Audit every email template the app sends (src/lib/email*, email_outbox, the processor). Each must have: who it is from (The Grand Strategist), why the person received it, a working "stop these emails" link for that email type where the type is optional, and a footer with {{companyName}}, "Registered in England and Wales, company number X" and registered office. Security and account emails (confirmation, password reset) need no stop link but need the footer. Add tests.

======================================================================
PART 5. PRIVACY REQUESTS AND COMPLAINTS: FORM, RECORD, CLOCK, TOOLS
======================================================================
5A. Table (new migration) privacy_requests: id uuid, created_at, type (question | access | correction | deletion | restriction | objection | withdraw_consent | dispatch_removal | complaint), email text, user_id uuid null, message text, status (new | acknowledged | in_progress | closed), acknowledged_at, due_at (default created_at + 1 month), closed_at, outcome_note text. RLS on, deny all to anon and authenticated; only the service role (server action) writes; admins read and update through an admin-only function or the admin page. Index on status and due_at. Add RLS tests.
5B. Page /privacy/contact "Contact us about your data": the request type dropdown (the types above, in plain words), email (pre-filled and read-only when signed in), message, a hidden honeypot, and simple rate limiting (reuse what exists; if nothing exists, limit to 5 per email address per day in the database). On submit: save the row, send an acknowledgement email to the requester immediately ("We have your message. We will reply within one month. If it is a complaint, we will tell you the outcome without unnecessary delay.") and an alert email to {{privacyEmail}} through the existing email path (no new provider). Do not put the message body in server logs.
5C. Admin page /admin/privacy-requests: list by status with the due date highlighted when under 7 days or overdue; open a request, change status, add an outcome note. Every change writes an audit_log entry (id of the request only; no message text).
5D. A script scripts/delete-account.ts (npm run account:delete -- --email X [--confirm]) for deleting an account by hand while self-service deletion is off. It must reuse the SAME code path that self-service deletion uses (call the same functions; do not copy the logic). Default is a dry run that prints what would be removed and kept, with counts and no personal data beyond the email you passed. With --confirm it deletes, then prints the summary. It must refuse if the account does not exist. Add tests.
5E. docs/legal/RUNBOOK_PRIVACY_REQUESTS.md: step by step for me and a future helper: how to verify identity (reply to the account email; ask a question only the account holder would know if there is any doubt), what each type means and where to do it (access: Download my data plus the records listed in Part 7; correction; deletion: account:delete; removing one Dispatch: Admin → Moderation; objection and restriction: note and decide; withdraw consent: Stop recording my positions or the admin equivalent), the one-month clock, the 30-day acknowledgement duty for complaints, what to do if a request is refused (say why, and mention the ICO), and a template reply for each. Plain English.
5F. docs/legal/RUNBOOK_BREACH.md: if something goes wrong (leaked key, wrong RLS, lost device): contain; assess risk to people; record it; tell the ICO within 72 hours if there is a risk to people's rights (ico.org.uk/make-a-complaint/data-protection-complaints/... use the ICO's report-a-breach page, do not invent a URL); tell affected people without delay if the risk is high; rotate keys; list who to tell (Supabase, Vercel, Anthropic, Resend contacts) and what log to keep (docs/legal/BREACH_LOG.md, empty table).

======================================================================
PART 6. RETENTION JOBS (the approved periods)
======================================================================
Approved periods: AI decisions 12 months; coach feedback 90 days; queued and sent emails 30 days; reports and moderation flags 12 months after they are resolved; never-confirmed sign-ups 30 days; expired webauthn challenges 1 day; privacy requests six years after closed; audit record six years.
First inventory the real tables and columns for each and list them in the session log. Then write new migration(s) with SECURITY DEFINER functions, run by pg_cron (not Vercel cron), one per data type, each:
- deletes only rows past the period;
- NEVER deletes a record linked to an open flag, an open appeal or an open privacy request;
- returns the count and writes ONE audit_log entry per run with the count only (action 'retention.purged', no personal data);
- is callable only by the service role / postgres.
Never-confirmed sign-ups: delete the auth user (and cascade the profile) where email_confirmed_at is null and created_at is older than 30 days. Take great care: test that a confirmed user is never touched, and that an invite's reserved place is released. If cascade behaviour is not safe, stop and tell me.
Audit record (audit_log is append-only by design): add a single, deliberate, logged exception: a SECURITY DEFINER function purge_expired_audit_log() that sets a transaction-local flag the append-only trigger recognises, deletes rows older than six years, and records one summary row. Make sure no other path can use the flag. Test with rows given old created_at values; confirm that an ordinary delete or update still fails. The first real rows only expire in 2032, but the job must exist and be tested now.
Schedule all jobs daily at a quiet time, off the hour (for example 03:17 UK). Document each in docs/legal/RETENTION.md with: data, period, table, job name, schedule, and the exclusions. Keep the periods in the policy page identical to this file (add a Vitest check that compares them).

======================================================================
PART 7. ACCESS REQUESTS: MAKE "DOWNLOAD MY DATA" COMPLETE
======================================================================
Compare what src/app/profile/export returns with everything we hold about a person (the data map in Part 8). The export must include: account and profile data, the invite code used, consent records and versions, Dispatches with AI-use declarations, reactions, follows, positions (and consent), notification and email settings, passkey names and creation dates (not keys), reports they made and appeals they made, decisions about THEIR Dispatches and handles (decision, reason, date, model), coach feedback and ratings, and their privacy requests. It must NOT include other people's personal data (for example another person's report about them, or another reviewer's name). Where a record mentions another person, redact them. Add tests for each included type and for the exclusions. If something cannot be included safely, list it in the session log with the reason.

======================================================================
PART 8. INTERNAL LEGAL RECORDS (draft from the code, not from guesses)
======================================================================
Write these in docs/legal/. Base every factual statement on the code, migrations and settings; mark anything you cannot verify "[OWNER TO CONFIRM]". Keep each short, plain and usable. They are drafts for my solicitor.
1. DATA_MAP.md: a record of processing activities (UK GDPR Article 30). Table per data type: what, where stored (table), source, purpose, lawful basis, special category or not, who can see it, retention, which processor.
2. PROCESSORS.md: Supabase, Vercel, Anthropic, Resend: what they do for us, what data, where, the transfer safeguard to confirm, and an owner checklist: accept or sign each provider's data processing agreement in its dashboard; confirm the region; confirm Anthropic's retention terms on the day of publishing.
3. DPIA.md: a data protection impact assessment. Describe the processing (including AI and the private positions), necessity and proportionality, the risks to people (chilling effect of recorded positions, wrongful AI holds, re-identification from Dispatches, exposure of sensitive views, children gaining access, data breach), and the measures already built (RLS, hold-not-delete, human review, minimisation, no drafts stored, deletion, retention). End with a residual-risk statement and "approval: [OWNER] [date]".
4. LIA.md: a legitimate interests assessment (purpose, necessity, balancing) for: moderation (including AI), security logs, the safety and accountability record.
5. ONLINE_SAFETY.md: the owner's working record for the Online Safety Act 2023 (The Grand Strategist is a user-to-user service with UK users). Cover: (a) an illegal-content risk assessment in plain terms: the kinds of illegal content a debate site could host, how likely and how bad, and the controls (reporting, human review, holds, removal, appeal); (b) children's access: say plainly that access is limited by invite-only and by an 18+ rule, but that Ofcom's guidance treats a self-declared tick-box as weak age assurance, and mark "[OWNER AND SOLICITOR TO DECIDE before opening beyond named invitees]"; (c) the reporting and complaints routes and who handles them; (d) a note that the Terms say how illegal content is handled. Do not claim compliance.
6. COOKIES.md: the audited table from Part 4A and the rule "no non-essential cookie without prior consent".
Link all of them from docs/legal/README.md with one line each and an "owner action" column.

======================================================================
PART 9. ADOPT THE LAUNCH-PACK DECISIONS
======================================================================
The owner has accepted all the recommendations. Record this in docs/OWNER_DECISIONS.md (add a "Decision taken, 7 November 2026" column or section; keep the facts as they are).
Decisions to implement or confirm:
1. AI unavailable: keep defaults (normal Campaigns post unscreened; sensitive Campaigns held). No change.
2. Undeclared-AI flag: keep as a soft flag, never a hold, never shown to the author. Add to OWNER_DECISIONS a review trigger: after the first 50 flags, if more than half are wrong, turn it off.
3. Coach model: Sonnet for the first two weeks, never suggests wording. Note the switch rule (Haiku in Settings if spend passes the limit, or if Haiku scores within 0.3 of Sonnet on eval:coach). No change.
4. Cost caps: change the global daily cap from 3,000 to 1,000 for the first fortnight. New migration: update the community_settings row AND the column default to 1000, and write one audit_log entry ('settings.changed', ai_daily_cap_global, from 3000 to 1000, actor system). Keep 40 per Strategist, coach 3 per draft and 10 per day, evaluation budget £5. In OWNER_DECISIONS add "raise to 3,000 in Admin → Settings after two weeks if usage needs it". (The £25 monthly limit on the Anthropic key is mine to set in the Anthropic console.)
5. Privacy wording: implemented in Part 4 (solicitor sign-off still a gate before any real invitee).
6. Retention: implemented in Part 6.
7. Appeals with one admin: no change. Add: a second reviewer is required before the first sensitive Campaign (I will give them the role with npm run admin:set).
8. Account deletion: keep OFF. Keep positions on closed Campaigns unlinked. Deletion by email/form until the solicitor signs off and the sign-up boxes (Part 2) have been live.
9. Handle screening scope: handles only. Add display names and bios once eval:moderation --real shows 10% or fewer false holds (settings screen_display_names and screen_bios stay off).
Topic decisions (supabase/data/launch-topics.json, src/lib/launch-topics.ts, hosted DRAFT Campaigns):
a) Bank of England: change the title to "Should the Bank of England keep interest rates high until inflation is firmly back at 2%, even if that slows growth?" Open arena, finance category, "opinion, not advice" on. Public summary template, kept as the placeholder until the day it opens: "As of [opening date], Bank Rate is [x]% and CPI inflation is [y]%. The Bank's target is 2%. [One sentence on the latest decision and vote.]" Brief (hidden): For: stable prices protect savers and wages over time, and cutting too early risks inflation returning. Against: high rates hurt mortgage holders and businesses now, and a weak economy can bring inflation down by itself. Remove the date from the title and from any text that goes stale. Clear needs_owner_decision on this Campaign (I approve the new title).
b) Rosebank: reword the title to "Should the UK approve new North Sea oil and gas projects such as Rosebank?" Keep it in wave 4 and keep needs_owner_decision set. Put in the admin notes: "Open only when ALL are true: (1) eval:moderation --real met its targets; (2) at least two wave-1 Campaigns have finished with every hold and appeal answered within 48 hours; (3) a second reviewer is in place."
c) Assisted dying: replace the placeholder content note with this text and keep needs_owner_decision set, wave 4, Oxford format, three rounds, sensitive flag on: "This Campaign is about assisted dying, death and terminal illness. Some Strategists will have lived through bereavement, serious illness or suicide. Argue the position, not the person. A Dispatch that encourages self-harm or suicide, or that attacks people for their illness, disability or choices, will be held for a person to read and may be removed. If this topic affects you, support is available: Samaritans 116 123 (free, any time); Cruse Bereavement Support 0808 808 1677; Marie Curie Support Line 0800 090 2309." Admin note: "Check each phone number on the day it opens. Open only after the three Rosebank conditions, with the second reviewer on call for the first 48 hours." Do not open this Campaign or change its schedule.
d) Wave 1 (under-16 social media ban; in-person exams vs AI cheating (Oxford); lifelong learning loans at 60): add a --concurrent option to npm run topics:load so all wave-1 Campaigns share one start and end (7 days). Keep the existing behaviour as the default. Add tests.
For (a) to (c): first check whether topics:load updates existing hosted rows or only inserts. Update the hosted DRAFT Campaigns through a one-off script written for this (dry run by default, --confirm to write), which touches ONLY Campaigns still in draft status and matched by slug, and prints a diff. Do not run it with --confirm; give me the dry-run output and stop. Do not touch any Campaign that is not a draft.
Also regenerate docs/DRAFT_WORDING.md into docs/LEGAL_WORDING.md that lists every page's final text status (draft complete, awaiting facts, awaiting solicitor) and the bracketed facts still needed.

======================================================================
PART 10. TESTS AND REPORT
======================================================================
Vitest: LEGAL gate, retention functions (with faked dates, exclusions, audit exception only through the function), policy-versus-retention comparison, export completeness and exclusions, delete-account script (dry run and confirm), consent trigger. Playwright: sign-up requires all three boxes and shows each error; the first-position notice; the privacy contact form end to end (use the fake email path); both deletion states; legal pages render at 375px with no horizontal scroll; footer shows the company block. RLS tests for every new table and column. Run typecheck, lint, all tests, and the existing evals that need no key.
Final report must list: (1) every bracketed fact I still owe you, as a numbered list; (2) answers to the inspection questions in Parts 3, 4D (a)(b) and 6; (3) migrations written and NOT applied, with filenames; (4) anything you did not finish and why; (5) any place where the wording I gave is untrue to the code, and what you changed.
