-- 004_construction.sql | Phase 4 | run AFTER 001-003
-- Design rule (no double counting): ALL contractor and purchase payments go through expense_payments (one path -> one ledger entry).
-- Worker wages have their own payment table (per-worker balances) and also post to the ledger once.

alter table financial_transactions drop constraint financial_transactions_source_type_check;
alter table financial_transactions add constraint financial_transactions_source_type_check
  check (source_type in ('donation','expense_payment','worker_payment','adjustment'));

-- ===== Workers =====
create table workers (
  id uuid primary key default gen_random_uuid(),
  worker_code text unique not null default ('W-' || substr(gen_random_uuid()::text,1,6)),
  full_name text not null check (length(trim(full_name)) > 0),
  father_name text, phone text, address text,
  category text not null default 'helper' check (category in ('mason','helper','electrician','plumber','painter','carpenter','rod_binder','supervisor','other')),
  daily_wage numeric(12,2) not null check (daily_wage >= 0), joining_date date, notes text,
  deleted_at timestamptz, created_at timestamptz not null default now()
);
create table worker_attendance (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id), work_date date not null,
  present boolean not null default true, work_category text,
  daily_wage numeric(12,2) not null check (daily_wage >= 0),            -- snapshot of the wage on that day
  overtime numeric(12,2) not null default 0 check (overtime >= 0),
  daily_bill numeric(14,2) generated always as (case when present then daily_wage + overtime else 0 end) stored,
  created_at timestamptz not null default now(),
  unique (worker_id, work_date)                                          -- no duplicate attendance
);
create table worker_payments (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id), account_id uuid not null references financial_accounts(id),
  payment_date date not null default current_date, amount numeric(14,2) not null check (amount > 0),
  kind text not null default 'wage' check (kind in ('wage','advance')), notes text,
  voided_at timestamptz, created_at timestamptz not null default now()
);

-- ===== Suppliers, contractors, contracts =====
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_code text unique not null default ('S-' || substr(gen_random_uuid()::text,1,6)),
  business_name text not null, owner_name text, phone text, address text, category text,
  deleted_at timestamptz, created_at timestamptz not null default now()
);
create table contractors (
  id uuid primary key default gen_random_uuid(), name text not null, phone text, address text, notes text,
  deleted_at timestamptz, created_at timestamptz not null default now()
);
create table contracts (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id),
  expense_id uuid unique not null references expenses(id),               -- the contract's bill; payments are expense_payments
  contract_type text not null default 'full' check (contract_type in ('full','partial','milestone')),
  description text not null, agreement_date date not null default current_date,
  total_value numeric(14,2) not null check (total_value >= 0), retention_amount numeric(14,2) not null default 0 check (retention_amount >= 0),
  start_date date, expected_end_date date, actual_end_date date, notes text,
  deleted_at timestamptz, created_at timestamptz not null default now()
);
alter table expense_payments add column contract_id uuid references contracts(id);
alter table expense_payments add column kind text not null default 'payment';

-- ===== Inventory =====
create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  unit text not null check (unit in ('kg','ton','bag','piece','cft','sft','meter','bundle','trip','litre','other')),  -- one unit per item: units never mixed
  storage_location text, opening_stock numeric(14,3) not null default 0 check (opening_stock >= 0),
  deleted_at timestamptz, created_at timestamptz not null default now()
);
create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inventory_items(id), movement_date date not null default current_date,
  kind text not null check (kind in ('purchase','donation','used','returned','adjust_in','adjust_out')),
  quantity numeric(14,3) not null check (quantity > 0),
  ref text unique, source_type text, source_id uuid, notes text, created_at timestamptz not null default now(),
  check (kind not in ('adjust_in','adjust_out') or length(trim(coalesce(notes,''))) > 0)   -- adjustments need a reason
);
alter table material_donations add column inventory_item_id uuid references inventory_items(id);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_date date not null default current_date, supplier_id uuid not null references suppliers(id),
  invoice_no text, received_by text, notes text,
  expense_id uuid unique not null references expenses(id), created_at timestamptz not null default now()
);
create table purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id), item_id uuid not null references inventory_items(id),
  quantity numeric(14,3) not null check (quantity > 0), unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(16,2) generated always as (round(quantity * unit_price, 2)) stored
);

-- ===== RLS + audit =====
do $$ declare t text; begin
  foreach t in array array['workers','worker_attendance','worker_payments','suppliers','contractors','contracts','inventory_items','stock_movements','purchases','purchase_items'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy adm_sel on %I for select to authenticated using (is_admin())', t);
    execute format('create trigger trg_audit after insert or update or delete on %I for each row execute function audit()', t);
  end loop;
  foreach t in array array['workers','worker_attendance','worker_payments','suppliers','contractors','contracts','inventory_items'] loop
    execute format('create policy adm_ins on %I for insert to authenticated with check (is_admin())', t);
    execute format('create policy adm_upd on %I for update to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;
-- stock_movements: admin may insert manual kinds only; purchase/donation kinds come from functions/triggers. No update/delete ever.
create policy adm_ins on stock_movements for insert to authenticated
  with check (is_admin() and kind in ('used','returned','adjust_in','adjust_out'));

-- ===== Worker payments -> ledger =====
create function post_worker_payment() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into financial_transactions(account_id,txn_date,direction,amount,source_type,source_id,reference,description)
    values (new.account_id,new.payment_date,'out',new.amount,'worker_payment',new.id,'WRK:'||new.id||':OUT',
      case new.kind when 'advance' then 'অগ্রিম: ' else 'মজুরি: ' end || (select full_name from workers where id=new.worker_id));
  elsif old.voided_at is null and new.voided_at is not null then
    insert into financial_transactions(account_id,txn_date,direction,amount,source_type,source_id,reference,description)
    values (new.account_id,current_date,'in',new.amount,'worker_payment',new.id,'WRK:'||new.id||':REV','মজুরি পরিশোধ বাতিল');
  end if;
  return new;
end $$;
create trigger trg_post_wrk after insert or update on worker_payments for each row execute function post_worker_payment();
create function guard_worker_payment() returns trigger language plpgsql as $$
begin
  if old.voided_at is not null or new.worker_id <> old.worker_id or new.account_id <> old.account_id
     or new.amount <> old.amount or new.payment_date <> old.payment_date or new.kind <> old.kind then
    raise exception 'Payments cannot be edited. Void it and add a new payment.'; end if;
  return new;
end $$;
create trigger trg_guard_wrk before update on worker_payments for each row execute function guard_worker_payment();

-- ===== Stock rules =====
create function guard_stock() returns trigger language plpgsql as $$
declare cur numeric;
begin
  perform 1 from inventory_items where id = new.item_id for update;
  if new.kind in ('used','returned','adjust_out') then
    select i.opening_stock + coalesce(sum(case when m.kind in ('purchase','donation','adjust_in') then m.quantity else -m.quantity end),0)
      into cur from inventory_items i left join stock_movements m on m.item_id = i.id where i.id = new.item_id group by i.id, i.opening_stock;
    if cur - new.quantity < 0 then raise exception 'Stock cannot go below zero (current stock: %)', cur; end if;
  end if;
  return new;
end $$;
create trigger trg_guard_stock before insert on stock_movements for each row execute function guard_stock();

create function guard_item() returns trigger language plpgsql as $$
begin
  if new.opening_stock <> old.opening_stock or new.unit <> old.unit then
    raise exception 'Opening stock and unit are fixed. Use a recorded stock adjustment.'; end if;
  return new;
end $$;
create trigger trg_guard_item before update on inventory_items for each row execute function guard_item();

-- Verified material donation -> stock (only when linked to an item with the SAME unit)
create function post_material_stock() returns trigger language plpgsql security definer set search_path = public as $$
declare u text;
begin
  if new.inventory_item_id is not null and new.status = 'verified' and (tg_op = 'INSERT' or old.status <> 'verified') then
    select unit into u from inventory_items where id = new.inventory_item_id;
    if u is distinct from new.unit then raise exception 'Unit mismatch: stock item unit is %, donation unit is %', u, new.unit; end if;
    insert into stock_movements(item_id,movement_date,kind,quantity,ref,source_type,source_id,notes)
    values (new.inventory_item_id,new.donation_date,'donation',new.quantity,'MD:'||new.id,'material_donation',new.id,'সামগ্রী দান')
    on conflict (ref) do nothing;
  end if;
  return new;
end $$;
create trigger trg_post_mat after insert or update on material_donations for each row execute function post_material_stock();
create function guard_material() returns trigger language plpgsql as $$
begin
  if old.status = 'verified' and (new.status <> 'verified' or new.quantity <> old.quantity or new.unit <> old.unit
     or new.inventory_item_id is distinct from old.inventory_item_id or new.deleted_at is not null) then
    raise exception 'Verified material donation cannot be changed. Use a recorded stock adjustment.'; end if;
  return new;
end $$;
create trigger trg_guard_mat before update on material_donations for each row execute function guard_material();

create function guard_contract() returns trigger language plpgsql as $$
begin
  if new.deleted_at is not null and (select paid_amount from expenses where id = new.expense_id) > 0 then
    raise exception 'Void the contract payments first.'; end if;
  return new;
end $$;
create trigger trg_guard_contract before update on contracts for each row execute function guard_contract();

-- ===== Atomic creators =====
create function create_contract(p_contractor_id uuid, p_contract_type text, p_description text, p_agreement_date date,
  p_total_value numeric, p_retention_amount numeric, p_start_date date, p_expected_end date, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare cname text; eid uuid; cid uuid;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  select name into cname from contractors where id = p_contractor_id;
  insert into expenses(expense_date,category,description,total_amount,supplier_name,recorded_by)
  values (coalesce(p_agreement_date,current_date),'ঠিকাদার', cname||' — '||p_description, p_total_value, cname, 'admin') returning id into eid;
  insert into contracts(contractor_id,expense_id,contract_type,description,agreement_date,total_value,retention_amount,start_date,expected_end_date,notes)
  values (p_contractor_id,eid,p_contract_type,p_description,coalesce(p_agreement_date,current_date),p_total_value,coalesce(p_retention_amount,0),p_start_date,p_expected_end,p_notes)
  returning id into cid;
  return cid;
end $$;

create function create_purchase(p_date date, p_supplier uuid, p_invoice text, p_received_by text, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare total numeric := 0; it jsonb; eid uuid; pid uuid; piid uuid; sname text;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'at least one item required'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    total := total + round((it->>'quantity')::numeric * (it->>'unit_price')::numeric, 2);
  end loop;
  select business_name into sname from suppliers where id = p_supplier;
  insert into expenses(expense_date,category,description,total_amount,supplier_name,invoice_no,recorded_by)
  values (coalesce(p_date,current_date),'ক্রয়','ক্রয় — '||coalesce(sname,'')||coalesce(' (ইনভয়েস '||p_invoice||')',''),total,sname,p_invoice,'admin') returning id into eid;
  insert into purchases(purchase_date,supplier_id,invoice_no,received_by,notes,expense_id)
  values (coalesce(p_date,current_date),p_supplier,p_invoice,p_received_by,p_notes,eid) returning id into pid;
  for it in select * from jsonb_array_elements(p_items) loop
    insert into purchase_items(purchase_id,item_id,quantity,unit_price)
    values (pid,(it->>'item_id')::uuid,(it->>'quantity')::numeric,(it->>'unit_price')::numeric) returning id into piid;
    insert into stock_movements(item_id,movement_date,kind,quantity,ref,source_type,source_id,notes)
    values ((it->>'item_id')::uuid,coalesce(p_date,current_date),'purchase',(it->>'quantity')::numeric,'PUR:'||piid,'purchase',pid,'ক্রয়');
  end loop;
  return pid;                                   -- ONE expense + ONE stock receipt per line: nothing counted twice
end $$;
revoke execute on function create_contract(uuid,text,text,date,numeric,numeric,date,date,text), create_purchase(date,uuid,text,text,text,jsonb) from public, anon;
grant execute on function create_contract(uuid,text,text,date,numeric,numeric,date,date,text), create_purchase(date,uuid,text,text,text,jsonb) to authenticated;

-- ===== Views =====
create view admin_worker_balances with (security_invoker = true) as
select w.*, coalesce(a.days,0) as days_present, coalesce(a.bill,0) as total_bill, coalesce(p.paid,0) as paid,
  coalesce(a.bill,0) - coalesce(p.paid,0) as outstanding            -- negative = advance paid
from workers w
left join (select worker_id, count(*) filter (where present) as days, sum(daily_bill) as bill from worker_attendance group by worker_id) a on a.worker_id = w.id
left join (select worker_id, sum(amount) as paid from worker_payments where voided_at is null group by worker_id) p on p.worker_id = w.id;

create view admin_stock with (security_invoker = true) as
select i.id, i.name, i.unit, i.storage_location, i.opening_stock, i.created_at, i.deleted_at,
  coalesce(sum(m.quantity) filter (where m.kind='purchase'),0) as purchased,
  coalesce(sum(m.quantity) filter (where m.kind='donation'),0) as donated,
  coalesce(sum(m.quantity) filter (where m.kind='used'),0) as used,
  coalesce(sum(m.quantity) filter (where m.kind='returned'),0) as returned,
  i.opening_stock + coalesce(sum(case when m.kind in ('purchase','donation','adjust_in') then m.quantity else -m.quantity end),0) as current_stock
from inventory_items i left join stock_movements m on m.item_id = i.id group by i.id;

-- Labour totals appear publicly ONLY if the admin switches this on (aggregates only, no names).
insert into site_settings(key,value_bn,value_en,is_public) values ('publish_labour_totals','no','no',false) on conflict do nothing;

create or replace view public_totals as select
  (select coalesce(sum(amount),0) from donations where status='verified' and deleted_at is null) as cash_received,
  (select coalesce(sum(est_value),0) from material_donations where status='verified' and deleted_at is null) as material_value,
  (select coalesce(sum(paid_amount),0) from expenses where is_public and deleted_at is null)
   + (select case when exists (select 1 from site_settings where key='publish_labour_totals' and value_en='yes')
        then coalesce((select sum(amount) from worker_payments where voided_at is null),0) else 0 end) as expenses_paid,
  (select coalesce(sum(outstanding),0) from expenses where is_public and deleted_at is null)
   + (select case when exists (select 1 from site_settings where key='publish_labour_totals' and value_en='yes')
        then coalesce((select sum(greatest(a.bill - coalesce(p.paid,0),0))
          from (select worker_id, sum(daily_bill) as bill from worker_attendance group by worker_id) a
          left join (select worker_id, sum(amount) as paid from worker_payments where voided_at is null group by worker_id) p using (worker_id)),0)
        else 0 end) as unpaid_bills,
  (select coalesce(sum(promised_amount),0) from donation_promises where status<>'cancelled' and deleted_at is null)
   - (select coalesce(sum(d.amount),0) from promise_payments pp
        join donations d on d.id=pp.donation_id join donation_promises p on p.id=pp.promise_id
      where d.status='verified' and d.deleted_at is null and p.status<>'cancelled' and p.deleted_at is null) as pledges_outstanding,
  (select count(distinct donor_id) from donations where status='verified' and deleted_at is null) as verified_donors;

-- Re-assert grants: anon sees ONLY the public views
revoke all on all tables in schema public from anon;
grant select on public_totals, public_cash_balance, public_recent_donations, public_material_summary, public_announcements, public_settings to anon, authenticated;
grant select on admin_worker_balances, admin_stock to authenticated;
