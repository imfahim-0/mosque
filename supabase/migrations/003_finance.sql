-- 003_finance.sql | Phase 3 | run AFTER 001 and 002

-- SECURITY FIX for 002: anonymous visitors must not be able to call this (would burn receipt numbers)
revoke execute on function next_receipt_no() from public, anon;
grant execute on function next_receipt_no() to authenticated;

create table financial_accounts (
  id uuid primary key default gen_random_uuid(),
  code text unique not null, name_bn text not null, name_en text not null,
  kind text not null check (kind in ('cash','bank','mfs'))
);
-- Structure only; every balance starts at 0. Add real opening balances via "adjustment" in the app.
insert into financial_accounts(code,name_bn,name_en,kind) values
 ('cash','নগদ ক্যাশ','Cash in hand','cash'),('bank','ব্যাংক','Bank','bank'),
 ('bkash','বিকাশ','bKash','mfs'),('nagad','নগদ (Nagad)','Nagad','mfs'),('rocket','রকেট','Rocket','mfs');

-- Append-only ledger: nobody can insert/update/delete directly. Entries are created only by triggers/functions below.
create table financial_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references financial_accounts(id),
  txn_date date not null,
  direction text not null check (direction in ('in','out')),
  amount numeric(14,2) not null check (amount > 0),
  source_type text not null check (source_type in ('donation','expense_payment','adjustment')),
  source_id uuid,
  reference text unique not null,          -- unique reference => a source can never be posted twice
  description text, created_at timestamptz not null default now()
);
create index on financial_transactions (account_id, txn_date);

create table expense_payments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id),
  account_id uuid not null references financial_accounts(id),
  payment_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  notes text, voided_at timestamptz, created_at timestamptz not null default now()
);

create table reconciliations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references financial_accounts(id),
  on_date date not null default current_date,
  book_balance numeric(14,2) not null, actual_balance numeric(14,2) not null,
  difference numeric(14,2) generated always as (actual_balance - book_balance) stored,
  note text, created_at timestamptz not null default now()
);

alter table financial_accounts enable row level security;
alter table financial_transactions enable row level security;
alter table expense_payments enable row level security;
alter table reconciliations enable row level security;
create policy adm_sel on financial_accounts for select to authenticated using (is_admin());
create policy adm_sel on financial_transactions for select to authenticated using (is_admin());
create policy adm_sel on reconciliations for select to authenticated using (is_admin());
create policy adm_sel on expense_payments for select to authenticated using (is_admin());
create policy adm_ins on expense_payments for insert to authenticated with check (is_admin());
create policy adm_upd on expense_payments for update to authenticated using (is_admin()) with check (is_admin());

create trigger trg_audit after insert or update or delete on expense_payments for each row execute function audit();
create trigger trg_audit after insert or update or delete on financial_transactions for each row execute function audit();
create trigger trg_audit after insert or update or delete on reconciliations for each row execute function audit();

-- ---- Donations -> ledger (cash donations only; materials/pledges never touch the ledger) ----
create function post_donation() returns trigger language plpgsql security definer set search_path = public as $$
declare acc uuid;
begin
  select id into acc from financial_accounts where code = case new.method
    when 'bkash' then 'bkash' when 'nagad' then 'nagad' when 'rocket' then 'rocket'
    when 'bank' then 'bank' when 'cheque' then 'bank' else 'cash' end;
  if new.status = 'verified' and (tg_op = 'INSERT' or old.status <> 'verified') then
    insert into financial_transactions(account_id,txn_date,direction,amount,source_type,source_id,reference,description)
    values (acc,new.donation_date,'in',new.amount,'donation',new.id,'DON:'||new.id||':IN','দান '||new.receipt_no)
    on conflict (reference) do nothing;
  elsif tg_op = 'UPDATE' and old.status = 'verified' and new.status = 'refunded' then
    insert into financial_transactions(account_id,txn_date,direction,amount,source_type,source_id,reference,description)
    values (acc,current_date,'out',new.amount,'donation',new.id,'DON:'||new.id||':REV','দান ফেরত '||new.receipt_no)
    on conflict (reference) do nothing;
  end if;
  return new;
end $$;
create trigger trg_post_donation after insert or update on donations for each row execute function post_donation();

-- Verified donations: no status rollback, no method change, no archiving. Only verified -> refunded.
create or replace function guard_verified_donation() returns trigger language plpgsql as $$
begin
  if old.status = 'verified' then
    if new.status not in ('verified','refunded') then raise exception 'Verified donation can only be marked refunded.'; end if;
    if new.deleted_at is not null then raise exception 'Verified donation cannot be archived. Mark it refunded.'; end if;
    if new.status = 'verified' and (new.amount <> old.amount or new.donor_id <> old.donor_id or new.method <> old.method
       or new.receipt_no <> old.receipt_no or new.donation_date <> old.donation_date) then
      raise exception 'Verified donation cannot be changed. Mark it refunded and create a new record.'; end if;
  end if;
  return new;
end $$;

-- backfill any donations verified before this migration
insert into financial_transactions(account_id,txn_date,direction,amount,source_type,source_id,reference,description)
select (select id from financial_accounts where code = case d.method when 'bkash' then 'bkash' when 'nagad' then 'nagad'
  when 'rocket' then 'rocket' when 'bank' then 'bank' when 'cheque' then 'bank' else 'cash' end),
  d.donation_date,'in',d.amount,'donation',d.id,'DON:'||d.id||':IN','দান '||d.receipt_no
from donations d where d.status='verified' on conflict (reference) do nothing;

-- ---- Expense payments -> ledger + paid_amount (paid_amount is derived, never typed) ----
create function post_expense_payment() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into financial_transactions(account_id,txn_date,direction,amount,source_type,source_id,reference,description)
    values (new.account_id,new.payment_date,'out',new.amount,'expense_payment',new.id,'EXP:'||new.id||':OUT',
      'খরচ: '||(select description from expenses where id=new.expense_id));
  elsif old.voided_at is null and new.voided_at is not null then
    insert into financial_transactions(account_id,txn_date,direction,amount,source_type,source_id,reference,description)
    values (new.account_id,current_date,'in',new.amount,'expense_payment',new.id,'EXP:'||new.id||':REV','পরিশোধ বাতিল');
  end if;
  update expenses set paid_amount = (select coalesce(sum(amount),0) from expense_payments
    where expense_id = new.expense_id and voided_at is null) where id = new.expense_id;   -- check constraint blocks overpayment
  return new;
end $$;
create trigger trg_post_exp after insert or update on expense_payments for each row execute function post_expense_payment();

create function guard_expense_payment() returns trigger language plpgsql as $$
begin
  if old.voided_at is not null or new.expense_id <> old.expense_id or new.account_id <> old.account_id
     or new.amount <> old.amount or new.payment_date <> old.payment_date then
    raise exception 'Payments cannot be edited. Void it and add a new payment.'; end if;
  return new;
end $$;
create trigger trg_guard_pay before update on expense_payments for each row execute function guard_expense_payment();

create function guard_expense() returns trigger language plpgsql as $$
begin
  if new.deleted_at is not null and old.paid_amount > 0 then raise exception 'Void the payments first.'; end if;
  if new.paid_amount <> old.paid_amount and current_setting('role', true) = 'authenticated' and pg_trigger_depth() < 2 then
    raise exception 'paid_amount is calculated from payments.'; end if;
  return new;
end $$;
create trigger trg_guard_exp before update on expenses for each row execute function guard_expense();

-- ---- Manual adjustment (opening balance / correction) and reconciliation: admin-only RPCs ----
create function add_adjustment(p_account uuid, p_direction text, p_amount numeric, p_date date, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  if p_direction not in ('in','out') or p_amount <= 0 or length(trim(coalesce(p_reason,''))) = 0 then
    raise exception 'amount > 0 and a reason are required'; end if;
  insert into financial_transactions(account_id,txn_date,direction,amount,source_type,reference,description)
  values (p_account,p_date,p_direction,p_amount,'adjustment','ADJ:'||gen_random_uuid(),p_reason);
end $$;

create function reconcile(p_account uuid, p_actual numeric, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare bal numeric;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  select coalesce(sum(case when direction='in' then amount else -amount end),0) into bal
    from financial_transactions where account_id = p_account;
  insert into reconciliations(account_id,book_balance,actual_balance,note) values (p_account,bal,p_actual,p_note);
end $$;
revoke execute on function add_adjustment(uuid,text,numeric,date,text), reconcile(uuid,numeric,text) from public, anon;
grant execute on function add_adjustment(uuid,text,numeric,date,text), reconcile(uuid,numeric,text) to authenticated;

-- ---- Views ----
create view admin_account_balances with (security_invoker = true) as
select a.id as account_id, a.code, a.name_bn, a.kind,
  coalesce(sum(case when t.direction='in' then t.amount else -t.amount end),0) as balance
from financial_accounts a left join financial_transactions t on t.account_id = a.id group by a.id;
grant select on admin_account_balances to authenticated;

-- Public balance = sum of all ledger accounts (cash+bank+mobile). Material value is never included.
create or replace view public_cash_balance as
select coalesce(sum(case when direction='in' then amount else -amount end),0) as balance from financial_transactions;
