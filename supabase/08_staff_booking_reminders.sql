-- RampDesk: staff invites, online booking, reminders. Run once after 01–07.

-- =====================================================================
-- Garage settings for these features
-- =====================================================================
alter table garages add column if not exists open_days int[] not null default '{1,2,3,4,5,6}'; -- ISO: 1=Mon … 7=Sun
alter table garages add column if not exists online_booking_enabled boolean not null default false;
alter table garages add column if not exists booking_lead_hours int not null default 2;
alter table garages add column if not exists booking_days_ahead int not null default 30;
alter table garages add column if not exists booking_message text;
alter table garages add column if not exists payment_link_url text;
alter table garages add column if not exists reminders_enabled boolean not null default false;
alter table garages add column if not exists mot_reminder_days int[] not null default '{30,7}';
alter table garages add column if not exists service_reminder_days int not null default 14;
grant update (open_days, online_booking_enabled, booking_lead_hours, booking_days_ahead, booking_message,
              payment_link_url, reminders_enabled, mot_reminder_days, service_reminder_days)
  on garages to authenticated;

-- =====================================================================
-- Staff
-- =====================================================================
alter table garage_members add column if not exists email text;
alter table garage_members add column if not exists created_at timestamptz not null default now();
update garage_members gm set email = u.email from auth.users u where u.id = gm.user_id and gm.email is null;

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  email text,
  display_name text not null,
  role member_role not null,
  token uuid not null unique default gen_random_uuid(),
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users
);
alter table invites enable row level security;
create policy invites_owner on invites for all
  using (has_role(garage_id, '{owner}')) with check (has_role(garage_id, '{owner}'));

create or replace function invite_info(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('garage', g.name, 'slug', g.slug, 'logo_url', g.logo_url, 'brand_colour', g.brand_colour,
    'role', i.role, 'display_name', i.display_name, 'email', i.email,
    'expired', i.expires_at < now(), 'accepted', i.accepted_at is not null)
  from invites i join garages g on g.id = i.garage_id where i.token = p_token;
$$;
revoke execute on function invite_info from public;
grant execute on function invite_info to anon, authenticated;

create or replace function accept_invite(p_token uuid) returns text
language plpgsql security definer set search_path = public as $$
declare i invites; slug text; em text;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select * into i from invites where token = p_token for update;
  if not found then raise exception 'This invite link is not valid'; end if;
  if i.accepted_at is not null then raise exception 'This invite has already been used'; end if;
  if i.expires_at < now() then raise exception 'This invite has expired. Ask for a new one.'; end if;
  select email into em from auth.users where id = auth.uid();
  insert into garage_members (garage_id, user_id, role, display_name, active, email)
  values (i.garage_id, auth.uid(), i.role, i.display_name, true, em)
  on conflict (garage_id, user_id) do update set role = excluded.role, active = true, display_name = excluded.display_name, email = excluded.email;
  update invites set accepted_at = now(), accepted_by = auth.uid() where id = i.id;
  select g.slug into slug from garages g where g.id = i.garage_id;
  return slug;
end $$;
revoke execute on function accept_invite from public, anon;
grant execute on function accept_invite to authenticated;

-- owners keep their email on file too
create or replace function sync_member_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is null then select email into new.email from auth.users where id = new.user_id; end if;
  return new;
end $$;
drop trigger if exists garage_members_email on garage_members;
create trigger garage_members_email before insert on garage_members for each row execute function sync_member_email();

-- =====================================================================
-- Online booking
-- =====================================================================
create table if not exists online_services (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  name text not null,
  duration_minutes int not null check (duration_minutes between 15 and 600),
  price_from_pence int,
  description text,
  active boolean not null default true,
  sort_order int not null default 0
);
alter table online_services enable row level security;
create policy online_services_read on online_services for select using (is_member(garage_id));
create policy online_services_write on online_services for all
  using (has_role(garage_id, '{owner}')) with check (has_role(garage_id, '{owner}'));

-- Public: garage + services for the booking page
create or replace function booking_page(p_slug text default null, p_host text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'garage', jsonb_build_object('id', g.id, 'name', g.name, 'slug', g.slug, 'logo_url', g.logo_url, 'brand_colour', g.brand_colour,
      'phone', g.phone, 'email', g.email, 'address', g.address, 'postcode', g.postcode,
      'opening_time', to_char(g.opening_time, 'HH24:MI'), 'closing_time', to_char(g.closing_time, 'HH24:MI'),
      'open_days', g.open_days, 'lead_hours', g.booking_lead_hours, 'days_ahead', g.booking_days_ahead,
      'message', g.booking_message, 'enabled', g.online_booking_enabled),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'duration', s.duration_minutes,
      'price_from', s.price_from_pence, 'description', s.description) order by s.sort_order, s.name)
      from online_services s where s.garage_id = g.id and s.active), '[]'::jsonb))
  from garages g
  where (p_slug is not null and g.slug = p_slug) or (p_host is not null and g.custom_domain = p_host)
  limit 1;
$$;
revoke execute on function booking_page from public;
grant execute on function booking_page to anon, authenticated;

-- Free start times (HH:MM) on a date for a given duration
create or replace function booking_slots(p_garage uuid, p_date date, p_duration int) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare g garages; t time; s timestamptz; e timestamptz; out text[] := '{}'; nbays int; m int; close_m int;
begin
  select * into g from garages where id = p_garage;
  if not found or not g.online_booking_enabled then return out; end if;
  if p_duration is null or p_duration < 15 or p_duration > 600 then return out; end if;
  if p_date < (now() at time zone 'Europe/London')::date or p_date > (now() at time zone 'Europe/London')::date + g.booking_days_ahead then return out; end if;
  if not (extract(isodow from p_date)::int = any (g.open_days)) then return out; end if;
  select count(*) into nbays from bays where garage_id = p_garage;

  m := extract(hour from g.opening_time)::int * 60 + extract(minute from g.opening_time)::int;
  close_m := extract(hour from g.closing_time)::int * 60 + extract(minute from g.closing_time)::int;
  while m + p_duration <= close_m loop
    t := make_time(m / 60, m % 60, 0);
    s := (p_date + t) at time zone 'Europe/London';
    e := s + make_interval(mins => p_duration);
    if s >= now() + make_interval(hours => g.booking_lead_hours) then
      if nbays = 0 then
        if not exists (select 1 from bookings b where b.garage_id = p_garage and b.status in ('booked','confirmed','arrived')
                       and b.starts_at < e and b.ends_at > s) then out := out || to_char(t, 'HH24:MI'); end if;
      elsif exists (select 1 from bays y where y.garage_id = p_garage and not exists (
                      select 1 from bookings b where b.bay_id = y.id and b.status in ('booked','confirmed','arrived')
                      and b.starts_at < e and b.ends_at > s)) then
        out := out || to_char(t, 'HH24:MI');
      end if;
    end if;
    m := m + 30;
  end loop;
  return out;
end $$;
revoke execute on function booking_slots from public;
grant execute on function booking_slots to anon, authenticated;

create or replace function create_online_booking(
  p_garage uuid, p_service uuid, p_date date, p_time text, p_reg text, p_name text, p_phone text,
  p_email text, p_notes text, p_consent boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
declare g garages; sv online_services; s timestamptz; e timestamptz; reg text; ph text; cust uuid; veh uuid; bay uuid; bk uuid;
begin
  select * into g from garages where id = p_garage;
  if not found or not g.online_booking_enabled then raise exception 'Online booking is not available'; end if;
  select * into sv from online_services where id = p_service and garage_id = p_garage and active;
  if not found then raise exception 'Please choose a service'; end if;

  reg := upper(regexp_replace(coalesce(p_reg, ''), '[^A-Za-z0-9]', '', 'g'));
  ph := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  if length(reg) < 2 or length(reg) > 8 then raise exception 'Please enter a valid registration'; end if;
  if length(coalesce(trim(p_name), '')) < 2 or length(p_name) > 100 then raise exception 'Please enter your name'; end if;
  if length(ph) < 10 or length(ph) > 15 then raise exception 'Please enter a valid phone number'; end if;
  if p_email is not null and p_email <> '' and p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Please enter a valid email'; end if;
  if length(coalesce(p_notes, '')) > 1000 then raise exception 'Notes are too long'; end if;
  if not (p_time = any (booking_slots(p_garage, p_date, sv.duration_minutes))) then
    raise exception 'Sorry, that time has just been taken. Please pick another.';
  end if;
  -- simple abuse limits
  if (select count(*) from bookings b join customers c on c.id = b.customer_id
      where b.garage_id = p_garage and b.source = 'online' and regexp_replace(coalesce(c.phone,''), '[^0-9+]', '', 'g') = ph
      and b.created_at > now() - interval '1 day') >= 3 then
    raise exception 'You already have bookings with us today. Please call us to book more.';
  end if;
  if (select count(*) from bookings where garage_id = p_garage and source = 'online' and created_at > now() - interval '1 day') >= 60 then
    raise exception 'Online booking is busy right now. Please call us.';
  end if;

  s := (p_date + p_time::time) at time zone 'Europe/London';
  e := s + make_interval(mins => sv.duration_minutes);

  select id into veh from vehicles where garage_id = p_garage and registration = reg;
  select customer_id into cust from vehicles where id = veh;
  if cust is null then
    select id into cust from customers where garage_id = p_garage
      and regexp_replace(coalesce(phone,''), '[^0-9+]', '', 'g') = ph order by created_at limit 1;
  end if;
  if cust is null then
    insert into customers (garage_id, name, phone, email, reminder_consent, consent_at)
    values (p_garage, trim(p_name), trim(p_phone), nullif(lower(trim(p_email)), ''), coalesce(p_consent, false),
            case when p_consent then now() end)
    returning id into cust;
  elsif p_consent then
    update customers set reminder_consent = true, consent_at = coalesce(consent_at, now()) where id = cust;
  end if;
  if veh is null then
    insert into vehicles (garage_id, customer_id, registration) values (p_garage, cust, reg) returning id into veh;
  elsif (select customer_id from vehicles where id = veh) is null then
    update vehicles set customer_id = cust where id = veh;
  end if;

  select y.id into bay from bays y where y.garage_id = p_garage and not exists (
    select 1 from bookings b where b.bay_id = y.id and b.status in ('booked','confirmed','arrived') and b.starts_at < e and b.ends_at > s)
    order by y.sort_order limit 1;

  insert into bookings (garage_id, customer_id, vehicle_id, service_type, starts_at, ends_at, bay_id, status, source, notes)
  values (p_garage, cust, veh, sv.name, s, e, bay, 'booked', 'online', nullif(trim(p_notes), ''))
  returning id into bk;

  return jsonb_build_object('reference', upper(substr(replace(bk::text, '-', ''), 1, 6)), 'starts_at', s, 'service', sv.name);
end $$;
revoke execute on function create_online_booking from public;
grant execute on function create_online_booking to anon, authenticated;

-- =====================================================================
-- Reminders
-- =====================================================================
alter table vehicles add column if not exists service_due date;
alter table customers add column if not exists unsubscribe_token uuid not null default gen_random_uuid();
create unique index if not exists customers_unsubscribe_token on customers (unsubscribe_token);
create index if not exists vehicles_garage_service_due on vehicles (garage_id, service_due);

create table if not exists reminder_log (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  vehicle_id uuid not null references vehicles on delete cascade,
  customer_id uuid references customers on delete set null,
  kind text not null check (kind in ('mot', 'service', 'advisory')),
  due_date date,
  stage int not null default 0,            -- days-before bucket for automatic emails; 0 = manual
  channel text not null check (channel in ('email', 'whatsapp', 'sms', 'phone', 'manual')),
  sent_at timestamptz not null default now(),
  sent_by uuid references auth.users default auth.uid()
);
create unique index if not exists reminder_log_auto_once on reminder_log (vehicle_id, kind, due_date, stage) where channel = 'email';
create index if not exists reminder_log_vehicle on reminder_log (vehicle_id, kind, sent_at desc);
alter table reminder_log enable row level security;
create policy reminder_log_all on reminder_log for all using (is_member(garage_id)) with check (is_member(garage_id));

create or replace function unsubscribe(p_token uuid) returns text
language plpgsql security definer set search_path = public as $$
declare gname text;
begin
  update customers set reminder_consent = false, consent_at = null where unsubscribe_token = p_token;
  select g.name into gname from customers c join garages g on g.id = c.garage_id where c.unsubscribe_token = p_token;
  return gname;
end $$;
revoke execute on function unsubscribe from public;
grant execute on function unsubscribe to anon, authenticated;
