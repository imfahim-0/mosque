# Test report (honest status as of delivery)
| Area | How tested | Result |
|---|---|---|
| Excel writer/reader (Bengali, symbols, 3000 rows, bad file, sheet names) | `node tests/run.js` | PASS (5/5) |
| Excel file opens in another reader | openpyxl load of our file; our reader on an openpyxl file | PASS |
| All 12 report types render without runtime errors (empty data, mocked network) | scripted smoke test | PASS |
| All admin scripts load together and register all tabs | stubbed-DOM load test | PASS |
| JavaScript syntax, all files | `node --check` | PASS |
| SQL files: balanced quotes/brackets/`$$`; every table, view and function name used by the JavaScript exists in the SQL | static script (not a SQL parser) | PASS |
| SQL migrations 001–008 | **NOT executed** — no PostgreSQL in the build environment | **Pending: run on your Supabase project** |
| Permissions (anonymous vs admin) | `tests/db_tests.sql` written, **not run** | **Pending** |
| Financial rules (ledger posting, no double count, pledge 100000/30000/70000, overpay block, duplicate attendance, negative stock) | `tests/db_tests.sql`, **not run** | **Pending** |
| Admin-session checks (admin can read, update; RPCs) | manual | **Pending** (see checklist below) |
| Real phones / browsers | none | **Pending** |
## Manual acceptance checklist (do once after setup)
1. Add donor → add cash donation → verify → ledger shows +amount once → receipt prints.
2. Add pledge 100,000, link a verified 30,000 donation → outstanding 70,000.
3. Add expense, pay part, void payment → balances return.
4. Attendance twice on same date → second save edits, never duplicates.
5. Purchase with 2 items → stock rises, one bill appears in Expenses.
6. Contract overpayment is refused.
7. Excel backup downloads; template import shows preview; duplicate rows are skipped.
8. Upload a photo (approved) → appears on the home page; private document opens via temporary link only.
9. Logged-out browser: home page works; admin pages show nothing.
Report any failure with the exact message shown; do not enter real data until all pass.
