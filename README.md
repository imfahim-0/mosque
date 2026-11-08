# হাঁড়ী-চৌধুরী জামে মসজিদ — Hari-Chowdhury Jame Mosque Management System
Bilingual (Bengali/English), zero-cost: static site on Netlify Free + Supabase Free (PostgreSQL, Auth, Storage). No paid API. No build step. No third-party JavaScript libraries (Excel is handled by our own `xlsx.js`; PDFs are made with the browser's Print → Save as PDF so Bengali letters render correctly).

## 1. Setup (about 30 minutes)
1. **Supabase**: supabase.com → New project (Free). Keep the database password to yourself.
2. **SQL Editor** → run, in this order, each file once: `001_foundation.sql`, `002_donations.sql`, `003_finance.sql`, `004_construction.sql`, `005_progress_media_import.sql`, `007_pledge_status.sql`, `008_material_pledges.sql`, `009_public_pledges_instructions_signatures.sql`, then `006_hardening.sql` last (re-run it after any later migration).
3. **Authentication → Users → Add user**: the ONE admin (email + strong password). Then **Authentication → Sign In / Providers → turn OFF "Allow new users to sign up"**. Optional but recommended: enable TOTP two-factor for the admin.
4. SQL Editor → run once: `insert into admin_users select id from auth.users where email = 'YOUR_ADMIN_EMAIL';`
5. **Settings → API**: copy *Project URL* and the *anon public* key into `web/assets/config.js`. **Never** use the `service_role` key.
6. Push this folder to GitHub → **Netlify → Add new site → Import from Git** → publish directory `web` (already set in `netlify.toml`). You get a free `*.netlify.app` address.
7. Open `/admin.html`, log in, and enter **payment instructions** (Supabase → Table editor → `site_settings`, row key `payment_instructions`, fill `value_bn`/`value_en`; only add numbers you have verified). Opening balances: ledger tab → adjustment.
8. Optional test: on a **separate empty** Supabase project run `tests/db_tests.sql`; locally run `node tests/run.js`.

## 2. Files
`supabase/migrations/*.sql` (versioned schema) · `web/` (site) · `tests/` · `docs/` (Bengali admin manual, public guide, security checklist, test report).

## 3. Free-tier limits (check current numbers: supabase.com/pricing, netlify.com/pricing — they change)
- Supabase Free: about 500 MB database, about 1 GB file storage, limited monthly bandwidth, **projects can pause after about a week of inactivity** (the admin can un-pause; data is kept) and **there are no automatic backups** → download the Excel backup regularly (weekly, and after big entry days).
- Netlify Free: monthly bandwidth and build-minute caps; more than enough for a village mosque site.
- Photos are compressed in the browser to under 2 MB each; keep around 400–500 photos at most.

## 4. How the money is kept honest
Cash, material value and pledges are separate everywhere. Only *verified* donations count. Every cash movement is an append-only ledger entry with a unique reference, created by the database (not by the screen), so nothing is counted twice. Verified records cannot be edited — only refunded/voided with a reversing entry. All changes are in `audit_logs`.

## 5. Known limitations (honest list)
- Unverified records can be edited in place ("সম্পাদনা"); verified money records never can (database-enforced).
- PDF = browser print dialog ("Save as PDF"); page numbers appear in Chrome/Edge print. No QR code is generated (add one only after verified payment details exist).
- Excel *import* covers masters and transactions (donors, workers, suppliers, contractors, inventory items, cash/material donations, pledges, expenses, attendance). Ledger adjustments, stock movements, purchases, contract payments, photos and documents are **not** re-imported; the backup workbook contains them for reference. Full disaster recovery = new Supabase project + the SQL files + import + re-entering those items.
- Public photos live in a public-read bucket with unguessable file names; only approved ones are listed.
- Mobile layout was designed responsive but not tested on physical devices by the developer.
