# Changelog

## Sprint 1: Foundation, accounts and Dossier (1 November 2026). Awaiting review

### Added
- **Project**: Next.js 16 (App Router, TypeScript strict), Tailwind 4 with shadcn/ui-style components, ESLint, Vitest, Playwright. GitHub Actions CI runs lint, typecheck and unit tests, then builds the database from the migrations in local Supabase and runs the RLS and Playwright tests.
- **Database schema** (`supabase/migrations`, rebuilds from scratch): `profiles`, `invites`, `campaigns`, `dispatches`, `awards`, `audit_log`, plus `ai_decisions`, `passkeys` and `webauthn_challenges`. Row-level security is on for every table. Column privileges stop people from setting their own handle, moderation status or AI decisions. `audit_log` is append-only, even for the service role. Admin rights come only from the JWT `app_metadata.role` claim.
- **Invite-only sign-up**: email and password, invite code, 18+ and terms confirmation. A database trigger enforces the invite, so calling the Auth API directly cannot get round it. Email confirmation link → choose handle → Dossier.
- **Passkeys**: add one from the Account page, then use "Sign in with a passkey" on the sign-in page. WebAuthn is verified on the server (SimpleWebAuthn); credentials are written only by the server.
- **Handle screening**: `src/lib/ai` (the single AI module) with a deny-list stub for impersonation and hate terms, including look-alike characters such as `Adm1n`. Every decision is stored in `ai_decisions` with model, prompt version, output and a plain reason.
- **Pages**: Home, Sign in, Create account, Check your email, Choose your handle, Account (profile, passkeys, "Back to home"), empty Dossier, Campaigns placeholder, and draft Privacy, Terms and AI-use pages clearly marked DRAFT. Includes loading, error and not-found pages.
- **Design system**: 18px base text, Atkinson Hyperlegible font, high-contrast colours, 48px minimum tap targets, visible focus ring, skip link, and a persistent header (Home, Campaigns, Dossier, Account). Errors appear inline and stay until dismissed, and forms keep what you typed.
- **Email links**: `/auth/confirm` accepts links whose `&` were HTML-escaped to `&amp;` by the email template.
- **Scripts**: `npm run env:check` (names only, never values), `npm run invite:create`, `npm run admin:set`, `npm run test:env`.
- **Tests**: 43 unit tests, 43 RLS tests (each checked by weakening a policy and watching the tests fail), and 2 Playwright tests at 375px: sign-up with an invite code through to the empty Dossier, and adding a passkey then signing in with it.

### Changed
- `.env.local`: changed the separator from `KEY:value` to `KEY=value` (with permission) so Next.js can read it. Values unchanged.

### Not done / known issues
- Hosted project: migrations applied after a reviewed dry run, Auth settings configured, and a real sign-up confirmed end to end. Site URL is `http://localhost:3000` until a Vercel URL is chosen.
- The free Supabase email service sends only a few emails an hour. Custom SMTP through Resend is planned for Sprint 3.
- No data export or delete-account yet (CLAUDE.md rule 11). Proposed for a later sprint.
- An invite is used up at sign-up even if the person never confirms their email.
- `npm audit` reports moderate advisories in the ESLint toolchain only (development, not shipped).
- `/Users/deleolaoye/Project/TGS/.env.local` (outside the repo) still uses the old `KEY:value` format and is not used by the app.
