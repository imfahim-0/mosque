-- 002_donations.sql | Phase 2 | run AFTER 001

-- Unique, gap-tolerant receipt numbers: R-2026-00001
create sequence receipt_seq;
create function next_receipt_no() returns text language sql security definer set search_path = public as
$$ select 'R-' || to_char(now(),'YYYY') || '-' || lpad(nextval('receipt_seq')::text, 5, '0') $$;
grant execute on function next_receipt_no() to authenticated;
alter table donations alter column receipt_no set default next_receipt_no();

-- A verified donation's money cannot be silently edited. To correct it: mark 'refunded' and add a new record.
create function guard_verified_donation() returns trigger language plpgsql as $$
begin
  if old.status = 'verified' and (new.amount <> old.amount or new.donor_id <> old.donor_id
     or new.receipt_no <> old.receipt_no or new.donation_date <> old.donation_date)
     and new.status = 'verified' then
    raise exception 'Verified donation cannot be changed. Mark it refunded and create a new record.';
  end if;
  return new;
end $$;
create trigger trg_guard_verified before update on donations for each row execute function guard_verified_donation();

-- A donation can pay only ONE promise, and only a promise of the same donor.
alter table promise_payments add constraint one_promise_per_donation unique (donation_id);
create function check_promise_link() returns trigger language plpgsql as $$
begin
  if (select donor_id from donation_promises where id = new.promise_id)
     is distinct from (select donor_id from donations where id = new.donation_id) then
    raise exception 'Donation and promise belong to different donors.';
  end if;
  return new;
end $$;
create trigger trg_check_link before insert on promise_payments for each row execute function check_promise_link();

-- Admin-only computed views (security_invoker => RLS applies; anon has no access)
create view admin_donor_totals with (security_invoker = true) as
select dn.id as donor_id,
  coalesce((select sum(amount) from donations d where d.donor_id=dn.id and d.status='verified' and d.deleted_at is null),0) as cash_total,
  coalesce((select sum(est_value) from material_donations m where m.donor_id=dn.id and m.status='verified' and m.deleted_at is null),0) as material_total
from donors dn;

create view admin_promise_status with (security_invoker = true) as
select p.id as promise_id,
  coalesce(sum(d.amount) filter (where d.status='verified' and d.deleted_at is null),0) as received,
  greatest(p.promised_amount - coalesce(sum(d.amount) filter (where d.status='verified' and d.deleted_at is null),0),0) as outstanding
from donation_promises p
left join promise_payments pp on pp.promise_id=p.id
left join donations d on d.id=pp.donation_id
group by p.id;

grant select on admin_donor_totals, admin_promise_status to authenticated;
