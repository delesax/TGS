# The Grand Strategist (TGS) - build instructions

## Product
TGS is a time-boxed arena for structured reasoning. It rewards the best argument before a deadline, not outrage or volume. The countdown and the single "Grand Strategist" title are the product. Pilot: up to 100 users (a pilot class plus retired professionals), public Campaigns, UK audience. Domain: thegrandstrategist.com (.co.uk redirects).

## Vocabulary (use in UI, database and code)
- Campaign: a topic with a start time, end time, format and rules (table: campaigns)
- Strategist: any participant
- Dispatch: a contribution - argument, rebuttal or evidence (table: dispatches)
- Verdict: the closing result that names the Grand Strategist, with a published rationale
- Dossier: a Strategist's permanent record of Dispatches, awards and titles

## Stack (do not substitute without asking)
- Next.js (App Router, TypeScript strict) on Vercel; Tailwind + shadcn/ui; PWA
- Supabase (Postgres, Auth, Realtime, Storage, RLS) in a London/EU region
- Scheduling: pg_cron for expiry checks, Inngest for workflows (open/close Campaign, round changes, judging, emails)
- AI: Anthropic API behind ONE server-side module (src/lib/ai). Haiku for moderation and nudges, Sonnet for coaching, judging and synthesis. Structured outputs for rubric scoring. Prompt caching. Never call the API from the browser
- Email: Resend. Errors: Sentry. Analytics: PostHog (cookie-light, consent first)
- Tests: Playwright for core journeys; Vitest for logic

## Rules
1. Clean restart. Do not use anything from the 2015 Rails project.
2. Work one sprint at a time. At the end of each sprint: run tests, write a CHANGELOG entry and a DEMO.md with click-through steps, then STOP and wait for approval.
3. All secrets in environment variables. Never commit keys. Provide .env.example only.
4. Every table has row-level security. Write RLS tests. Users can only edit their own content; admins via a role claim, not a client flag.
5. Server time is the only clock. The countdown is shown from the server's end timestamp; never trust the client.
6. Every AI decision (moderation, nudge, scoring) is stored with prompt version, model, output and a human-readable reason, and can be overridden by an admin. AI never deletes; it holds for review. AI never alone decides a graded outcome: lecturers approve.
7. Judging is a blend, with weights in a database table editable by admins. Defaults: panel 40%, peer 25%, AI rubric 25%, mind-change movement 10%. The AI rubric has four parts (logic, evidence, originality, responsiveness to others). A steelman bonus rewards accurately restating the opposing view before rebutting it. Peer votes are reputation-weighted with capped vote credits so a crowd cannot swamp a thoughtful minority. Publish the rubric before a Campaign opens.
8. Besides the Grand Strategist title, award categories: best rebuttal, best evidence, most persuasive, best newcomer. Every Verdict page shows its rationale and an appeal button.
9. Each Dispatch carries an AI-use declaration (none, assisted, generated). Show it publicly. Pasted AI output without declaration is a moderation flag.
10. Evaluate the AI judge against a human-scored gold set (seeded by the product owner) before launch; keep the test runnable (npm run eval:judge).
11. Privacy by design (UK GDPR): collect the minimum, data export and delete-account built in, privacy policy and terms, consent for analytics. Users must be 18 or over for the pilot.
12. Accessibility: WCAG 2.2 AA, keyboard navigable, readable type, high contrast. Many users are older adults, so large tap targets and plain wording.
13. Moderation: handles and Dispatches are screened. Block hate, harassment and impersonation. Sensitive Campaigns (e.g. assisted dying) need stricter settings and a content note. Financial and medical Campaigns are labelled as opinion, not advice.
14. Do not build anything on the out-of-scope list: dating, recruitment, payments, voice/video, native apps, verified credentials, LTI, argument map. Keep the schema open to them but ship nothing.
15. Ask me when a requirement is unclear. Do not guess on legal, payment or safety matters.

## Definition of done (every task)
Typecheck and lint clean; tests pass; works at 375px width; empty, loading and error states exist; no console errors.
