-- RampDesk schema (Phase 1). Run once in the Supabase SQL editor.

-- ============ ENUMS ============
create type member_role   as enum ('owner','reception','mechanic');
create type booking_status as enum ('booked','confirmed','arrived','cancelled','no_show');
create type job_status    as enum ('checked_in','in_progress','awaiting_parts','awaiting_approval','complete','collected');
create type line_type     as enum ('labour','part','fee');
create type approval_status as enum ('not_required','pending','approved','declined');
create type invoice_status as enum ('draft','issued','part_paid','paid','void');
create type pay_method    as enum ('cash','card','transfer','stripe');

-- ============ TENANTS ============
create table garages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  custom_domain text unique,
  logo_url text,
  brand_colour text,
  address text, phone text, email text,
  labour_rate_pence int not null default 0,
  vat_registered boolean not null default false,
  vat_number text,
  vat_effective_from date,
  default_vat_rate numeric(5,2) not null default 20.00,
  invoice_prefix text not null default 'INV-',
  next_invoice_number int not null default 1,
  payment_terms_days int not null default 0,
  invoice_terms text,
  plan_status text not null default 'trial',
  created_at timestamptz not null default now()
);

create table garage_members (
  garage_id uuid references garages on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role member_role not null,
  display_name text not null,
  active boolean not null default true,
  primary key (garage_id, user_id)
);

create table bays (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  name text not null,
  sort_order int default 0
);

-- ============ CUSTOMERS & VEHICLES ============
create table customers (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  name text not null,
  phone text, email text, address text, postcode text,
  reminder_consent boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  customer_id uuid references customers on delete set null,
  registration text not null,
  make text, model text, colour text, fuel_type text,
  year_of_manufacture int, vin text,
  mot_due date, tax_status text, tax_due date,
  last_mileage int,
  dvla_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (garage_id, registration)
);

-- ============ DIARY ============
create table bookings (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  customer_id uuid references customers on delete set null,
  vehicle_id uuid references vehicles on delete set null,
  service_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  bay_id uuid references bays on delete set null,
  mechanic_id uuid references auth.users,
  status booking_status not null default 'booked',
  source text not null default 'phone',
  notes text,
  created_at timestamptz not null default now()
);

-- ============ JOB CARDS ============
create table jobs (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  booking_id uuid references bookings on delete set null,
  customer_id uuid references customers on delete set null,
  vehicle_id uuid references vehicles on delete set null,
  job_number int not null,
  status job_status not null default 'checked_in',
  mileage_in int,
  assigned_to uuid references auth.users,
  customer_complaint text,
  mechanic_notes text,
  approval_token uuid default gen_random_uuid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (garage_id, job_number)
);

create table job_lines (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  job_id uuid not null references jobs on delete cascade,
  type line_type not null,
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_price_pence int not null,
  approval approval_status not null default 'not_required',
  sort_order int default 0
);

-- ============ INVOICES ============
create table invoices (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  job_id uuid references jobs on delete set null,
  customer_id uuid references customers on delete set null,
  number text not null,
  issued_at date not null default current_date,
  due_at date,
  is_vat_invoice boolean not null,
  vat_number text,
  subtotal_pence int not null default 0,
  vat_pence int not null default 0,
  total_pence int not null default 0,
  status invoice_status not null default 'draft',
  created_at timestamptz not null default now(),
  unique (garage_id, number)
);

create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  invoice_id uuid not null references invoices on delete cascade,
  type line_type not null,
  description text not null,
  quantity numeric(10,2) not null,
  unit_price_pence int not null,
  vat_rate numeric(5,2) not null default 0,
  line_total_pence int not null
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  invoice_id uuid not null references invoices on delete cascade,
  amount_pence int not null,
  method pay_method not null,
  paid_at timestamptz not null default now(),
  reference text
);

-- ============ INDEXES ============
create index on vehicles (garage_id, registration);
create index on vehicles (garage_id, mot_due);
create index on bookings (garage_id, starts_at);
create index on jobs (garage_id, status);
create index on invoices (garage_id, status);

-- ============ ROW LEVEL SECURITY ============
create or replace function is_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from garage_members
    where garage_id = g and user_id = auth.uid() and active);
$$;

create or replace function has_role(g uuid, roles member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from garage_members
    where garage_id = g and user_id = auth.uid() and active and role = any(roles));
$$;

alter table garages enable row level security;
create policy garage_read   on garages for select using (is_member(id));
create policy garage_update on garages for update using (has_role(id, '{owner}'));

alter table garage_members enable row level security;
create policy members_read  on garage_members for select using (is_member(garage_id));
create policy members_write on garage_members for all
  using (has_role(garage_id, '{owner}')) with check (has_role(garage_id, '{owner}'));

do $$
declare t text;
begin
  foreach t in array array['bays','customers','vehicles','bookings','jobs',
                           'job_lines','invoices','invoice_lines','payments']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_all on %I for all using (is_member(garage_id)) with check (is_member(garage_id))', t);
  end loop;
end $$;

-- ============ NUMBERING ============
create or replace function next_invoice_number(g uuid) returns text
language plpgsql security definer set search_path = public as $$
declare n int; p text;
begin
  if not is_member(g) then raise exception 'not allowed'; end if;
  update garages set next_invoice_number = next_invoice_number + 1
    where id = g returning next_invoice_number - 1, invoice_prefix into n, p;
  return p || lpad(n::text, 5, '0');
end $$;

create or replace function next_job_number(g uuid) returns int
language sql security definer set search_path = public as $$
  select coalesce(max(job_number), 0) + 1 from jobs where garage_id = g;
$$;

-- ============ VAT DECISION AT ISSUE ============
create or replace function garage_vat_applies(g uuid, on_date date) returns boolean
language sql stable as $$
  select vat_registered and vat_effective_from is not null and on_date >= vat_effective_from
  from garages where id = g;
$$;
