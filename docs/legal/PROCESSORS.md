# Processors

Draft for the solicitor, from the code and docs as at 7 November 2026. Facts about the providers' own terms
are **[OWNER TO CONFIRM]**: they change, and only the provider's current documents are authoritative.

| Provider | What it does for us | What data it sees | Where | Transfer safeguard to confirm |
| --- | --- | --- | --- | --- |
| **Supabase** | Postgres database, sign-in (Auth), the sign-up and password-reset emails, scheduled jobs (pg_cron) | Everything we store (see `DATA_MAP.md`) | Project in London (`jsbgactqutgoacogsoct`) **[OWNER TO CONFIRM region in the dashboard]**; Supabase's company is in the US | UK–US data bridge or IDTA / UK Addendum **[OWNER TO CONFIRM]** |
| **Vercel** | Hosts the website and server code | Every request: IP address, pages visited, cookies; page content passes through | Vercel regions **[OWNER TO CONFIRM project region]**; US company | UK–US data bridge or IDTA / UK Addendum **[OWNER TO CONFIRM]** |
| **Anthropic** | AI safety check of handles and Dispatches; optional tone check and coach | The text of a handle or Dispatch, the Campaign question and type; the draft for tone check and coach. Not name, email or profile | United States **[OWNER TO CONFIRM]** | UK–US data bridge or IDTA / UK Addendum **[OWNER TO CONFIRM]** |
| **Resend** | Delivers our emails (replies, Campaign updates, moderation notices, acknowledgements) | Recipient address, subject, body | Ireland (EEA) per the owner **[OWNER TO CONFIRM]** | UK adequacy regulations for the EEA **[OWNER TO CONFIRM]** |

Not used: analytics, advertising or error-reporting services (none is in `package.json`). CLAUDE.md names
Sentry, PostHog and Inngest for later; if any is added, it must be added here, to the privacy policy, and (for
analytics) behind consent.

## Owner checklist

- [ ] **Supabase:** accept or sign the Data Processing Addendum in the dashboard; confirm the project region is London.
- [ ] **Vercel:** accept or sign the DPA in the dashboard; confirm the function region.
- [ ] **Anthropic:** accept or sign the DPA in the Anthropic console; check the retention terms that apply to the API key **on the day you publish the privacy policy** (the policy says 30 days, no training without permission, longer only to enforce usage policy or for the law).
- [ ] **Resend:** accept or sign the DPA in the dashboard; confirm the sending region and the verified sending domain.
- [ ] For each provider outside the UK, write the safeguard (bridge or contract terms) into the privacy policy (the "Sending data outside the UK" section), replacing the owner note there.
- [ ] Set the **£25 monthly limit** on the Anthropic key in the Anthropic console (launch decision 4).
- [ ] Keep copies of the signed DPAs somewhere you can find them (for example a folder you control).
