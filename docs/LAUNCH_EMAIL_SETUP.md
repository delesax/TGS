# Launch readiness: email (owner steps)

Plain-English steps for the owner. Nothing here needs a developer, and nothing here is run by the code. Do the steps in order. Never paste a key or secret into a chat, an email or a document: paste it only into the Resend, Supabase or Vercel page named in the step.

Until these steps are done, TGS still works: emails wait safely in the queue (`email_outbox`) and are sent once everything is in place. Supabase sign-up emails keep using Supabase's built-in sender, which only sends a few emails an hour.

You will need: access to the domain's DNS settings (wherever `thegrandstrategist.com` is registered), the Supabase dashboard, and the Vercel dashboard. Resend's free plan is enough for the pilot.

## Part 1. Resend: create the account and verify the domain

1. Go to resend.com and create an account with the company email address.
2. In Resend, open **Domains** and choose **Add domain**. Enter `thegrandstrategist.com`. Choose the region closest to the UK (for example Ireland, `eu-west-1`), if offered.
3. Resend shows several DNS records (usually one MX, two or three TXT records for SPF and DKIM, and an optional DMARC record). Keep that page open.
4. In a second tab, open the DNS settings at your domain registrar. Add each record exactly as Resend shows it: the type, the name (host) and the value. If the registrar adds the domain name automatically, enter only the part before `.thegrandstrategist.com` as the name.
5. Add a DMARC record if you do not already have one: type TXT, name `_dmarc`, value `v=DMARC1; p=none; rua=mailto:YOUR-ADDRESS@thegrandstrategist.com` (use a mailbox you read).
6. Back in Resend, press **Verify DNS records**. It can take from a few minutes to a few hours. Wait until every record shows **Verified**.
7. In Resend, open **API Keys**, choose **Create API key**, name it `TGS production`, give it **Sending access** only, and limit it to `thegrandstrategist.com`. Copy the key now: Resend shows it once. Keep it somewhere safe until Part 3.

## Part 2. Supabase Auth: send sign-up emails through Resend

8. Open the Supabase dashboard, then the TGS project.
9. Go to **Authentication → Emails → SMTP Settings** (sometimes under **Project Settings → Authentication**). Turn on **Enable custom SMTP**.
10. Fill in:
    - Sender email: `notifications@thegrandstrategist.com` (or another address on the verified domain)
    - Sender name: `The Grand Strategist`
    - Host: `smtp.resend.com`
    - Port: `465`
    - Username: `resend`
    - Password: the Resend API key from step 7
11. Save. Then go to **Authentication → Rate Limits** and raise **Emails sent per hour** to a level that suits the pilot (for example 100).
12. Go to **Authentication → URL Configuration**. Set **Site URL** to `https://thegrandstrategist.com` and add `https://thegrandstrategist.com/**` to **Redirect URLs** (keep the existing Vercel address too).

12a. Go to **Authentication → Emails → Templates** and open **Confirm sign up**. Set the subject to `Confirm your email address for The Grand Strategist`. Replace the whole message body with the text below, exactly as written, then press **Save**:

    ```html
    <h2>Confirm your email address</h2>
    <p>Welcome to The Grand Strategist. Press the link below to confirm your email address and choose your handle.</p>
    <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding">Confirm my email address</a></p>
    <p>If you did not sign up, you can ignore this email.</p>
    ```

    **Why this matters:** Supabase's built-in template sends the person through Supabase first and then hands the app a one-time code that only works in the same browser they signed up in. Open the email on a phone's mail app or a different browser and the app says "That confirmation link did not work", even though Supabase has already confirmed the address and used up the invite place. This template sends the app a link that works on any device. The app already understands it (`/auth/confirm` reads `token_hash` and `type`). It builds the link from the **Site URL** in step 12, so do step 12 first; with the wrong Site URL the link points at the wrong website.

## Part 3. Vercel: the app's email settings

13. Open the Vercel dashboard, then the TGS project, then **Settings → Environment Variables**.
14. Add these three variables for **Production** (and Preview, if you test there):
    - `RESEND_API_KEY`: the Resend API key from step 7.
    - `EMAIL_FROM`: `The Grand Strategist <notifications@thegrandstrategist.com>`
    - `EMAIL_PROCESSOR_SECRET`: a long random string you make up (at least 40 letters and numbers; a password manager can generate one). Keep a copy for step 17.
15. While you are here, also add `MODERATION_PROCESSOR_SECRET`, another long random string (different from the email one), for the Sprint 4 moderation sweeper. Keep a copy for step 18.

## Part 4. A custom domain in Vercel (needed for the email processor)

The project is behind Vercel's login, so the database cannot reach the email processor at the `*.vercel.app` address. A custom domain fixes this.

16. In Vercel, open **Settings → Domains** and add `thegrandstrategist.com` (and `www.thegrandstrategist.com`, set to redirect to the main one). Vercel shows the DNS records to add at your registrar. Add them and wait until Vercel shows **Valid configuration**. Then, under **Settings → Deployment Protection**, make sure protection does not apply to the production custom domain (Vercel's "Standard Protection" protects preview addresses only; check the setting rather than assume). Add `thegrandstrategist.co.uk` too and set it to redirect.

## Part 5. Supabase Vault: tell the database where to call

17. In the Supabase dashboard, open **SQL Editor**, paste the two lines below, replace the placeholders, and press **Run**. The second value must be exactly the `EMAIL_PROCESSOR_SECRET` from step 14.

    ```sql
    select vault.create_secret('https://thegrandstrategist.com/api/email/process', 'email_processor_url');
    select vault.create_secret('PASTE-THE-EMAIL-PROCESSOR-SECRET-HERE', 'email_processor_secret');
    ```

18. Do the same for the moderation sweeper, with the `MODERATION_PROCESSOR_SECRET` from step 15:

    ```sql
    select vault.create_secret('https://thegrandstrategist.com/api/moderation/sweep', 'moderation_processor_url');
    select vault.create_secret('PASTE-THE-MODERATION-PROCESSOR-SECRET-HERE', 'moderation_processor_secret');
    ```

    If a secret with that name already exists, Supabase says so. In that case open **Project Settings → Vault**, find it, and edit its value instead.

19. In Vercel, open **Deployments** and **Redeploy** the latest production deployment, so the app picks up the new variables.

## Part 6. Test checklist

Tick each one. If one fails, the email waits in the queue; nothing is lost.

- [ ] Resend shows the domain as **Verified**.
- [ ] Sign up with a new invite on the live site: the confirmation email arrives within a minute, from `notifications@thegrandstrategist.com`, and is not in spam.
- [ ] The link in that email opens the live site (not localhost) and lets you choose a handle.
- [ ] Open that link on a different device or browser from the one you signed up in (for example sign up on a computer, open the email on a phone). It still lets you choose a handle, with no "did not work" message. This is the check for step 12a.
- [ ] Follow a test Campaign, then have a second test account reply to one of your Dispatches. Within about 15 minutes (the reply digest waits 10), a "replied to your Dispatch" email arrives.
- [ ] The email's **Stop these emails** link opens a confirmation page on the live site, and pressing the button turns that email type off under **Account → Email settings**.
- [ ] In Resend, **Logs** shows the emails as delivered.
- [ ] In Supabase, **Table Editor → email_outbox** shows recent rows as `sent`, none stuck as `queued` for more than a few minutes.
- [ ] Moderation: post a test Dispatch on a test Campaign. It should show "Checking…" for a few seconds at most, then appear. (If the AI key is not set yet, it appears with an "unscreened" marker in Admin → Moderation.)
- [ ] After all the above, delete the test accounts' invites if you no longer need them.

## If something goes wrong

- Emails stay `queued`: check steps 14, 16 and 17 (the secret in Vercel and in Vault must match exactly, and the address must be the custom domain).
- Emails show `failed` with "domain not verified": finish Part 1.
- Sign-up emails do not arrive: check Part 2, and the Supabase rate limit in step 11.
- The confirmation link says "That confirmation link did not work" but signing in works: the address was confirmed, and step 12a (the **Confirm sign up** template) is missing or was saved with different text. Redo step 12a; the person can simply sign in meanwhile.
