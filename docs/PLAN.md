# TGS pilot plan (summary for the builder)

Full plan: "TGS Pilot Scope, WBS and Claude Code Instructions" (owner holds the link). This file is the working copy you read each sprint.

## Goal
Prove people will debate on a timer and care who is crowned Grand Strategist. Invite-only pilot, up to 100 people: a pilot class plus retired professionals. Soft launch by 1 December 2026 with Sprints 1 to 5 and 20 to 30 invitees; scale to 100 in December.

## In scope
- Sign-up with email and passkey, screened handle, profile, expertise tag; invite-only
- Dossier: a Strategist's page of Dispatches, awards, titles
- Campaigns: start, end, live countdown; open arena, Oxford-style for/against, progressive rounds with mini-deadlines
- Dispatches (argument, rebuttal, evidence): threads, reactions, source links, AI-use declaration, follow, email notifications
- AI moderation of every Dispatch and handle, nudges, private AI coach, human review queue
- Judging: panel score, reputation-weighted peer votes, four-part AI rubric (logic, evidence, originality, responsiveness), steelman bonus, mind-change measure; blended into a Verdict with a published rationale and an appeal route
- Category awards (best rebuttal, best evidence, most persuasive, best newcomer), Grand Strategist badge, Verdict pages, leaderboard
- Cohorts and class Campaigns; lecturer participation report (CSV); sponsored Campaign template; AI synthesis report
- Admin console: Campaigns, users, moderation queue, flags, judging weights
- PWA, accessible (WCAG 2.2 AA), UK GDPR compliant

## Out of scope (do not build)
Dating and recruitment; hiring or consulting marketplace and payments; live voice and video; native mobile apps; verified credentials and Open Badges; LTI grade passback; argument map; wargame and tournament formats; seasons; multi-language; public API.

## Sprints
| Sprint | Work package | Done when |
| --- | --- | --- |
| 1 | Foundation, accounts, Dossier: repo, CI, schema and RLS, design system, invite-only sign-up and login, handle screening, profile and Dossier, policy pages | A new user signs up with an invite code, passes handle screening, sees an empty Dossier; RLS tests pass |
| 2 | Campaigns and countdown: model, create/edit, list and page, countdown, rounds and mini-deadlines, for/against with before/after position, scheduled open and close, five industry categories | A Campaign opens, moves through rounds and closes on schedule to the minute; countdown matches server time |
| 3 | Dispatches and discussion: types, threads, reactions, source links, AI-use declaration, follow, search, email notifications, PWA | 20 test users hold a threaded debate; pages load under 2 seconds on mobile |
| 4 | AI moderation, coach, admin: Haiku screening, nudges, pre-post coach, flag and appeal flow, review queue, admin console, audit log | Seeded abusive Dispatches are held; admin can override; coach feedback judged useful |
| 5 | Judging and Verdict: panel form, peer votes, AI rubric, steelman bonus, mind-change, blended winner with editable weights, awards, appeal, Verdict page, leaderboard, gold-set evaluation | Closing a test Campaign yields a Verdict with rationale and audit trail; AI scores agree with the gold set within an accepted margin |
| 6 | Cohorts, sponsors, synthesis | A mock lecturer runs a class Campaign and exports grades; a sponsor receives a synthesis report |
| 7 | Hardening and launch: security review, accessibility, anti-gaming, load test at 500 users, monitoring, backups, privacy review, move accounts and repo into the company | Owner passes the launch checklist |

Judging default weights: panel 40%, peer 25%, AI rubric 25%, mind-change movement 10% (editable in the database).

## Success criteria for the pilot
60 of 100 invitees post at least once; 10 or more Campaigns completed with a winner; half of active users return for a second Campaign; fewer than 2% of Dispatches removed for abuse; participants rate winner selection fair (4 out of 5 or better).

## Seed content
Fifteen launch Campaign topics exist (Financial Services, Energy, Technology, Education, Health and Social Care). They will be supplied as seed data in Sprint 2 or 3.
