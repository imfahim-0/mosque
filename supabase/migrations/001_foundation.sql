-- 001_foundation.sql  | Hari-Chowdhury Jame Mosque | Phase 1
-- Run once in Supabase Dashboard > SQL Editor.

create table admin_users (user_id uuid primary key references auth.users(id) on delete cascade);
create unique index only_one_admin on admin_users ((true));

create function is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from admin_users where user_id = auth.uid()) $$;

create table donors (
  id uuid primary key default gen_random_uuid(),
  donor_code text unique not null default ('D-' || to_char(now(),'YYMMDD') || '-' || substr(gen_random_uuid()::text,1,4)),
  full_name text not null check (length(trim(full_name)) > 0),
  father_name text, phone text, alt_phone text, address text,
  village text, union_name text, upazila text, district text,
  category text not null default 'general' check (category in
   ('general','monthly','major','overseas','business','family','anonymous','material')),
  public_display text not null default 'name' check (public_display in ('name','anonymous')),
  notes text, deleted_at timestamptz, created_at timestamptz not null default now()
);

create table donations (
  id uuid primary key default gen_random_uuid(),
  receipt_no text unique not null,
  donor_id uuid not null references donors(id),
  donation_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (method in ('cash','bkash','nagad','rocket','bank','cheque','other')),
  txn_ref text, bank_name text, collected_by text, received_by text, verified_by text, notes text,
  status text not null default 'pending' check (status in ('pending','received','verified','rejected','refunded')),
  deleted_at timestamptz, created_at timestamptz not null default now()
);
create index on donations (donor_id); create index on donations (donation_date);

create table material_donations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references donors(id),
  category text not null, material_name text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null check (unit in ('kg','ton','bag','piece','cft','sft','meter','bundle','trip','litre','other')),
  est_unit_price numeric(14,2) not null default 0 check (est_unit_price >= 0),
  est_value numeric(16,2) generated always as (round(quantity * est_unit_price, 2)) stored,
  donation_date date not null default current_date, delivery_date date,
  received_by text, condition_note text, storage_location text, notes text,
  status text not null default 'pending' check (status in ('pending','received','verified','rejected')),
  deleted_at timestamptz, created_at timestamptz not null default now()
);

create table donation_promises (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references donors(id),
  promised_amount numeric(14,2) not null default 0 check (promised_amount >= 0),
  promised_material text, promised_quantity numeric(14,3),
  promise_date date not null default current_date, expected_date date, follow_up_date date, notes text,
  status text not null default 'promised' check (status in ('promised','partial','fulfilled','cancelled','follow_up')),
  deleted_at timestamptz, created_at timestamptz not null default now()
);
-- Amount received against a promise = verified donations linked here (never typed by hand)
create table promise_payments (
  promise_id uuid not null references donation_promises(id),
  donation_id uuid not null references donations(id),
  primary key (promise_id, donation_id)
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null, description text not null,
  total_amount numeric(14,2) not null check (total_amount >= 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  outstanding numeric(14,2) generated always as (total_amount - paid_amount) stored,
  payment_method text, paid_to text, supplier_name text, invoice_no text, receipt_no text,
  approved_by text, recorded_by text, notes text,
  is_public boolean not null default false,
  deleted_at timestamptz, created_at timestamptz not null default now(),
  check (paid_amount <= total_amount)
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  title_bn text not null, title_en text, body_bn text, body_en text,
  is_public boolean not null default true, created_at timestamptz not null default now()
);

-- Admin-entered, verified payment instructions. Nothing is invented here.
create table site_settings (key text primary key, value_bn text, value_en text, is_public boolean not null default true);

create table audit_logs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(), user_id uuid, action text not null,
  table_name text not null, record_id text, old_data jsonb, new_data jsonb
);

create function audit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs(user_id, action, table_name, record_id, old_data, new_data)
  values (auth.uid(), tg_op, tg_table_name,
    coalesce((to_jsonb(new)->>'id'), (to_jsonb(old)->>'id')),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['donors','donations','material_donations','donation_promises',
    'promise_payments','expenses','announcements','site_settings'] loop
    execute format('create trigger trg_audit after insert or update or delete on %I for each row execute function audit()', t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy admin_select on %I for select to authenticated using (is_admin())', t);
    execute format('create policy admin_insert on %I for insert to authenticated with check (is_admin())', t);
    execute format('create policy admin_update on %I for update to authenticated using (is_admin()) with check (is_admin())', t);
  end loop; end $$;
-- No DELETE policy anywhere: hard deletes are impossible; use deleted_at (soft delete).

alter table audit_logs enable row level security;
alter table admin_users enable row level security;
create policy admin_read_audit on audit_logs for select to authenticated using (is_admin());
create policy admin_self on admin_users for select to authenticated using (user_id = auth.uid());
revoke all on all tables in schema public from anon;

-- ===== Public read-only views: aggregates / approved fields only =====
create view public_totals as select
  (select coalesce(sum(amount),0) from donations where status='verified' and deleted_at is null) as cash_received,
  (select coalesce(sum(est_value),0) from material_donations where status='verified' and deleted_at is null) as material_value,
  (select coalesce(sum(paid_amount),0) from expenses where is_public and deleted_at is null) as expenses_paid,
  (select coalesce(sum(outstanding),0) from expenses where is_public and deleted_at is null) as unpaid_bills,
  (select coalesce(sum(promised_amount),0) from donation_promises where status<>'cancelled' and deleted_at is null)
   - (select coalesce(sum(d.amount),0) from promise_payments pp
        join donations d on d.id=pp.donation_id
        join donation_promises p on p.id=pp.promise_id
      where d.status='verified' and d.deleted_at is null and p.status<>'cancelled' and p.deleted_at is null) as pledges_outstanding,
  (select count(distinct donor_id) from donations where status='verified' and deleted_at is null) as verified_donors;

-- Cash only: material value is never added. (Cash/bank/bKash split comes in Phase 3.)
create view public_cash_balance as select
  (select cash_received - expenses_paid from public_totals) as balance;

create view public_recent_donations as
  select d.donation_date, d.amount, d.method,
    case when dn.public_display='anonymous' or dn.category='anonymous' then null else dn.full_name end as display_name
  from donations d join donors dn on dn.id=d.donor_id
  where d.status='verified' and d.deleted_at is null
  order by d.donation_date desc, d.created_at desc limit 20;

create view public_material_summary as
  select category, unit, sum(quantity) as total_quantity, sum(est_value) as est_value
  from material_donations where status='verified' and deleted_at is null group by category, unit;

create view public_announcements as select id, title_bn, title_en, body_bn, body_en, created_at from announcements where is_public;
create view public_settings as select key, value_bn, value_en from site_settings where is_public;

grant select on public_totals, public_cash_balance, public_recent_donations,
  public_material_summary, public_announcements, public_settings to anon, authenticated;

-- After creating your admin in Auth > Users, run ONCE (replace email):
-- insert into admin_users select id from auth.users where email = 'YOUR_ADMIN_EMAIL';
