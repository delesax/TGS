# Footer for the emails Supabase sends (sign-up confirmation, password reset)

Our own emails (replies, Campaign updates, moderation, acknowledgements) get their footer from
`src/lib/email/templates.ts`, which reads `src/lib/legal.ts`. The **security and account emails** are
sent by Supabase Auth from templates you edit in the dashboard, so the footer has to be pasted there by hand.
They need the company footer but **no "stop these emails" link** (they are not optional).

**Owner action:** in Supabase → Authentication → Emails → Templates, add this block at the bottom of
**each** template (Confirm sign up, Reset password, Change email address, Invite user, Magic link,
Reauthentication), after the existing content. Fill in the two `[to be added]` values from the same facts as
`src/lib/legal.ts` (company number and registered office).

```html
<hr style="border:none;border-top:1px solid #d1d5db;margin:24px 0">
<p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#374151">
  You are getting this because this email address was used on The Grand Strategist. If that was not you, you can ignore this email.
</p>
<p style="margin:0;font-size:14px;line-height:1.5;color:#374151">
  Sent by The Grand Strategist.<br>
  The Grand Strategist Limited<br>
  Registered in England and Wales, company number [to be added]<br>
  Registered office: [to be added]
</p>
```

Check the "From" name is **The Grand Strategist** (docs/LAUNCH_EMAIL_SETUP.md covers the sender).
