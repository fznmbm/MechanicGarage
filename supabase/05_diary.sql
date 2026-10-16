-- RampDesk: Diary & bookings. Run once after 01–04.

-- Opening hours used by the diary grid
alter table garages add column if not exists opening_time time not null default '08:00';
alter table garages add column if not exists closing_time time not null default '18:00';
grant update (opening_time, closing_time) on garages to authenticated;

-- Bookings must end after they start
alter table bookings drop constraint if exists bookings_time_order;
alter table bookings add constraint bookings_time_order check (ends_at > starts_at);

create index if not exists bookings_garage_bay_time on bookings (garage_id, bay_id, starts_at);
create index if not exists bookings_garage_mechanic_time on bookings (garage_id, mechanic_id, starts_at);
create index if not exists bookings_vehicle on bookings (vehicle_id);

-- Mechanics can view and update bookings; only owner + reception can delete
drop policy if exists tenant_all on bookings;
create policy bookings_read   on bookings for select using (is_member(garage_id));
create policy bookings_insert on bookings for insert with check (is_member(garage_id));
create policy bookings_update on bookings for update using (is_member(garage_id)) with check (is_member(garage_id));
create policy bookings_delete on bookings for delete using (has_role(garage_id, '{owner,reception}'));
