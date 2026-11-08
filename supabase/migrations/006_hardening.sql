-- 006_hardening.sql | Phase 6 | run LAST. Safe to re-run.
-- 1) Anonymous visitors may not execute ANY function (Postgres grants EXECUTE to PUBLIC by default).
revoke execute on all functions in schema public from public, anon;
grant execute on function is_admin(), next_receipt_no(),
  add_adjustment(uuid,text,numeric,date,text), reconcile(uuid,numeric,text),
  create_contract(uuid,text,text,date,numeric,numeric,date,date,text), create_purchase(date,uuid,text,text,text,jsonb) to authenticated;
-- 2) Future tables/functions must not be handed to anon automatically.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
-- 3) Re-assert: anon sees ONLY these views.
revoke all on all tables in schema public from anon;
grant select on public_totals, public_cash_balance, public_recent_donations, public_material_summary,
  public_announcements, public_settings, public_progress, public_gallery, public_monthly to anon;
