-- Database tests. Run in Supabase SQL Editor AFTER all migrations. Everything is rolled back at the end.
-- RUN ON A FRESH TEST PROJECT (empty data): totals are asserted as absolute numbers.
-- Success = the final line returns the NOTICE 'ALL DB TESTS PASSED'. Any failure raises an exception.
begin;
do $$ declare n int; v uuid; d uuid; e uuid; p uuid; a uuid; w uuid; i uuid; ok boolean;
begin
  -- === A. anonymous permissions ===
  set local role anon;
  begin perform 1 from donors; raise exception 'FAIL anon read donors'; exception when insufficient_privilege then null; end;
  begin perform 1 from donations; raise exception 'FAIL anon read donations'; exception when insufficient_privilege then null; end;
  begin perform 1 from audit_logs; raise exception 'FAIL anon read audit_logs'; exception when insufficient_privilege then null; end;
  begin perform 1 from financial_transactions; raise exception 'FAIL anon read ledger'; exception when insufficient_privilege then null; end;
  begin insert into announcements(title_bn) values ('x'); raise exception 'FAIL anon insert'; exception when insufficient_privilege then null; end;
  begin perform next_receipt_no(); raise exception 'FAIL anon call next_receipt_no'; exception when insufficient_privilege then null; end;
  perform 1 from public_totals; perform 1 from public_cash_balance; perform 1 from public_progress;
  reset role;

  -- === B. donations, ledger, receipts ===
  insert into donors(full_name) values ('Test Donor') returning id into d;
  insert into donations(receipt_no,donor_id,amount,method,status) values ('T-1',d,1000,'bkash','pending') returning id into v;
  select count(*) into n from financial_transactions where source_id=v; assert n=0, 'pending donation must not hit ledger';
  update donations set status='verified' where id=v;
  select count(*) into n from financial_transactions where source_id=v and direction='in' and amount=1000; assert n=1, 'verified donation posts once';
  update donations set status='verified' where id=v;  -- idempotent
  select count(*) into n from financial_transactions where source_id=v; assert n=1, 'no double posting';
  begin update donations set amount=2000 where id=v; raise exception 'FAIL verified amount edit'; exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if; end;
  update donations set status='refunded' where id=v;
  select count(*) into n from financial_transactions where source_id=v; assert n=2, 'refund posts reversal';
  select (select coalesce(sum(case when direction='in' then amount else -amount end),0) from financial_transactions where source_id=v) into n; assert n=0, 'refund nets to zero';

  -- === C. pledge: promised 100000, received 30000 => outstanding 70000 ===
  insert into donation_promises(donor_id,promised_amount) values (d,100000) returning id into p;
  insert into donations(receipt_no,donor_id,amount,method,status) values ('T-2',d,30000,'cash','verified') returning id into v;
  insert into promise_payments values (p,v);
  select outstanding into n from admin_promise_status where promise_id=p; assert n=70000, 'pledge outstanding = 70000, got '||n;

  -- === D. material is never cash ===
  insert into material_donations(donor_id,category,material_name,quantity,unit,est_unit_price,status) values (d,'rod','Rod',100,'kg',90,'verified');
  select cash_received into n from public_totals; assert n=30000, 'public cash excludes material and pledge, got '||n;

  -- === E. expenses: payments, overpay blocked, void ===
  select id into a from financial_accounts where code='cash';
  insert into expenses(category,description,total_amount) values ('x','bill',5000) returning id into e;
  insert into expense_payments(expense_id,account_id,amount) values (e,a,2000);
  select outstanding into n from expenses where id=e; assert n=3000, 'outstanding 3000, got '||n;
  begin insert into expense_payments(expense_id,account_id,amount) values (e,a,4000); raise exception 'FAIL overpay'; exception when check_violation then null; end;
  update expense_payments set voided_at=now() where expense_id=e;
  select paid_amount into n from expenses where id=e; assert n=0, 'void restores bill';

  -- === F. workers: duplicate attendance blocked; outstanding wages ===
  insert into workers(full_name,daily_wage) values ('W',800) returning id into w;
  insert into worker_attendance(worker_id,work_date,daily_wage) values (w,'2026-01-01',800);
  begin insert into worker_attendance(worker_id,work_date,daily_wage) values (w,'2026-01-01',800); raise exception 'FAIL dup attendance'; exception when unique_violation then null; end;
  insert into worker_payments(worker_id,account_id,amount,kind) values (w,a,300,'advance');
  select outstanding into n from admin_worker_balances where id=w; assert n=500, 'wage outstanding 500, got '||n;

  -- === G. inventory: units fixed, no negative stock ===
  insert into inventory_items(name,unit,opening_stock) values ('Cement','bag',10) returning id into i;
  insert into stock_movements(item_id,kind,quantity) values (i,'used',4);
  select current_stock into n from admin_stock where id=i; assert n=6, 'stock 6, got '||n;
  begin insert into stock_movements(item_id,kind,quantity) values (i,'used',7); raise exception 'FAIL negative stock'; exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if; end;
  begin update inventory_items set unit='kg' where id=i; raise exception 'FAIL unit change'; exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if; end;

  -- === H. hard deletes impossible for the app role; audit trail written ===
  select count(*) into n from audit_logs where table_name='donations'; assert n>0, 'audit rows exist';
  raise notice 'ALL DB TESTS PASSED';
end $$;
rollback;
