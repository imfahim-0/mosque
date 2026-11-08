-- 009 | run after 008 (before 006). Public pledge list, donation-instruction pictures/QR, signature settings.

-- 1) Pledges are shown publicly ONLY after the admin approves each one.
alter table donation_promises add column is_public boolean not null default false;

create view public_pledges as
select p.id, p.promise_date,
  case when dn.public_display = 'anonymous' or dn.category = 'anonymous' then null else dn.full_name end as display_name,
  p.promised_amount,
  coalesce((select sum(d.amount) from promise_payments pp join donations d on d.id = pp.donation_id
            where pp.promise_id = p.id and d.status = 'verified' and d.deleted_at is null), 0) as received_amount,
  p.promised_material, p.promised_quantity, p.promised_unit,
  coalesce((select sum(m.quantity) from material_donations m
            where m.promise_id = p.id and m.status = 'verified' and m.deleted_at is null), 0) as received_quantity
from donation_promises p join donors dn on dn.id = p.donor_id
where p.is_public and p.deleted_at is null and p.status <> 'cancelled';     -- no phone, address or notes

-- 2) Pictures / QR codes for "How to donate" live in the public gallery bucket under category 'donation'.
alter table project_gallery drop constraint project_gallery_category_check;
alter table project_gallery add constraint project_gallery_category_check
  check (category in ('old_mosque','proposed','design','demolition','foundation','construction','interior','exterior','final','donation'));
create or replace view public_gallery as
  select id, category, title, storage_path, created_at from project_gallery where is_public and deleted_at is null and category <> 'donation';
create view public_donation_images as
  select id, title, storage_path, created_at from project_gallery where is_public and deleted_at is null and category = 'donation';

-- 3) Settings rows the admin screens edit (empty until you fill them; nothing invented).
insert into site_settings(key, value_bn, value_en, is_public) values
  ('payment_instructions', null, null, true),
  ('sig_treasurer', null, null, false), ('sig_secretary', null, null, false), ('sig_president', null, null, false)
on conflict (key) do nothing;

grant select on public_pledges, public_donation_images, public_gallery to anon, authenticated;
