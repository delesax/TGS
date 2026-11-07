# Cookies and browser storage

**Rule: no non-essential cookie without prior consent.** Today the site sets only what it needs to work, so no
consent banner is needed. If analytics or anything else non-essential is ever added, ask for consent first,
update the privacy policy, and add a row here.

Audited on 7 November 2026 by a Playwright run against a production build (`tests/e2e/legal.spec.ts` and
`tests/e2e/sign-up.spec.ts`; they fail if an unexpected cookie appears). The names use the local project code
(`127`); on the live site the middle of each name is the Supabase project reference.

| Where | Name | What it does | How long | Notes |
| --- | --- | --- | --- | --- |
| Cookie, signed in | `sb-<project>-auth-token` (sometimes split as `.0` and `.1`) | Keeps the person signed in | 400 days at most (the browser maximum) or until sign-out | Not `HttpOnly` (the sign-in library reads it in the browser). `SameSite=Lax` |
| Cookie, at sign-up | `sb-<project>-auth-token-code-verifier`, `…-flows-code-verifier`, `…-flow-<hash>-code-verifier` | Protects the email-confirmation step | 400 days at most | Random code, nothing personal. They are not cleared when the step ends (see below) |
| Session storage | `tgs-draft:<campaign>:<form>` | Keeps an unsent Dispatch if the page is refreshed | Until the tab closes | Never sent to us |
| Session storage | `tgs-content-note:<campaign>` | Remembers a content note was seen | Until the tab closes | |
| Local storage | `tgs-install-dismissed` | Remembers the "add to home screen" hint was closed | Until browser data is cleared | |
| Cache Storage | `tgs-shell-v1` | Offline page and static files for the installed app | Until the app updates | Only files that are the same for everyone |

Signed out and browsing, the audit found **no cookies and no storage**, and **no request to any other host**
(no third-party script).

**Things to know**

- 400-day lifetimes are the library defaults. The code-verifier cookies in particular could be shorter and could
  be removed when the confirmation step finishes. That is a small code change **[OWNER TO DECIDE]**.
- The privacy policy table lists exactly these items. If you change the table, change both.
