# Data protection impact assessment (DPIA)

Draft for the solicitor, 7 November 2026, written from the code. It covers the processing that is likely to
be high risk: **private Campaign positions** (political opinion), **AI checking of what people write**, and
**a public debate site with a closed pilot**. Anything not checked is **[OWNER TO CONFIRM]**.

## 1. The processing

- **What:** accounts (email, handle, profile); Dispatches that people publish; optional private positions on
  Campaigns; AI safety checks of handles and Dispatches; optional AI tone check and coach; moderation records;
  privacy requests; emails. Full list: `DATA_MAP.md`.
- **Who:** up to about 100 invited adults (a pilot class and retired professionals), UK audience. Invite-only,
  18 or over.
- **How:** Next.js on Vercel, Supabase (London), Anthropic API for AI, Resend for email (`PROCESSORS.md`).
- **Special category data:** a position on a public issue can show political opinion. It is recorded only with
  explicit consent, held privately, and used only to measure how minds change. Dispatch text is published by the
  person, who chooses what to say.
- **AI:** the AI can hold a Dispatch for a person to read. It cannot delete or remove anything and never decides
  alone. A person reviews every hold and every appeal. No decision with a legal or similarly significant effect
  is made by AI alone (Art. 22 not engaged). Optional tone check and coach are on request only.

## 2. Necessity and proportionality

- **Purpose:** a safe, fair debate; measure whether arguments change minds (the product's point); keep an
  accountable record.
- **Minimisation:** AI gets only the text and the Campaign question and type, never name, email or profile.
  Drafts are not stored. Positions are optional and the site works without them. The public side of an
  Oxford-style Dispatch is chosen when posting and is not copied from the private position.
- **Lawful basis:** see `DATA_MAP.md`. Positions: explicit consent, withdrawable at any time with effect.
- **Transparency:** privacy policy (plain words), notice at the point of recording a position, AI note next to
  the coach, sign-up acknowledgement that Dispatches are public and stay without a name after deletion.
- **Individual rights:** Download my data (complete, with exclusions); correction in the profile; contact form
  with a one-month clock; deletion by hand now (self-service built, off); withdrawal of position consent.
- **Retention:** automatic jobs (`RETENTION.md`).

## 3. Risks to people, and what reduces them

| Risk | Likelihood / severity (before) | Measures already built | Residual |
| --- | --- | --- | --- |
| **Chilling effect of recorded positions**: people stay quiet or distort their view because a position is on record | Medium / medium | Positions optional; consent notice; clearing and "Stop recording my positions"; private by RLS; only anonymous totals published; posting does not need a position | Low |
| **Wrongful AI holds** (a legitimate Dispatch held or a person wrongly flagged) | Medium / medium | Hold, never delete; human review of every hold; appeal to a person; reasons stored; admin override; sensitive Campaigns held by default only when AI unavailable; undeclared-AI flag is a soft flag, never a hold, never shown (review trigger after 50 flags) | Low to medium. Needs the second reviewer before the first sensitive Campaign |
| **Re-identification from Dispatches** after deletion (style, content) | Medium / medium | Shown as "a deleted Strategist"; handle scrubbed from text copies; the delete page says plainly that a Dispatch that identifies you can still identify you; removal request route before deletion | Medium: cannot be removed entirely. Disclosed to the person |
| **Exposure of sensitive views** (a leak or a mistake in access rules) | Low / high | RLS on every table with tests; consent and position columns not readable from the browser; export excludes other people's data; audit of admin opens of privacy requests | Low |
| **Children gaining access** | Low / high | Invite-only; 18+ confirmation at sign-up; invite is personal | **Medium**: a tick-box is weak age assurance. See `ONLINE_SAFETY.md` **[OWNER AND SOLICITOR TO DECIDE before opening beyond named invitees]** |
| **Data breach** (leaked key, wrong RLS, lost device) | Low / high | Secrets only in environment variables; service role used on the server only; RLS tests; `RUNBOOK_BREACH.md`; retention limits what exists to leak | Low to medium |
| **AI provider misuse or retention** | Low / medium | Data processing agreement (to sign); no name or profile sent; no drafts stored; provider terms checked on publishing day | Low **[OWNER TO CONFIRM DPA signed]** |
| **Late or missed rights requests** | Medium / medium | Form with due date; admin queue highlights under 7 days and overdue; runbook | Low |
| **Records kept too long** | Medium / low | Retention jobs, tested; audit exception for six-year expiry | Low. Gaps: appeals, AI usage counters (`RETENTION.md`) |

## 4. Consultation

Solicitor review **[OWNER TO CONFIRM: pending]**. The ICO need not be consulted unless a high residual risk
remains after measures: none is judged to, apart from age assurance, which is a decision for the owner before
the pilot widens.

## 5. Residual risk statement

With the measures above, the residual risk to individuals is **low to medium**. The two items that keep it from
"low" are (a) re-identification of a person from Dispatches they chose to publish, which cannot be fully
removed and is disclosed, and (b) age assurance by self-declaration, which is acceptable only while access is
limited to named invitees.

**Review:** before opening beyond the pilot, after any change to what is sent to the AI, and at least yearly.

**Approval: [OWNER] [date]**
