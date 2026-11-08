-- 008 | run after 001-005 and 007 (before 006). In-kind pledges: "1000 bricks, 1 ton rod, 5 bags cement".
alter table donation_promises add column promised_unit text
  check (promised_unit in ('kg','ton','bag','piece','cft','sft','meter','bundle','trip','litre','other'));
alter table material_donations add column promise_id uuid references donation_promises(id);

-- A material donation can only be linked to a promise made by the SAME donor.
create function check_material_promise() returns trigger language plpgsql as $$
begin
  if new.promise_id is not null and (select donor_id from donation_promises where id = new.promise_id) is distinct from new.donor_id then
    raise exception 'Material donation and promise belong to different donors.'; end if;
  return new;
end $$;
create trigger trg_check_mat_promise before insert or update on material_donations for each row execute function check_material_promise();

-- Pledge status now looks at BOTH cash and materials (verified only). Never typed by hand.
create or replace view admin_promise_status with (security_invoker = true) as
with r as (
  select p.id, p.promised_amount, p.promised_quantity, p.status,
    coalesce((select sum(d.amount) from promise_payments pp join donations d on d.id = pp.donation_id
              where pp.promise_id = p.id and d.status = 'verified' and d.deleted_at is null), 0) as received,
    coalesce((select sum(m.quantity) from material_donations m
              where m.promise_id = p.id and m.status = 'verified' and m.deleted_at is null), 0) as mat_received
  from donation_promises p)
select id as promise_id, received, greatest(promised_amount - received, 0) as outstanding,
  case when status = 'cancelled' then 'cancelled'
       when (promised_amount > 0 or coalesce(promised_quantity,0) > 0)
            and (promised_amount = 0 or received >= promised_amount)
            and (coalesce(promised_quantity,0) = 0 or mat_received >= promised_quantity) then 'fulfilled'
       when received > 0 or mat_received > 0 then 'partial'
       when status = 'follow_up' then 'follow_up'
       else 'promised' end as derived_status,
  mat_received as material_received,
  greatest(coalesce(promised_quantity,0) - mat_received, 0) as material_outstanding
from r;
grant select on admin_promise_status to authenticated;
