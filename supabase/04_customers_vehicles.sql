-- RampDesk: Customers & Vehicles. Run once after 01–03.

-- Extra vehicle data from DVSA/DVLA lookups
alter table vehicles add column if not exists engine_size int;              -- cc
alter table vehicles add column if not exists first_registered date;
alter table vehicles add column if not exists has_outstanding_recall boolean;
alter table vehicles add column if not exists mot_history jsonb;            -- cached DVSA tests
alter table vehicles add column if not exists mot_checked_at timestamptz;
alter table vehicles add column if not exists notes text;

-- Customers: reminder consent date (GDPR record)
alter table customers add column if not exists consent_at timestamptz;

-- Everyone in the garage can view/add/edit; only owner + reception can delete
drop policy if exists tenant_all on customers;
create policy customers_read   on customers for select using (is_member(garage_id));
create policy customers_insert on customers for insert with check (is_member(garage_id));
create policy customers_update on customers for update using (is_member(garage_id)) with check (is_member(garage_id));
create policy customers_delete on customers for delete using (has_role(garage_id, '{owner,reception}'));

drop policy if exists tenant_all on vehicles;
create policy vehicles_read   on vehicles for select using (is_member(garage_id));
create policy vehicles_insert on vehicles for insert with check (is_member(garage_id));
create policy vehicles_update on vehicles for update using (is_member(garage_id)) with check (is_member(garage_id));
create policy vehicles_delete on vehicles for delete using (has_role(garage_id, '{owner,reception}'));

create index if not exists customers_garage_name on customers (garage_id, lower(name));
create index if not exists vehicles_garage_customer on vehicles (garage_id, customer_id);
