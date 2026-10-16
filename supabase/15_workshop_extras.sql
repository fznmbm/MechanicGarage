-- RampDesk: service menu, declined-work follow-up, automatic emails, signatures,
-- courtesy cars and customer feedback (the last two are optional features). Run once after 14.

-- ---------- Feature switches and email settings ----------
alter table garages add column if not exists notify_booking_email boolean not null default true;
alter table garages add column if not exists notify_ready_email boolean not null default true;
alter table garages add column if not exists feature_courtesy_cars boolean not null default false;
alter table garages add column if not exists feature_feedback boolean not null default false;
alter table garages add column if not exists feedback_auto_email boolean not null default true;
alter table garages add column if not exists google_review_url text;
alter table garages add column if not exists authorisation_text text;
grant update (notify_booking_email, notify_ready_email, feature_courtesy_cars, feature_feedback, feedback_auto_email,
              google_review_url, authorisation_text) on garages to authenticated;

-- Public contact details for emails sent after an online booking (same details the booking page shows)
create or replace function garage_contact(p_garage uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', name, 'phone', phone, 'email', email, 'address', address, 'postcode', postcode,
    'brand_colour', brand_colour, 'logo_url', logo_url, 'notify_booking_email', notify_booking_email)
  from garages where id = p_garage and online_booking_enabled;
$$;
revoke execute on function garage_contact from public;
grant execute on function garage_contact to anon, authenticated;

-- ---------- Service menu (preset jobs) ----------
create table if not exists service_menu (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  name text not null check (length(name) between 1 and 80),
  lines jsonb not null default '[]'::jsonb,   -- [{type, description, quantity, unit_price_pence, no_vat}]
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists service_menu_garage on service_menu (garage_id, sort_order);
alter table service_menu enable row level security;
drop policy if exists service_menu_read on service_menu;
drop policy if exists service_menu_write on service_menu;
create policy service_menu_read on service_menu for select using (is_member(garage_id));
create policy service_menu_write on service_menu for all
  using (has_role(garage_id, '{owner,reception}')) with check (has_role(garage_id, '{owner,reception}'));

-- ---------- Declined work follow-up ----------
alter table job_lines add column if not exists followed_up_at timestamptz;
create index if not exists job_lines_declined on job_lines (garage_id) where approval = 'declined' and followed_up_at is null;

-- ---------- Customer signatures (check-in authorisation and collection) ----------
create table if not exists job_signatures (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  job_id uuid not null references jobs on delete cascade,
  kind text not null check (kind in ('check_in', 'collection')),
  signer_name text not null,
  statement text not null,
  path text not null,                         -- PNG in the private job-photos bucket
  signed_at timestamptz not null default now(),
  taken_by uuid references auth.users on delete set null default auth.uid()
);
create index if not exists job_signatures_job on job_signatures (job_id);
alter table job_signatures enable row level security;
drop policy if exists job_signatures_read on job_signatures;
drop policy if exists job_signatures_insert on job_signatures;
drop policy if exists job_signatures_delete on job_signatures;
create policy job_signatures_read on job_signatures for select using (is_member(garage_id));
create policy job_signatures_insert on job_signatures for insert with check (is_member(garage_id));
create policy job_signatures_delete on job_signatures for delete using (has_role(garage_id, '{owner,reception}'));

-- ---------- Courtesy cars (optional) ----------
create table if not exists courtesy_cars (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  registration text not null,
  description text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (garage_id, registration)
);
create table if not exists courtesy_loans (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  car_id uuid not null references courtesy_cars on delete cascade,
  job_id uuid references jobs on delete set null,
  customer_id uuid references customers on delete set null,
  out_at timestamptz not null default now(),
  due_back_at timestamptz,
  returned_at timestamptz,
  mileage_out int, mileage_in int,
  fuel_out text, fuel_in text,
  licence_checked boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create unique index if not exists courtesy_one_open_loan on courtesy_loans (car_id) where returned_at is null;
create index if not exists courtesy_loans_garage on courtesy_loans (garage_id, out_at desc);
alter table courtesy_cars enable row level security;
alter table courtesy_loans enable row level security;
drop policy if exists courtesy_cars_read on courtesy_cars;
drop policy if exists courtesy_cars_write on courtesy_cars;
drop policy if exists courtesy_loans_read on courtesy_loans;
drop policy if exists courtesy_loans_write on courtesy_loans;
create policy courtesy_cars_read on courtesy_cars for select using (is_member(garage_id));
create policy courtesy_cars_write on courtesy_cars for all
  using (has_role(garage_id, '{owner,reception}')) with check (has_role(garage_id, '{owner,reception}'));
create policy courtesy_loans_read on courtesy_loans for select using (is_member(garage_id));
create policy courtesy_loans_write on courtesy_loans for all
  using (has_role(garage_id, '{owner,reception}')) with check (has_role(garage_id, '{owner,reception}'));

-- ---------- Customer feedback and Google reviews (optional) ----------
create table if not exists job_feedback (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  job_id uuid not null unique references jobs on delete cascade,
  customer_id uuid references customers on delete set null,
  token uuid not null unique default gen_random_uuid(),
  sent_at timestamptz,
  score int check (score between 1 and 5),
  comment text,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists job_feedback_garage on job_feedback (garage_id, responded_at desc);
alter table job_feedback enable row level security;
drop policy if exists job_feedback_read on job_feedback;
drop policy if exists job_feedback_insert on job_feedback;
drop policy if exists job_feedback_update on job_feedback;
create policy job_feedback_read on job_feedback for select using (has_role(garage_id, '{owner,reception}'));
create policy job_feedback_insert on job_feedback for insert with check (is_member(garage_id));
-- staff may only mark it sent; answers come through feedback_submit()
revoke update on job_feedback from anon, authenticated;
grant update (sent_at) on job_feedback to authenticated;
create policy job_feedback_update on job_feedback for update using (is_member(garage_id)) with check (is_member(garage_id));

create or replace function feedback_page(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'garage', jsonb_build_object('name', g.name, 'logo_url', g.logo_url, 'brand_colour', g.brand_colour, 'phone', g.phone,
      'google_review_url', case when g.google_review_url ~ '^https://' then g.google_review_url end),
    'vehicle', (select jsonb_build_object('registration', v.registration, 'make', v.make, 'model', v.model)
                from jobs j join vehicles v on v.id = j.vehicle_id where j.id = f.job_id),
    'first_name', (select split_part(c.name, ' ', 1) from customers c where c.id = f.customer_id),
    'score', f.score, 'answered', f.responded_at is not null)
  from job_feedback f join garages g on g.id = f.garage_id
  where f.token = p_token and g.feature_feedback;
$$;
revoke execute on function feedback_page from public;
grant execute on function feedback_page to anon, authenticated;

create or replace function feedback_submit(p_token uuid, p_score int, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
declare f job_feedback;
begin
  if p_score is null or p_score < 1 or p_score > 5 then raise exception 'Please choose a score'; end if;
  select * into f from job_feedback where token = p_token;
  if not found then raise exception 'This link is not valid'; end if;
  if f.created_at < now() - interval '90 days' then raise exception 'This link has expired'; end if;
  update job_feedback set score = p_score, comment = nullif(left(trim(coalesce(p_comment, '')), 2000), ''), responded_at = now()
   where id = f.id;
end $$;
revoke execute on function feedback_submit from public;
grant execute on function feedback_submit to anon, authenticated;

create or replace function feedback_summary(p_garage uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_role(p_garage, '{owner,reception}') then raise exception 'Not allowed'; end if;
  return (select jsonb_build_object('sent', count(*) filter (where sent_at is not null), 'count', count(score),
      'average', round(avg(score)::numeric, 1), 'low', count(*) filter (where score <= 2))
    from job_feedback where garage_id = p_garage
      and created_at >= p_from::timestamp at time zone 'Europe/London'
      and created_at < (p_to + 1)::timestamp at time zone 'Europe/London');
end $$;
revoke execute on function feedback_summary from public, anon;
grant execute on function feedback_summary to authenticated;

-- The feedback link for a job (any staff member, so a mechanic marking a car collected can send it)
create or replace function feedback_token(p_job uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select f.token from job_feedback f where f.job_id = p_job and is_member(f.garage_id);
$$;
revoke execute on function feedback_token from public, anon;
grant execute on function feedback_token to authenticated;
