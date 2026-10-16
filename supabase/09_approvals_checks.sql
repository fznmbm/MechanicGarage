-- RampDesk: customer approvals + vehicle health checks. Run once after 08.

alter table jobs add column if not exists approval_sent_at timestamptz;
alter table jobs add column if not exists approval_responded_at timestamptz;
create unique index if not exists jobs_approval_token on jobs (approval_token);

-- ---------- Vehicle health check (red / amber / green) ----------
create table if not exists job_checks (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  job_id uuid not null references jobs on delete cascade,
  category text not null,
  item text not null,
  status text not null default 'unchecked' check (status in ('unchecked', 'green', 'amber', 'red', 'na')),
  note text,
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  unique (job_id, item)
);
create index if not exists job_checks_job on job_checks (job_id, sort_order);
alter table job_checks enable row level security;
create policy job_checks_all on job_checks for all using (is_member(garage_id)) with check (is_member(garage_id));

-- ---------- Invoices only include work that doesn't need, or has, customer approval ----------
create or replace function issue_invoice(p_job uuid, p_issue date, p_due date, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  j jobs; g garages; c customers; v vehicles;
  vat_on boolean; rate numeric; inv uuid; num text; net int; vatable int;
begin
  select * into j from jobs where id = p_job;
  if not found then raise exception 'Job not found'; end if;
  if not has_role(j.garage_id, '{owner,reception}') then
    raise exception 'Only the owner or reception can issue invoices';
  end if;
  if exists (select 1 from invoices where job_id = p_job and status <> 'void') then
    raise exception 'This job already has an invoice';
  end if;
  if not exists (select 1 from job_lines where job_id = p_job and approval in ('not_required', 'approved')) then
    raise exception 'Add some work to the job before invoicing';
  end if;
  if p_due is not null and p_due < p_issue then raise exception 'Due date cannot be before the invoice date'; end if;

  select * into g from garages where id = j.garage_id for update;
  select * into c from customers where id = j.customer_id;
  select * into v from vehicles where id = j.vehicle_id;

  vat_on := g.vat_registered and g.vat_effective_from is not null and p_issue >= g.vat_effective_from;
  rate := case when vat_on then g.default_vat_rate else 0 end;

  num := g.invoice_prefix || lpad(g.next_invoice_number::text, 5, '0');
  update garages set next_invoice_number = next_invoice_number + 1 where id = g.id;

  insert into invoices (garage_id, job_id, customer_id, number, issued_at, due_at, is_vat_invoice, vat_number,
                        status, notes, seller, buyer, vehicle)
  values (
    g.id, j.id, j.customer_id, num, p_issue, coalesce(p_due, p_issue), vat_on,
    case when vat_on then g.vat_number end, 'issued', nullif(trim(p_notes), ''),
    jsonb_build_object('name', g.name, 'address', g.address, 'postcode', g.postcode, 'phone', g.phone,
      'email', g.email, 'website', g.website, 'logo_url', g.logo_url, 'brand_colour', g.brand_colour,
      'vat_number', case when vat_on then g.vat_number end, 'bank_details', g.bank_details, 'terms', g.invoice_terms,
      'payment_link_url', g.payment_link_url),
    jsonb_build_object('name', c.name, 'address', c.address, 'postcode', c.postcode, 'phone', c.phone, 'email', c.email),
    jsonb_build_object('registration', v.registration, 'make', v.make, 'model', v.model, 'mileage', j.mileage_in,
      'job_number', j.job_number)
  ) returning id into inv;

  insert into invoice_lines (garage_id, invoice_id, type, description, quantity, unit_price_pence, vat_rate,
                             line_total_pence, part_number, sort_order)
  select j.garage_id, inv, l.type, l.description, l.quantity, l.unit_price_pence,
         case when l.no_vat then 0 else rate end,
         round(l.quantity * l.unit_price_pence)::int, l.part_number, l.sort_order
  from job_lines l where l.job_id = p_job and l.approval in ('not_required', 'approved') order by l.sort_order;

  select coalesce(sum(line_total_pence), 0), coalesce(sum(line_total_pence) filter (where vat_rate > 0), 0)
    into net, vatable from invoice_lines where invoice_id = inv;

  update invoices
     set subtotal_pence = net,
         vat_pence = round(vatable * rate / 100)::int,
         total_pence = net + round(vatable * rate / 100)::int
   where id = inv;
  return inv;
end $$;
revoke execute on function issue_invoice from public, anon;
grant execute on function issue_invoice to authenticated;

-- ---------- Public approval page ----------
create or replace function approval_doc(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare j jobs; g garages; vat_on boolean;
begin
  select * into j from jobs where approval_token = p_token;
  if not found then return null; end if;
  select * into g from garages where id = j.garage_id;
  vat_on := g.vat_registered and g.vat_effective_from is not null and (now() at time zone 'Europe/London')::date >= g.vat_effective_from;
  return jsonb_build_object(
    'garage', jsonb_build_object('name', g.name, 'phone', g.phone, 'email', g.email, 'logo_url', g.logo_url,
      'brand_colour', g.brand_colour, 'vat_rate', case when vat_on then g.default_vat_rate end),
    'job', jsonb_build_object('id', j.id, 'number', j.job_number, 'status', j.status,
      'locked', j.status = 'collected' or exists (select 1 from invoices i where i.job_id = j.id and i.status <> 'void')),
    'vehicle', (select jsonb_build_object('registration', v.registration, 'make', v.make, 'model', v.model) from vehicles v where v.id = j.vehicle_id),
    'customer', (select split_part(c.name, ' ', 1) from customers c where c.id = j.customer_id),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'type', l.type, 'description', l.description,
        'quantity', l.quantity, 'unit_price_pence', l.unit_price_pence, 'no_vat', l.no_vat, 'approval', l.approval) order by l.sort_order)
        from job_lines l where l.job_id = j.id and l.approval <> 'not_required'), '[]'::jsonb),
    'checks', coalesce((select jsonb_agg(jsonb_build_object('item', k.item, 'category', k.category, 'status', k.status, 'note', k.note) order by k.sort_order)
        from job_checks k where k.job_id = j.id and k.status in ('red', 'amber', 'green')), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(p.path order by p.created_at) from job_photos p where p.job_id = j.id), '[]'::jsonb)
  );
end $$;
revoke execute on function approval_doc from public;
grant execute on function approval_doc to anon, authenticated;

create or replace function approval_respond(p_token uuid, p_line uuid, p_decision text) returns void
language plpgsql security definer set search_path = public as $$
declare j jobs;
begin
  if p_decision not in ('approved', 'declined') then raise exception 'Invalid choice'; end if;
  select * into j from jobs where approval_token = p_token;
  if not found then raise exception 'This link is not valid'; end if;
  if j.status = 'collected' or exists (select 1 from invoices i where i.job_id = j.id and i.status <> 'void') then
    raise exception 'This job has been completed. Please call the garage.';
  end if;
  update job_lines set approval = p_decision::approval_status
   where id = p_line and job_id = j.id and approval <> 'not_required';
  if not found then raise exception 'Item not found'; end if;
  update jobs set approval_responded_at = now() where id = j.id;
  if j.status = 'awaiting_approval' and not exists (select 1 from job_lines where job_id = j.id and approval = 'pending') then
    update jobs set status = 'in_progress' where id = j.id;
  end if;
end $$;
revoke execute on function approval_respond from public;
grant execute on function approval_respond to anon, authenticated;
