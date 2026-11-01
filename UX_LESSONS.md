# UX lessons from the 2015 build

The 2015 Rails build was never launched. A bug review found these usability failures. Avoid them; this is a clean restart and no old code is reused.

- A signed-in user could not get back to the home page from their profile. Every page needs a persistent header with Home, Campaigns, Dossier and account.
- A failed-login message disappeared before it could be read. Show errors inline, keep them until dismissed, say what to do next, and never lose what the user typed.
- Search matched only screen names. Search must cover Campaigns, Dispatches and handles.
- Admin settings could be edited only by password. Admins need a proper console with roles and an audit log.
- Many screens had no empty, loading or error state. Every list and form needs all three.
- Several routes pointed at pages that did not exist. No dead links; test every navigation path.
- Secrets (keys, a hard-coded secret) were committed to the repository, and request forgery protection was switched off. Never commit secrets; keep security defaults on.
- Over 80 defects were logged against the old build, and almost half were on the dashboard. Keep the dashboard simple and test it first.
