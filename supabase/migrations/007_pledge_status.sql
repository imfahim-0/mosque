-- 007 | run after 001-006. Pledge status is now DERIVED from verified payments (never typed).
create or replace view admin_promise_status with (security_invoker = true) as
with r as (
  select p.id, p.promised_amount, p.status,
    coalesce(sum(d.amount) filter (where d.status='verified' and d.deleted_at is null),0) as received
  from donation_promises p
  left join promise_payments pp on pp.promise_id = p.id
  left join donations d on d.id = pp.donation_id
  group by p.id)
select id as promise_id, received, greatest(promised_amount - received, 0) as outstanding,
  case when status = 'cancelled' then 'cancelled'
       when promised_amount > 0 and received >= promised_amount then 'fulfilled'
       when received > 0 then 'partial'
       when status = 'follow_up' then 'follow_up'
       else 'promised' end as derived_status
from r;
grant select on admin_promise_status to authenticated;
