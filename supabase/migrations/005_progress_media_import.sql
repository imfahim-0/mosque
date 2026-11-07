-- 005 | Phase 5 | run AFTER 001-004
create table construction_stages (
  id uuid primary key default gen_random_uuid(), seq int unique not null, name_bn text not null, name_en text not null,
  start_date date, expected_end date, actual_end date,
  progress_pct int not null default 0 check (progress_pct between 0 and 100),
  estimated_cost numeric(14,2) not null default 0 check (estimated_cost >= 0), actual_cost numeric(14,2) not null default 0 check (actual_cost >= 0),
  responsible text, notes text, is_public boolean not null default true, created_at timestamptz not null default now()
);
insert into construction_stages(seq,name_bn,name_en) values
 (1,'পুরাতন মসজিদের ছবি ও নথিভুক্তি','Existing mosque documentation'),(2,'ভাঙা (ডেমোলিশন)','Demolition'),(3,'সাইট পরিষ্কার','Site clearing'),
 (4,'খনন','Excavation'),(5,'ভিত্তি','Foundation'),(6,'পিলার ও কলাম','Pillars and columns'),(7,'নিচতলা','Ground floor'),(8,'দ্বিতীয় তলা (প্রযোজ্য হলে)','First floor (if applicable)'),
 (9,'ছাদ ঢালাই','Roof construction'),(10,'বৈদ্যুতিক কাজ','Electrical installation'),(11,'প্লাম্বিং','Plumbing'),(12,'মেঝে','Flooring'),(13,'দরজা-জানালা','Doors and windows'),
 (14,'রং','Painting'),(15,'ভেতরের ফিনিশিং','Interior finishing'),(16,'বাইরের ফিনিশিং','Exterior finishing'),(17,'পরিষ্কার-পরিচ্ছন্নতা','Cleaning'),
 (18,'চূড়ান্ত পরিদর্শন','Final inspection'),(19,'মসজিদ হস্তান্তর','Mosque handover');

create table project_gallery (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('old_mosque','proposed','design','demolition','foundation','construction','interior','exterior','final')),
  title text, storage_path text unique not null, is_public boolean not null default false,
  deleted_at timestamptz, created_at timestamptz not null default now()
);
create table project_documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('bill','invoice','receipt','contract','bank_slip','delivery_note','other')),
  title text, storage_path text unique not null, notes text, deleted_at timestamptz, created_at timestamptz not null default now()
);
create table import_logs (
  id uuid primary key default gen_random_uuid(), at timestamptz not null default now(), user_id uuid default auth.uid(),
  filename text, summary jsonb not null
);
do $$ declare t text; begin
  foreach t in array array['construction_stages','project_gallery','project_documents','import_logs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy adm_sel on %I for select to authenticated using (is_admin())', t);
    execute format('create policy adm_ins on %I for insert to authenticated with check (is_admin())', t);
    execute format('create trigger trg_audit after insert or update or delete on %I for each row execute function audit()', t);
  end loop;
  foreach t in array array['construction_stages','project_gallery','project_documents'] loop
    execute format('create policy adm_upd on %I for update to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- Public views (approved only)
create view public_progress as select seq, name_bn, name_en, progress_pct, start_date, expected_end, actual_end from construction_stages where is_public;
create view public_gallery as select id, category, title, storage_path, created_at from project_gallery where is_public and deleted_at is null;
create view public_monthly as
with d as (select to_char(donation_date,'YYYY-MM') m, sum(amount) a from donations where status='verified' and deleted_at is null group by 1),
     e as (select to_char(p.payment_date,'YYYY-MM') m, sum(p.amount) a from expense_payments p join expenses x on x.id=p.expense_id
           where p.voided_at is null and x.is_public and x.deleted_at is null group by 1)
select coalesce(d.m,e.m) as month, coalesce(d.a,0) as donations, coalesce(e.a,0) as expenses from d full join e on d.m=e.m order by 1;
revoke all on all tables in schema public from anon;
grant select on public_totals, public_cash_balance, public_recent_donations, public_material_summary, public_announcements, public_settings,
  public_progress, public_gallery, public_monthly to anon, authenticated;
grant select on admin_worker_balances, admin_stock, admin_donor_totals, admin_promise_status, admin_account_balances to authenticated;

-- Storage buckets. gallery = public-read (unguessable file names; only approved ones are listed). docs = private.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('public-gallery','public-gallery',true,2097152,array['image/jpeg','image/png','image/webp']),
 ('private-docs','private-docs',false,5242880,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy mosque_admin_storage on storage.objects for all to authenticated
  using (bucket_id in ('public-gallery','private-docs') and public.is_admin())
  with check (bucket_id in ('public-gallery','private-docs') and public.is_admin());
