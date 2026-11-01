# Sprint 1 demo: click-through

There are two ways to try it. **A. Local** works now, with no setup on the hosted project. **B. Hosted** needs steps 0 to 2 first.

---

## A. Try it locally (recommended first)

Needs Docker Desktop running.

```bash
npx supabase start          # local database, auth and test inbox (first run downloads images)
npm run dev                 # http://localhost:3000
```

`npm run dev` reads `.env.local`, which points at the **hosted** project. To use the local one instead, run:

```bash
npm run test:env && set -a && . ./.env.test.local && set +a && npx next dev --port 3100
```

Then open http://localhost:3100. Sign-up emails arrive in the local test inbox at http://127.0.0.1:54324. The local invite code is **LOCAL-DEV-INVITE** (reusable).

---

## B. Hosted project setup (once)

**0. Fix `DATABASE_URL` so migrations can be pushed.**
Supabase dashboard → your TGS project → **Connect** → **Session pooler** → copy the URI and put your database password in it. Replace the `DATABASE_URL=` line in `.env.local` with it. Do not paste it into chat. Then tell me and I will run the dry run again, show you the result and wait for your OK before the real push. Or run it yourself (call the CLI directly, not through `npx`: npx prints the full command, password included):

```bash
set -a && . ./.env.local && set +a && ./node_modules/.bin/supabase db push --dry-run --db-url "$DATABASE_URL"
```

**1. Auth settings.** Dashboard → Authentication → URL Configuration:
- Site URL: `http://localhost:3000` for now (your Vercel URL later)
- Redirect URLs: add `http://localhost:3000/**` and your Vercel URL followed by `/**`

Then Authentication → Providers → Email (or Sign In / Up): set the minimum password length to **10** and keep "Confirm email" **on**.

Optional, so the email link works when opened on a different device: Authentication → Emails → "Confirm signup" template, change the link to
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`

**2. Create invite codes** (writes to whichever project `.env.local` points at; the script prints the host first):

```bash
npm run invite:create -- --count 3
```

```bash
npm run invite:create -- --uses 30 --note "Pilot class" --days 30
```

Each code comes with a sign-up link such as `http://localhost:3000/signup?code=TGS-XXXX-XXXX-XXXX`.

To make yourself an admin (not needed this sprint):

```bash
npm run admin:set -- --email you@example.com
```

---

## Click-through (either setup)

1. **Home** (`/`): the headline and the two buttons "I have an invite code" and "Sign in". Make the window narrow (phone width): nothing scrolls sideways.
2. Click **I have an invite code**.
3. Enter a wrong code such as `TGS-WRNG-WRNG-WRNG`, plus your email and a 10+ character password, and tick both boxes. Click **Create account**.
   - Expect: a red message "Your invite code was not accepted" that **stays until you dismiss it**, a plain explanation under the code field, and **your email still filled in**.
4. Put in the real invite code and click **Create account**. Expect the **Check your email** page.
5. Open the email (locally: http://127.0.0.1:54324) and click the link. You land on **Choose your handle**.
6. Type `Admin` and click **Save my handle**. Expect: "This name could be mistaken for an official or staff account". Try `Adm1n` or `hitler_fan` too.
7. Type a normal handle, such as `Jane_Smith`. Expect: **Your Dossier** with "Welcome, @Jane_Smith" and empty sections for Titles, Awards and Dispatches, each saying what to do next.
8. Click **Account** in the header. Edit your name, area of expertise or bio and click **Save profile**. Expect a green "saved" message.
9. On the same page click **Add a passkey on this device**, and approve with Touch ID or your device PIN. The passkey appears in the list.
10. Click **Back to home**. Expect "Welcome back, @Jane_Smith".
11. Click **Sign out**, then **Sign in** → **Sign in with a passkey**. You are back in your Dossier without typing a password.
12. Sign out and sign in with email and a **wrong password**. Expect a message that stays on screen and says what to do next.
13. Footer: **Privacy policy**, **Terms of use** and **How we use AI** each show a yellow **DRAFT** banner.
14. Click **Campaigns**. Expect "No Campaigns are open yet" with a way back home.

## Running the tests

```bash
npx supabase start
```

```bash
npm run test:env
```

```bash
npm test
```

`npm test` runs the unit tests, the RLS tests and Playwright. The tests refuse to run unless `.env.test.local` points at **local** Supabase, so they never touch the hosted project.
