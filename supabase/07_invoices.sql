-- RampDesk: Invoicing. Run once after 01–06.

-- ---------- Garage payment details (shown on invoices) ----------
alter table garages add column if not exists bank_details text;
grant update (bank_details) on garages to authenticated;

-- ---------- Job lines: per-line VAT exemption (e.g. MOT test fee is outside the scope of VAT) ----------
alter table job_lines add column if not exists no_vat boolean not null default false;

-- ---------- Invoices: snapshots so issued invoices never change ----------
alter table invoices add column if not exists seller jsonb;
alter table invoices add column if not exists buyer jsonb;
alter table invoices add column if not exists vehicle jsonb;
alter table invoices add column if not exists notes text;
alter table invoices add column if not exists paid_pence int not null default 0;
alter table invoices add column if not exists public_token uuid not null default gen_random_uuid();
alter table invoices add column if not exists emailed_at timestamptz;
alter table invoices add column if not exists voided_at timestamptz;
alter table invoices add column if not exists void_reason text;
create unique index if not exists invoices_public_token on invoices (public_token);
create index if not exists invoices_job on invoices (job_id);
create index if not exists invoices_customer on invoices (customer_id);
create index if not exists invoices_garage_issued on invoices (garage_id, issued_at desc);

alter table invoice_lines add column if not exists part_number text;
alter table invoice_lines add column if not exists sort_order int default 0;
create index if not exists invoice_lines_invoice on invoice_lines (invoice_id, sort_order);
create index if not exists payments_invoice on payments (invoice_id);

-- ---------- Permissions: owner + reception only; no deletes (void instead) ----------
drop policy if exists tenant_all on invoices;
drop policy if exists tenant_all on invoice_lines;
drop policy if exists tenant_all on payments;

create policy invoices_read on invoices for select using (has_role(garage_id, '{owner,reception}'));
create policy invoices_update on invoices for update
  using (has_role(garage_id, '{owner,reception}')) with check (has_role(garage_id, '{owner,reception}'));
-- inserts happen only through issue_invoice()

create policy invoice_lines_read on invoice_lines for select using (has_role(garage_id, '{owner,reception}'));

create policy payments_read on payments for select using (has_role(garage_id, '{owner,reception}'));
create policy payments_insert on payments for insert with check (has_role(garage_id, '{owner,reception}'));
create policy payments_delete on payments for delete using (has_role(garage_id, '{owner}'));

-- Issued invoices: only status/notes/email/void fields may change
revoke update on invoices from anon, authenticated;
grant update (status, notes, emailed_at, voided_at, void_reason, due_at) on invoices to authenticated;

-- ---------- Issue an invoice from a job (atomic) ----------
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
  if not exists (select 1 from job_lines where job_id = p_job) then
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
      'vat_number', case when vat_on then g.vat_number end, 'bank_details', g.bank_details, 'terms', g.invoice_terms),
    jsonb_build_object('name', c.name, 'address', c.address, 'postcode', c.postcode, 'phone', c.phone, 'email', c.email),
    jsonb_build_object('registration', v.registration, 'make', v.make, 'model', v.model, 'mileage', j.mileage_in,
      'job_number', j.job_number)
  ) returning id into inv;

  insert into invoice_lines (garage_id, invoice_id, type, description, quantity, unit_price_pence, vat_rate,
                             line_total_pence, part_number, sort_order)
  select j.garage_id, inv, l.type, l.description, l.quantity, l.unit_price_pence,
         case when l.no_vat then 0 else rate end,
         round(l.quantity * l.unit_price_pence)::int, l.part_number, l.sort_order
  from job_lines l where l.job_id = p_job order by l.sort_order;

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

-- ---------- Keep paid amount + status in sync with payments ----------
create or replace function sync_invoice_payments() returns trigger
language plpgsql security definer set search_path = public as $$
declare iid uuid := coalesce(new.invoice_id, old.invoice_id); paid int; tot int; st invoice_status;
begin
  select coalesce(sum(amount_pence), 0) into paid from payments where invoice_id = iid;
  select total_pence, status into tot, st from invoices where id = iid;
  update invoices set paid_pence = paid,
    status = (case when st = 'void' then 'void'
                   when paid >= tot then 'paid'
                   when paid > 0 then 'part_paid'
                   else 'issued' end)::invoice_status
  where id = iid;
  return null;
end $$;
drop trigger if exists payments_sync on payments;
create trigger payments_sync after insert or update or delete on payments
  for each row execute function sync_invoice_payments();

-- ---------- Invoice document (for screen, PDF and the customer's link) ----------
create or replace function build_invoice_doc(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'invoice', to_jsonb(i),
    'lines', coalesce((select jsonb_agg(to_jsonb(l) order by l.sort_order, l.id) from invoice_lines l where l.invoice_id = i.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'amount_pence', p.amount_pence, 'method', p.method,
                          'paid_at', p.paid_at, 'reference', p.reference) order by p.paid_at)
                          from payments p where p.invoice_id = i.id), '[]'::jsonb)
  ) from invoices i where i.id = p_id;
$$;
revoke execute on function build_invoice_doc from public, anon, authenticated;

create or replace function invoice_doc(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g uuid;
begin
  select garage_id into g from invoices where id = p_id;
  if g is null or not has_role(g, '{owner,reception}') then return null; end if;
  return build_invoice_doc(p_id);
end $$;
revoke execute on function invoice_doc from public, anon;
grant execute on function invoice_doc to authenticated;

-- Public: anyone with the secret link can view that one invoice
create or replace function invoice_doc_public(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select build_invoice_doc(id) from invoices where public_token = p_token;
$$;
revoke execute on function invoice_doc_public from public;
grant execute on function invoice_doc_public to anon, authenticated;

-- Is this job invoiced? (lets mechanics see the job is locked without seeing invoice details)
create or replace function job_has_invoice(p_job uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from invoices i join jobs j on j.id = i.job_id
                 where i.job_id = p_job and i.status <> 'void' and is_member(j.garage_id));
$$;
revoke execute on function job_has_invoice from public, anon;
grant execute on function job_has_invoice to authenticated;
