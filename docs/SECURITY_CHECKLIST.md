# Security checklist (tick each after setup)
- [ ] Public sign-ups are OFF in Supabase Authentication.
- [ ] Exactly one row in `admin_users` (database enforces max one).
- [ ] `config.js` contains only the URL and the **anon** key — no `service_role` key anywhere in GitHub.
- [ ] Admin password is long and unique; two-factor (TOTP) enabled if available.
- [ ] `006_hardening.sql` was run last.
- [ ] Anonymous test: open the public site, press F12 → Console, run `fetch(CONFIG_URL+"/rest/v1/donors",{headers:{apikey:ANON_KEY}}).then(r=>r.status)` → must be 401/403 or `[]`, never donor data. Repeat for `donations`, `audit_logs`, `financial_transactions`.
- [ ] `tests/db_tests.sql` prints `ALL DB TESTS PASSED` on a test project.
- [ ] Netlify headers active (check browser dev tools → Network → response headers → Content-Security-Policy).
- [ ] Private documents open only through the 5-minute link (try the saved address in a private window: must fail).
- [ ] Excel backups are stored somewhere safe (they contain phone numbers and addresses).
- [ ] Log out after use on shared phones/computers.
## Built-in protections
RLS on every private table · no DELETE permission (archive only) · verified money records locked · append-only ledger · audit log with old/new values · all page text inserted with `textContent` (no HTML injection) · CSP allows scripts only from the site itself · uploads limited by type and size in the browser *and* the storage bucket.
