# Runbook: if something goes wrong (personal data breach)

A personal data breach is any security incident that lets personal data be lost, changed, shown or reached by
someone who should not have it. Examples: a leaked key, an RLS (row-level security) mistake, a lost or stolen
device with a signed-in session, an email sent to the wrong people, a provider incident.

**The clock:** if the breach is likely to put people's rights and freedoms at risk, tell the ICO **within 72
hours of becoming aware**. If the risk to people is **high**, also tell the affected people **without undue
delay**. Write down every breach, even ones you do not report.

## 1. Contain (first hour)

- **Stop the leak.** Switch the thing off or limit it: revoke the key, turn off the feature, put the site
  behind maintenance, remove the faulty policy.
- **Rotate secrets that may be exposed.** Supabase service-role key and database password; the Anthropic key;
  the Resend key; `EMAIL_PROCESSOR_SECRET` and `MODERATION_PROCESSOR_SECRET`; Vercel tokens. Update the new
  values in Vercel and Supabase settings, then redeploy. Never paste a secret into chat or commit it.
- **Sign people out** if sessions may be stolen (Supabase → Authentication).
- **Keep the evidence.** Do not delete logs. Note times.

## 2. Assess the risk to people

Ask: what data, whose, how many; could it identify them; is any of it **special category** (a private Campaign
position shows political opinion) or a password; could it lead to harm (embarrassment, discrimination, fraud,
threats); was it encrypted or already public; has anyone actually accessed it. Decide: **no risk**, **risk**
(tell the ICO) or **high risk** (tell the ICO and the people).

## 3. Record it

Add a line to `docs/legal/BREACH_LOG.md` (date found, what happened, data and people affected, risk decision
and why, who you told and when, what you changed). Do this even if you decide not to report.

## 4. Tell the ICO (if there is a risk to people)

Use the ICO's **"Report a breach"** page on ico.org.uk (find it from the ICO website; do not use a link from an
email) or call the ICO helpline on **0303 123 1113**. Have ready: what happened, when you found out, the data and
number of people, the likely effects, what you have done, and a contact. If you do not have every detail within
72 hours, report what you know and say more will follow.

## 5. Tell the affected people (if the risk is high)

Plain words, without delay, from an email that cannot itself be spoofed easily: what happened, what data, what
it may mean for them, what you have done, what they should do (for example change a password), and how to
contact you. Offer the privacy mailbox. Do not blame them.

## 6. Who to tell and what to ask

| Provider | Tell them when | Where |
| --- | --- | --- |
| **Supabase** | Database, auth or key exposure; suspected provider incident | Supabase dashboard support / status page **[OWNER TO ADD contact]** |
| **Vercel** | Hosting, deployment or token exposure | Vercel dashboard support **[OWNER TO ADD contact]** |
| **Anthropic** | API key exposure; unexpected use or charges | Anthropic console support **[OWNER TO ADD contact]** |
| **Resend** | API key exposure; email sent to the wrong people | Resend dashboard support **[OWNER TO ADD contact]** |
| Your solicitor | Any reportable breach | **[OWNER TO ADD]** |
| Insurer (if any) | As the policy requires | **[OWNER TO ADD]** |

## 7. Afterwards

Find the cause, fix it, add a test so it cannot return (RLS tests are in `tests/rls`), update `DPIA.md` if the
risk picture changed, and note lessons in the breach log.
