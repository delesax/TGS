# Legal wording: where every page stands

Regenerated on 7 November 2026 from `docs/DRAFT_WORDING.md` (the Sprint 4 placeholders), after the legal hardening sprint. The wording on each page is the wording in `docs/LEGAL_HARDENING_BRIEF.md`, applied as written; where the brief's wording was not true to the code, the change is listed in `docs/SESSION_LOG_LEGAL_HARDENING.md` under "Wording that was untrue to the code".

**Status words**

- **Draft complete**: all the text is written. The page still shows the DRAFT banner while `LEGAL.reviewed` is false in `src/lib/legal.ts`.
- **Awaiting facts**: the page shows `[to be added]` or a highlighted bracket until you supply the fact.
- **Awaiting solicitor**: a person with legal training must read it before any real invitee sees it.

Every legal page is "draft complete", "awaiting facts" **and** "awaiting solicitor". The test `src/lib/legal.test.ts` stops `LEGAL.reviewed` being switched to true while any fact is missing or any page still shows a placeholder.

| Page | File | Status | Facts it is waiting for |
| --- | --- | --- | --- |
| Privacy policy `/privacy` | `src/app/privacy/page.tsx` | Draft complete; awaiting facts; awaiting solicitor | Company number, registered office, ICO number, privacy mailbox, effective date; Anthropic terms confirmation (on the day you publish); the transfer safeguard for each provider; any other processors; the two "six years" periods; cookie names and lifetimes re-checked on launch day |
| Terms of use `/terms` | `src/app/terms/page.tsx` | Draft complete; awaiting facts; awaiting solicitor | Company number, registered office, contact mailbox, effective date; the £100 liability cap |
| How we use AI `/ai-use` | `src/app/ai-use/page.tsx` | Draft complete; awaiting solicitor | None of its own (it links to the privacy policy) |
| Accessibility `/accessibility` | `src/app/accessibility/page.tsx` | Draft complete; awaiting facts; awaiting solicitor | Contact mailbox. The testing statement and "known problems: none recorded yet" are written from what the repository really runs |
| Contact us about your data `/privacy/contact` | `src/app/privacy/contact/*` | Draft complete; awaiting facts | Privacy mailbox (the alert email to it is not sent until it is set) |
| Delete my account `/profile/delete` (off and on) | `src/app/profile/delete/delete-content.tsx` | Draft complete; awaiting facts; awaiting solicitor | Privacy mailbox; the "six years" period. One sentence ("In rare cases a moderator's note may mention your handle.") is shown because branch `sprint-4-audit-handle` is not merged: set `AUDIT_NOTE_MAY_MENTION_HANDLE` to `false` once it is |
| Account deleted `/account-deleted` | same file | Draft complete; awaiting facts; awaiting solicitor | Privacy mailbox; the "six years" period |
| Footer (every page) | `src/components/site-footer.tsx` | Draft complete; awaiting facts | Company number, registered office, contact mailbox |
| Sign-up boxes `/signup` | `src/app/(auth)/signup/sign-up-form.tsx` | Final wording (as the brief gave it) | None. Awaiting solicitor with the pages they link to |
| First-position notice and box | `src/app/campaigns/[slug]/position-form.tsx` | Final wording (as the brief gave it) | None. Awaiting solicitor |
| Compose-box AI note | `src/components/dispatch/ai-help.tsx` | Final wording | None |
| Our own emails (footer, "why you got this") | `src/lib/email/templates.ts` | Draft complete; awaiting facts | Company number, registered office (they come from `src/lib/legal.ts`) |
| Supabase sign-up and password-reset emails | Supabase dashboard (`docs/legal/AUTH_EMAIL_FOOTER.md`) | **Not done by the code: you paste the footer** | Company number, registered office |

## Every bracketed fact still needed

1. Company number (`LEGAL.companyNumber`)
2. Registered office (`LEGAL.registeredOffice`)
3. ICO registration number (`LEGAL.icoNumber`)
4. Privacy mailbox (`LEGAL.privacyEmail`)
5. Contact mailbox (`LEGAL.contactEmail`)
6. Effective date of the policy and terms (`LEGAL.effectiveDate`)
7. Anthropic's current retention terms, checked on the day you publish (privacy policy, Automated checks and AI help)
8. For each provider outside the UK (Vercel, Anthropic, Supabase's company), the transfer safeguard: UK–US data bridge or IDTA / UK Addendum; and confirmation that Resend processes in Ireland (privacy policy, Sending data outside the UK)
9. Any further processors added (privacy policy, Who we share it with)
10. The six-year period for privacy requests and complaints (privacy policy, How long we keep it)
11. The six-year period for the safety and accountability record (privacy policy, Deleting your account; delete pages; account deleted page)
12. The £100 liability cap (terms, Our responsibility to you)
13. Cookie names and lifetimes, re-checked on launch day (privacy policy, Cookies)
14. Then flip `LEGAL.reviewed` to true (after the solicitor), which removes the DRAFT banners.

The internal records in `docs/legal/` carry their own **[OWNER TO CONFIRM]** items: see `docs/legal/README.md` for the owner action on each.
