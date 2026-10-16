-- IronBay: estimates (quotes), two-factor login enforcement and the activity log. Run once after 01–15.

-- =====================================================================
-- ESTIMATES
-- =====================================================================
alter table garages add column if not exists estimate_prefix text not null default 'EST-';
alter table garages add column if not exists next_estimate_number int not null default 1;
alter table garages add column if not exists estimate_valid_days int not null default 30;
alter table garages add column if not exists estimate_chase_days int not null default 3;   -- 0 = never chase
grant update (estimate_prefix, estimate_valid_days, estimate_chase_days) on garages to authenticated;

create table if not exists estimates (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  number text not null,
  customer_id uuid references customers on delete set null,
  vehicle_id uuid references vehicles on delete set null,
  title text,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined', 'converted')),
  issued_at date not null default (now() at time zone 'Europe/London')::date,
  valid_until date,
  public_token uuid not null unique default gen_random_uuid(),
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  accepted_by text,
  response_note text,
  chased_at timestamptz,
  job_id uuid references jobs on delete set null,
  created_by uuid references auth.users on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (garage_id, number)
);
create index if not exists estimates_garage on estimates (garage_id, created_at desc);
create index if not exists estimates_chase on estimates (status, sent_at) where status = 'sent';

create table if not exists estimate_lines (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  estimate_id uuid not null references estimates on delete cascade,
  type line_type not null,
  description text not null check (length(description) between 1 and 300),
  quantity numeric(10,2) not null check (quantity > 0),
  unit_price_pence int not null check (unit_price_pence >= 0),
  no_vat boolean not null default false,
  optional boolean not null default false,
  accepted boolean not null default true,
  part_number text,
  sort_order int not null default 0
);
create index if not exists estimate_lines_estimate on estimate_lines (estimate_id, sort_order);

alter table estimates enable row level security;
alter table estimate_lines enable row level security;
drop policy if exists estimates_staff on estimates;
drop policy if exists estimate_lines_staff on estimate_lines;
create policy estimates_staff on estimates for all
  using (has_role(garage_id, '{owner,reception}')) with check (has_role(garage_id, '{owner,reception}'));
create policy estimate_lines_staff on estimate_lines for all
  using (has_role(garage_id, '{owner,reception}')) with check (has_role(garage_id, '{owner,reception}'));

-- Next estimate number (staff only)
create or replace function claim_estimate_number(g uuid) returns text
language plpgsql security definer set search_path = public as $$
declare n int; p text;
begin
  if not has_role(g, '{owner,reception}') then raise exception 'Not allowed'; end if;
  update garages set next_estimate_number = next_estimate_number + 1 where id = g
    returning next_estimate_number - 1, estimate_prefix into n, p;
  return p || lpad(n::text, 5, '0');
end $$;
revoke execute on function claim_estimate_number from public, anon;
grant execute on function claim_estimate_number to authenticated;

-- Estimate in the same shape as an invoice document (shared screen layout and PDF)
create or replace function build_estimate_doc(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e estimates; g garages; c customers; v vehicles; vat_on boolean; rate numeric; net int; vatable int; vat int;
begin
  select * into e from estimates where id = p_id;
  if not found then return null; end if;
  select * into g from garages where id = e.garage_id;
  select * into c from customers where id = e.customer_id;
  select * into v from vehicles where id = e.vehicle_id;
  vat_on := g.vat_registered and g.vat_effective_from is not null and e.issued_at >= g.vat_effective_from;
  rate := case when vat_on then g.default_vat_rate else 0 end;
  select coalesce(sum(round(quantity * unit_price_pence)), 0),
         coalesce(sum(round(quantity * unit_price_pence)) filter (where not no_vat), 0)
    into net, vatable from estimate_lines where estimate_id = e.id and (not optional or accepted);
  vat := round(vatable * rate / 100)::int;
  return jsonb_build_object(
    'kind', 'estimate',
    'invoice', jsonb_build_object('id', e.id, 'garage_id', e.garage_id, 'job_id', e.job_id, 'customer_id', e.customer_id,
      'number', e.number, 'issued_at', e.issued_at, 'due_at', e.valid_until, 'is_vat_invoice', vat_on,
      'vat_number', case when vat_on then g.vat_number end,
      'subtotal_pence', net, 'vat_pence', vat, 'total_pence', net + vat, 'paid_pence', 0, 'credited_pence', 0,
      'status', 'issued', 'notes', e.notes, 'public_token', e.public_token, 'emailed_at', e.sent_at, 'voided_at', null, 'void_reason', null,
      'created_at', e.created_at,
      'seller', jsonb_build_object('name', g.name, 'address', g.address, 'postcode', g.postcode, 'phone', g.phone, 'email', g.email,
        'website', g.website, 'logo_url', g.logo_url, 'brand_colour', g.brand_colour, 'vat_number', case when vat_on then g.vat_number end,
        'bank_details', null, 'terms', g.invoice_terms),
      'buyer', jsonb_build_object('name', c.name, 'address', c.address, 'postcode', c.postcode, 'phone', c.phone, 'email', c.email),
      'vehicle', jsonb_build_object('registration', v.registration, 'make', v.make, 'model', v.model, 'mileage', v.last_mileage, 'job_number', null)),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'type', l.type, 'description', l.description, 'quantity', l.quantity,
        'unit_price_pence', l.unit_price_pence, 'vat_rate', case when l.no_vat then 0 else rate end,
        'line_total_pence', round(l.quantity * l.unit_price_pence)::int, 'part_number', l.part_number,
        'optional', l.optional, 'accepted', l.accepted, 'no_vat', l.no_vat) order by l.sort_order, l.id)
      from estimate_lines l where l.estimate_id = e.id), '[]'::jsonb),
    'payments', '[]'::jsonb,
    'estimate', jsonb_build_object('status', e.status, 'title', e.title, 'valid_until', e.valid_until,
      'expired', e.valid_until is not null and e.valid_until < (now() at time zone 'Europe/London')::date,
      'sent_at', e.sent_at, 'viewed_at', e.viewed_at, 'responded_at', e.responded_at, 'accepted_by', e.accepted_by,
      'response_note', e.response_note, 'vat_rate', rate,
      'book_url', case when g.online_booking_enabled then '/book' end, 'garage_slug', g.slug)
  );
end $$;
revoke execute on function build_estimate_doc from public, anon, authenticated;

create or replace function estimate_doc(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g uuid;
begin
  select garage_id into g from estimates where id = p_id;
  if g is null or not has_role(g, '{owner,reception}') then return null; end if;
  return build_estimate_doc(p_id);
end $$;
revoke execute on function estimate_doc from public, anon;
grant execute on function estimate_doc to authenticated;

-- Customer's link: shows the estimate and records the first view
create or replace function estimate_doc_public(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e estimates;
begin
  select * into e from estimates where public_token = p_token and status <> 'draft';
  if not found then return null; end if;
  if e.viewed_at is null then update estimates set viewed_at = now() where id = e.id; end if;
  return build_estimate_doc(e.id);
end $$;
revoke execute on function estimate_doc_public from public;
grant execute on function estimate_doc_public to anon, authenticated;

-- Customer accepts (choosing optional extras) or declines
create or replace function estimate_respond(p_token uuid, p_accept boolean, p_optional uuid[], p_name text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare e estimates;
begin
  select * into e from estimates where public_token = p_token for update;
  if not found or e.status = 'draft' then raise exception 'This link is not valid'; end if;
  if e.status <> 'sent' then raise exception 'This estimate has already been answered. Please call the garage to change it.'; end if;
  if e.valid_until is not null and e.valid_until < (now() at time zone 'Europe/London')::date then
    raise exception 'This estimate has expired. Please call the garage for an up-to-date price.';
  end if;
  if p_accept and length(coalesce(trim(p_name), '')) < 2 then raise exception 'Please type your name to accept'; end if;
  if p_accept then
    update estimate_lines set accepted = (not optional) or id = any(coalesce(p_optional, '{}')) where estimate_id = e.id;
  end if;
  update estimates set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now(),
    accepted_by = case when p_accept then left(trim(p_name), 100) end, response_note = nullif(left(trim(coalesce(p_note, '')), 1000), '')
  where id = e.id;
end $$;
revoke execute on function estimate_respond from public;
grant execute on function estimate_respond to anon, authenticated;

-- Turn an estimate into a job card (accepted lines only)
create or replace function estimate_to_job(p_estimate uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare e estimates; j uuid; n int;
begin
  select * into e from estimates where id = p_estimate for update;
  if not found or not has_role(e.garage_id, '{owner,reception}') then raise exception 'Not allowed'; end if;
  if e.job_id is not null then return e.job_id; end if;
  if e.status = 'declined' then raise exception 'The customer declined this estimate'; end if;
  n := claim_job_number(e.garage_id);
  insert into jobs (garage_id, customer_id, vehicle_id, job_number, customer_complaint)
  values (e.garage_id, e.customer_id, e.vehicle_id, n, coalesce(e.title, 'Work from estimate ' || e.number))
  returning id into j;
  insert into job_lines (garage_id, job_id, type, description, quantity, unit_price_pence, no_vat, part_number, sort_order)
  select e.garage_id, j, l.type, l.description, l.quantity, l.unit_price_pence, l.no_vat, l.part_number, l.sort_order
  from estimate_lines l where l.estimate_id = e.id and (not l.optional or l.accepted);
  update estimates set status = 'converted', job_id = j where id = e.id;
  return j;
end $$;
revoke execute on function estimate_to_job from public, anon;
grant execute on function estimate_to_job to authenticated;

-- =====================================================================
-- TWO-FACTOR LOGIN
-- =====================================================================
-- Owner can require two-factor for chosen roles (checked by the app on sign-in)
alter table garages add column if not exists mfa_required_roles member_role[] not null default '{}';
grant update (mfa_required_roles) on garages to authenticated;

-- Someone who has set up two-factor must have used it in this session (aal2) to reach any garage data.
-- Every row-level security rule goes through is_member / has_role, so checking here covers all tables.
create or replace function mfa_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
$$;

create or replace function is_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from garage_members
    where garage_id = g and user_id = auth.uid() and active) and mfa_ok();
$$;

create or replace function has_role(g uuid, roles member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from garage_members
    where garage_id = g and user_id = auth.uid() and active and role = any(roles)) and mfa_ok();
$$;

-- Owner: who in the garage has two-factor switched on
create or replace function member_mfa(p_garage uuid) returns table (user_id uuid, enabled boolean)
language sql stable security definer set search_path = public as $$
  select m.user_id, exists (select 1 from auth.mfa_factors f where f.user_id = m.user_id and f.status = 'verified')
  from garage_members m where m.garage_id = p_garage and has_role(p_garage, '{owner}');
$$;
revoke execute on function member_mfa from public, anon;
grant execute on function member_mfa to authenticated;

-- =====================================================================
-- ACTIVITY LOG
-- =====================================================================
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  garage_id uuid not null references garages on delete cascade,
  at timestamptz not null default now(),
  user_id uuid,
  actor text,
  table_name text not null,
  row_id uuid,
  label text,
  action text not null check (action in ('insert', 'update', 'delete')),
  changes jsonb
);
create index if not exists audit_log_garage on audit_log (garage_id, at desc);
alter table audit_log enable row level security;
drop policy if exists audit_log_read on audit_log;
create policy audit_log_read on audit_log for select using (has_role(garage_id, '{owner}'));
revoke insert, update, delete on audit_log from anon, authenticated;

-- Generic trigger. Arguments: 1) column holding the garage id, 2) column used as a readable label,
-- 3+) columns to ignore (counters, caches). Updates log only the columns that changed.
create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  g uuid := (r->>tg_argv[0])::uuid;
  skip text[] := coalesce(tg_argv[2:], '{}') || array['mot_history', 'seller', 'buyer', 'vehicle', 'lines', 'unsubscribe_token', 'public_token', 'approval_token'];
  diff jsonb;
  who text;
begin
  if g is null then return null; end if;
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_array(o->k, n->k)) into diff
    from jsonb_object_keys(n) k where not (k = any(skip)) and (o->k) is distinct from (n->k);
    if diff is null then return null; end if;
  else
    select jsonb_object_agg(k, r->k) into diff from jsonb_object_keys(r) k where not (k = any(skip)) and r->k <> 'null'::jsonb;
  end if;
  select display_name into who from garage_members where garage_id = g and user_id = auth.uid();
  insert into audit_log (garage_id, user_id, actor, table_name, row_id, label, action, changes)
  values (g, auth.uid(), coalesce(who, case when auth.uid() is null then 'System or customer' end), tg_table_name,
          nullif(r->>'id', '')::uuid, left(r->>tg_argv[1], 120), lower(tg_op), diff);
  return null;
end $$;

do $$
declare t record;
begin
  for t in select * from (values
    ('invoices',        'insert or update',           'garage_id', 'number',       '{paid_pence,status,credited_pence,emailed_at}'),
    ('payments',        'insert or update or delete', 'garage_id', 'reference',    '{}'),
    ('credit_notes',    'insert',                     'garage_id', 'number',       '{}'),
    ('customers',       'update or delete',           'garage_id', 'name',         '{consent_at}'),
    ('vehicles',        'delete',                     'garage_id', 'registration', '{}'),
    ('jobs',            'delete',                     'garage_id', 'job_number',   '{}'),
    ('job_lines',       'update or delete',           'garage_id', 'description',  '{done,sort_order,followed_up_at}'),
    ('bookings',        'delete',                     'garage_id', 'service_type', '{}'),
    ('estimates',       'insert or delete',           'garage_id', 'number',       '{}'),
    ('garage_members',  'insert or update or delete', 'garage_id', 'display_name', '{email}'),
    ('invites',         'insert or delete',           'garage_id', 'display_name', '{token}'),
    ('garages',         'update',                     'id',        'name',         '{next_invoice_number,next_credit_number,next_estimate_number,job_counter,plan_status,trial_ends_at,plan_renews_at,stripe_customer_id,stripe_subscription_id}')
  ) as x(tbl, ev, gcol, lcol, skip) loop
    execute format('drop trigger if exists audit on %I', t.tbl);
    execute format('create trigger audit after %s on %I for each row execute function audit_row(%L, %L%s)',
      t.ev, t.tbl, t.gcol, t.lcol, coalesce((select ', ' || string_agg(quote_literal(s), ', ') from unnest(t.skip::text[]) s), ''));
  end loop;
end $$;
