-- RampDesk: credit notes, refunds and deposits. Run once after 01–13.

-- ---------- Numbering ----------
alter table garages add column if not exists credit_prefix text not null default 'CN-';
alter table garages add column if not exists next_credit_number int not null default 1;
grant update (credit_prefix) on garages to authenticated;

-- ---------- Credit notes ----------
alter table invoices add column if not exists credited_pence int not null default 0;

create table if not exists credit_notes (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  invoice_id uuid not null references invoices on delete cascade,
  customer_id uuid references customers on delete set null,
  number text not null,
  issued_at date not null,
  reason text not null,
  is_vat boolean not null,
  vat_number text,
  subtotal_pence int not null default 0,
  vat_pence int not null default 0,
  total_pence int not null default 0,
  refund_pence int not null default 0,
  refund_method pay_method,
  seller jsonb, buyer jsonb, vehicle jsonb,
  public_token uuid not null default gen_random_uuid() unique,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  unique (garage_id, number)
);
create index if not exists credit_notes_invoice on credit_notes (invoice_id);
create index if not exists credit_notes_garage_issued on credit_notes (garage_id, issued_at desc);

create table if not exists credit_note_lines (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  credit_note_id uuid not null references credit_notes on delete cascade,
  invoice_line_id uuid references invoice_lines on delete set null,
  type line_type not null,
  description text not null,
  quantity numeric(10,2) not null,
  unit_price_pence int not null,
  vat_rate numeric(5,2) not null default 0,
  line_total_pence int not null,
  sort_order int default 0
);
create index if not exists credit_note_lines_note on credit_note_lines (credit_note_id, sort_order);

alter table credit_notes enable row level security;
alter table credit_note_lines enable row level security;
drop policy if exists credit_notes_read on credit_notes;
drop policy if exists credit_note_lines_read on credit_note_lines;
create policy credit_notes_read on credit_notes for select using (has_role(garage_id, '{owner,reception}'));
create policy credit_note_lines_read on credit_note_lines for select using (has_role(garage_id, '{owner,reception}'));
-- inserts only through issue_credit_note(); credit notes are never edited or deleted
revoke insert, update, delete on credit_notes, credit_note_lines from anon, authenticated;

-- ---------- Payments: deposits (no invoice yet) and refunds (negative amounts) ----------
alter table payments alter column invoice_id drop not null;
alter table payments add column if not exists job_id uuid references jobs on delete set null;
alter table payments add column if not exists booking_id uuid references bookings on delete set null;
alter table payments add column if not exists credit_note_id uuid references credit_notes on delete set null;
alter table payments drop constraint if exists payments_target;
alter table payments add constraint payments_target check (invoice_id is not null or job_id is not null or booking_id is not null);
create index if not exists payments_job on payments (job_id) where job_id is not null;
create index if not exists payments_booking on payments (booking_id) where booking_id is not null;

-- Recalculate an invoice's paid amount and status
create or replace function refresh_invoice(p_invoice uuid) returns void
language plpgsql security definer set search_path = public as $$
declare paid int; tot int; cred int; st invoice_status;
begin
  if p_invoice is null then return; end if;
  select coalesce(sum(amount_pence), 0) into paid from payments where invoice_id = p_invoice;
  select total_pence, credited_pence, status into tot, cred, st from invoices where id = p_invoice;
  if not found then return; end if;
  update invoices set paid_pence = paid,
    status = (case when st = 'void' then 'void'
                   when paid + cred >= tot then 'paid'
                   when paid > 0 or cred > 0 then 'part_paid'
                   else 'issued' end)::invoice_status
  where id = p_invoice;
end $$;
revoke execute on function refresh_invoice from public, anon, authenticated;

create or replace function sync_invoice_payments() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then perform refresh_invoice(old.invoice_id); end if;
  if tg_op <> 'DELETE' and new.invoice_id is distinct from old.invoice_id then perform refresh_invoice(new.invoice_id);
  elsif tg_op = 'INSERT' then perform refresh_invoice(new.invoice_id); end if;
  return null;
end $$;
drop trigger if exists payments_sync on payments;
create trigger payments_sync after insert or update or delete on payments
  for each row execute function sync_invoice_payments();

-- ---------- An invoice that has been fully credited no longer counts as the job's invoice ----------
create or replace function invoice_open(i invoices) returns boolean language sql immutable as $$
  select i.status <> 'void' and not (i.credited_pence > 0 and i.credited_pence >= i.total_pence);
$$;

create or replace function job_has_invoice(p_job uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from invoices i join jobs j on j.id = i.job_id
                 where i.job_id = p_job and invoice_open(i) and is_member(j.garage_id));
$$;

-- ---------- Issue invoice (as 09) + skip fully credited invoices + apply deposits ----------
create or replace function issue_invoice(p_job uuid, p_issue date, p_due date, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  j jobs; g garages; c customers; v vehicles;
  vat_on boolean; rate numeric; inv uuid; num text; net int; vatable int; prev invoices;
begin
  select * into j from jobs where id = p_job;
  if not found then raise exception 'Job not found'; end if;
  if not has_role(j.garage_id, '{owner,reception}') then
    raise exception 'Only the owner or reception can issue invoices';
  end if;
  if exists (select 1 from invoices i where i.job_id = p_job and invoice_open(i)) then
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

  -- deposits taken against this job or its booking become payments on the invoice
  update payments set invoice_id = inv
   where garage_id = j.garage_id and invoice_id is null
     and (job_id = j.id or (j.booking_id is not null and booking_id = j.booking_id));

  -- re-invoicing after a credit note: money already paid on the earlier invoice moves across
  for prev in select * from invoices where job_id = j.id and id <> inv and status <> 'void'
                and paid_pence + credited_pence > total_pence loop
    insert into payments (garage_id, invoice_id, amount_pence, method, paid_at, reference) values
      (j.garage_id, prev.id, -(prev.paid_pence + prev.credited_pence - prev.total_pence), 'transfer', now(), 'Moved to ' || num),
      (j.garage_id, inv, prev.paid_pence + prev.credited_pence - prev.total_pence, 'transfer', now(), 'Paid on ' || prev.number);
  end loop;
  perform refresh_invoice(inv);
  return inv;
end $$;
revoke execute on function issue_invoice from public, anon;
grant execute on function issue_invoice to authenticated;

-- ---------- Void (owner): deposits go back to the job, other payments must be removed first ----------
create or replace function void_invoice(p_invoice uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare i invoices;
begin
  select * into i from invoices where id = p_invoice for update;
  if not found or not has_role(i.garage_id, '{owner}') then raise exception 'Only the owner can void invoices'; end if;
  if i.status = 'void' then return; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Say why the invoice is being voided'; end if;
  if i.credited_pence > 0 then raise exception 'This invoice has a credit note, so it can''t be voided'; end if;
  if exists (select 1 from payments where invoice_id = i.id and job_id is null and booking_id is null) then
    raise exception 'Remove the payments first, then void the invoice';
  end if;
  update payments set invoice_id = null where invoice_id = i.id;
  update invoices set status = 'void', voided_at = now(), void_reason = left(trim(p_reason), 300), paid_pence = 0 where id = i.id;
end $$;
revoke execute on function void_invoice from public, anon;
grant execute on function void_invoice to authenticated;

-- ---------- Issue a credit note (owner) ----------
-- p_lines: [{"invoice_line_id": uuid, "quantity": n}] and/or [{"description": text, "gross_pence": n}] (amount including any VAT)
-- p_refund: payment method to record a refund of any overpayment now, or null
create or replace function issue_credit_note(p_invoice uuid, p_issue date, p_reason text, p_lines jsonb, p_refund text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  i invoices; g garages; r jsonb; il invoice_lines; q numeric; done_q numeric;
  cn uuid; num text; rate numeric; net int := 0; vatable int := 0; vat int; extra_vat int := 0; tot int; over int; refund int := 0; n int := 0;
  amt int; gross int; descr text;
begin
  select * into i from invoices where id = p_invoice for update;
  if not found or not has_role(i.garage_id, '{owner}') then raise exception 'Only the owner can issue credit notes'; end if;
  if i.status = 'void' then raise exception 'This invoice is void'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for the credit note'; end if;
  if p_issue is null or p_issue < i.issued_at then raise exception 'The credit note can''t be dated before the invoice'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Choose what to credit'; end if;
  if p_refund is not null and p_refund not in ('cash', 'card', 'transfer', 'stripe') then raise exception 'Choose how the refund was paid'; end if;

  select * into g from garages where id = i.garage_id for update;
  rate := coalesce((select max(vat_rate) from invoice_lines where invoice_id = i.id), 0);
  num := g.credit_prefix || lpad(g.next_credit_number::text, 5, '0');
  update garages set next_credit_number = next_credit_number + 1 where id = g.id;

  insert into credit_notes (garage_id, invoice_id, customer_id, number, issued_at, reason, is_vat, vat_number,
                            seller, buyer, vehicle, created_by)
  values (i.garage_id, i.id, i.customer_id, num, p_issue, left(trim(p_reason), 500), i.is_vat_invoice, i.vat_number,
          i.seller, i.buyer, i.vehicle, auth.uid())
  returning id into cn;

  for r in select * from jsonb_array_elements(p_lines) loop
    n := n + 1;
    if r ? 'invoice_line_id' then
      select * into il from invoice_lines where id = (r->>'invoice_line_id')::uuid and invoice_id = i.id;
      if not found then raise exception 'Line not found on this invoice'; end if;
      q := round((r->>'quantity')::numeric, 2);
      select coalesce(sum(l.quantity), 0) into done_q from credit_note_lines l where l.invoice_line_id = il.id;
      if q is null or q <= 0 then raise exception 'Enter a quantity to credit for "%"', il.description; end if;
      if q > il.quantity - done_q then raise exception 'Only % of "%" is left to credit', il.quantity - done_q, il.description; end if;
      amt := round(q * il.unit_price_pence)::int;
      insert into credit_note_lines (garage_id, credit_note_id, invoice_line_id, type, description, quantity, unit_price_pence, vat_rate, line_total_pence, sort_order)
      values (i.garage_id, cn, il.id, il.type, il.description, q, il.unit_price_pence, il.vat_rate, amt, n);
      net := net + amt;
      if il.vat_rate > 0 then vatable := vatable + amt; end if;
    else
      descr := left(trim(coalesce(r->>'description', '')), 300);
      gross := (r->>'gross_pence')::int;
      if descr = '' then raise exception 'Describe the amount being credited'; end if;
      if gross is null or gross <= 0 then raise exception 'Enter the amount to credit'; end if;
      amt := round(gross * 100.0 / (100 + rate))::int;   -- net part
      extra_vat := extra_vat + (gross - amt);
      insert into credit_note_lines (garage_id, credit_note_id, type, description, quantity, unit_price_pence, vat_rate, line_total_pence, sort_order)
      values (i.garage_id, cn, 'fee', descr, 1, amt, rate, amt, n);
      net := net + amt;
    end if;
  end loop;

  vat := round(vatable * rate / 100)::int + extra_vat;
  tot := net + vat;
  -- rounding over several partial credits can overshoot by a penny or two
  if i.credited_pence + tot > i.total_pence then
    if i.credited_pence + tot - i.total_pence <= 2 and vat >= i.credited_pence + tot - i.total_pence then
      vat := vat - (i.credited_pence + tot - i.total_pence); tot := net + vat;
    else
      raise exception 'That is more than is left on the invoice (%p)', i.total_pence - i.credited_pence;
    end if;
  end if;

  update invoices set credited_pence = credited_pence + tot where id = i.id;

  -- refund whatever the customer has now overpaid
  if p_refund is not null then
    over := i.paid_pence + i.credited_pence + tot - i.total_pence;
    refund := greatest(0, least(over, tot));
    if refund > 0 then
      insert into payments (garage_id, invoice_id, amount_pence, method, paid_at, reference, credit_note_id)
      values (i.garage_id, i.id, -refund, p_refund::pay_method, now(), 'Refund ' || num, cn);
    end if;
  end if;

  update credit_notes set subtotal_pence = net, vat_pence = vat, total_pence = tot, refund_pence = refund,
    refund_method = case when refund > 0 then p_refund::pay_method end
  where id = cn;
  perform refresh_invoice(i.id);
  return cn;
end $$;
revoke execute on function issue_credit_note from public, anon;
grant execute on function issue_credit_note to authenticated;

-- ---------- Documents ----------
create or replace function build_invoice_doc(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'invoice', to_jsonb(i),
    'lines', coalesce((select jsonb_agg(to_jsonb(l) order by l.sort_order, l.id) from invoice_lines l where l.invoice_id = i.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'amount_pence', p.amount_pence, 'method', p.method,
                          'paid_at', p.paid_at, 'reference', p.reference, 'deposit', p.job_id is not null or p.booking_id is not null,
                          'credit_note_id', p.credit_note_id) order by p.paid_at)
                          from payments p where p.invoice_id = i.id), '[]'::jsonb),
    'credits', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'number', c.number, 'issued_at', c.issued_at,
                          'total_pence', c.total_pence, 'reason', c.reason, 'public_token', c.public_token) order by c.created_at)
                          from credit_notes c where c.invoice_id = i.id), '[]'::jsonb),
    'credited_lines', coalesce((select jsonb_object_agg(x.invoice_line_id, x.q) from (
                          select l.invoice_line_id, sum(l.quantity) q from credit_note_lines l join credit_notes c on c.id = l.credit_note_id
                          where c.invoice_id = i.id and l.invoice_line_id is not null group by 1) x), '{}'::jsonb)
  ) from invoices i where i.id = p_id;
$$;
revoke execute on function build_invoice_doc from public, anon, authenticated;

-- A credit note in the same shape as an invoice document, so the same layout and PDF code can show it
create or replace function build_credit_doc(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'kind', 'credit',
    'invoice', jsonb_build_object('id', c.id, 'garage_id', c.garage_id, 'job_id', i.job_id, 'customer_id', c.customer_id,
      'number', c.number, 'issued_at', c.issued_at, 'due_at', null, 'is_vat_invoice', c.is_vat, 'vat_number', c.vat_number,
      'subtotal_pence', c.subtotal_pence, 'vat_pence', c.vat_pence, 'total_pence', c.total_pence, 'paid_pence', 0, 'credited_pence', 0,
      'status', 'issued', 'notes', c.reason, 'public_token', c.public_token, 'emailed_at', null, 'voided_at', null, 'void_reason', null,
      'created_at', c.created_at, 'seller', c.seller, 'buyer', c.buyer, 'vehicle', c.vehicle),
    'lines', coalesce((select jsonb_agg(to_jsonb(l) || jsonb_build_object('part_number', null) order by l.sort_order) from credit_note_lines l where l.credit_note_id = c.id), '[]'::jsonb),
    'payments', '[]'::jsonb,
    'credits', '[]'::jsonb,
    'against', jsonb_build_object('id', i.id, 'number', i.number, 'issued_at', i.issued_at),
    'refund', jsonb_build_object('amount_pence', c.refund_pence, 'method', c.refund_method)
  ) from credit_notes c join invoices i on i.id = c.invoice_id where c.id = p_id;
$$;
revoke execute on function build_credit_doc from public, anon, authenticated;

create or replace function credit_doc(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g uuid;
begin
  select garage_id into g from credit_notes where id = p_id;
  if g is null or not has_role(g, '{owner,reception}') then return null; end if;
  return build_credit_doc(p_id);
end $$;
revoke execute on function credit_doc from public, anon;
grant execute on function credit_doc to authenticated;

create or replace function credit_doc_public(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select build_credit_doc(id) from credit_notes where public_token = p_token;
$$;
revoke execute on function credit_doc_public from public;
grant execute on function credit_doc_public to anon, authenticated;

-- ---------- Reports: sales net of credit notes; deposits waiting for an invoice ----------
create or replace function report_summary(p_garage uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ts_from timestamptz; ts_to timestamptz;
begin
  if not has_role(p_garage, '{owner,reception}') then raise exception 'Not allowed'; end if;
  ts_from := p_from::timestamp at time zone 'Europe/London';
  ts_to := (p_to + 1)::timestamp at time zone 'Europe/London';

  return jsonb_build_object(
    'sales', (select jsonb_build_object(
        'invoices', (select count(*) from invoices where garage_id = p_garage and status <> 'void' and issued_at between p_from and p_to),
        'net',   coalesce((select sum(subtotal_pence) from invoices where garage_id = p_garage and status <> 'void' and issued_at between p_from and p_to), 0)
               - coalesce((select sum(subtotal_pence) from credit_notes where garage_id = p_garage and issued_at between p_from and p_to), 0),
        'vat',   coalesce((select sum(vat_pence) from invoices where garage_id = p_garage and status <> 'void' and issued_at between p_from and p_to), 0)
               - coalesce((select sum(vat_pence) from credit_notes where garage_id = p_garage and issued_at between p_from and p_to), 0),
        'gross', coalesce((select sum(total_pence) from invoices where garage_id = p_garage and status <> 'void' and issued_at between p_from and p_to), 0)
               - coalesce((select sum(total_pence) from credit_notes where garage_id = p_garage and issued_at between p_from and p_to), 0))),
    'credits', (select jsonb_build_object('count', count(*), 'gross', coalesce(sum(total_pence), 0))
      from credit_notes where garage_id = p_garage and issued_at between p_from and p_to),
    'by_type', (select coalesce(jsonb_object_agg(type, total), '{}'::jsonb) from (
        select type, sum(total) total from (
          select l.type, l.line_total_pence total from invoice_lines l join invoices i on i.id = l.invoice_id
            where i.garage_id = p_garage and i.status <> 'void' and i.issued_at between p_from and p_to
          union all
          select l.type, -l.line_total_pence from credit_note_lines l join credit_notes c on c.id = l.credit_note_id
            where c.garage_id = p_garage and c.issued_at between p_from and p_to) u group by type) t),
    'payments', (select jsonb_build_object('total', coalesce(sum(amount_pence), 0),
        'by_method', coalesce((select jsonb_object_agg(method, total) from (
            select method, sum(amount_pence) total from payments where garage_id = p_garage and paid_at >= ts_from and paid_at < ts_to group by method) m), '{}'::jsonb))
      from payments where garage_id = p_garage and paid_at >= ts_from and paid_at < ts_to),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'taken', taken) order by d) from (
        select (paid_at at time zone 'Europe/London')::date d, sum(amount_pence) taken from payments
        where garage_id = p_garage and paid_at >= ts_from and paid_at < ts_to group by 1) x), '[]'::jsonb),
    'outstanding', (select coalesce(sum(greatest(0, total_pence - paid_pence - credited_pence)), 0) from invoices
        where garage_id = p_garage and status in ('issued', 'part_paid')),
    'deposits_held', (select coalesce(sum(amount_pence), 0) from payments where garage_id = p_garage and invoice_id is null),
    'jobs', jsonb_build_object(
      'opened', (select count(*) from jobs where garage_id = p_garage and created_at >= ts_from and created_at < ts_to),
      'completed', (select count(*) from jobs where garage_id = p_garage and completed_at >= ts_from and completed_at < ts_to)),
    'mechanics', coalesce((select jsonb_agg(row_to_json(x) order by x.hours_sold desc) from (
        select gm.display_name as name,
          (select count(*) from jobs j where j.garage_id = p_garage and j.assigned_to = gm.user_id and j.completed_at >= ts_from and j.completed_at < ts_to) as jobs,
          (select coalesce(sum(l.quantity), 0) from job_lines l join jobs j on j.id = l.job_id
            where j.garage_id = p_garage and j.assigned_to = gm.user_id and j.completed_at >= ts_from and j.completed_at < ts_to
              and l.type = 'labour' and l.approval in ('not_required', 'approved')) as hours_sold,
          (select coalesce(round(sum(extract(epoch from (coalesce(t.ended_at, now()) - t.started_at)) / 60)), 0) from time_entries t
            where t.garage_id = p_garage and t.user_id = gm.user_id and t.started_at >= ts_from and t.started_at < ts_to) as minutes_clocked
        from garage_members gm where gm.garage_id = p_garage and gm.active and gm.role in ('mechanic', 'owner')) x
        where x.jobs > 0 or x.minutes_clocked > 0), '[]'::jsonb),
    'mot', (select jsonb_build_object('bookings', count(*),
        'with_extra_work', count(*) filter (where exists (
          select 1 from jobs j join job_lines l on l.job_id = j.id
          where j.booking_id = b.id and l.description not ilike '%mot%' and l.approval in ('not_required', 'approved'))))
      from bookings b where b.garage_id = p_garage and b.service_type ilike '%mot%' and b.status not in ('cancelled', 'no_show')
        and b.starts_at >= ts_from and b.starts_at < ts_to),
    'bookings', (select jsonb_build_object('total', count(*), 'online', count(*) filter (where source = 'online'),
        'no_show', count(*) filter (where status = 'no_show'))
      from bookings where garage_id = p_garage and starts_at >= ts_from and starts_at < ts_to and status <> 'cancelled'),
    'top_customers', coalesce((select jsonb_agg(row_to_json(x)) from (
        select i.buyer->>'name' as name, sum(i.total_pence - i.credited_pence) as total, count(*) as invoices from invoices i
        where i.garage_id = p_garage and i.status <> 'void' and i.issued_at between p_from and p_to
        group by 1 order by 2 desc limit 5) x), '[]'::jsonb)
  );
end $$;
revoke execute on function report_summary from public, anon;
grant execute on function report_summary to authenticated;
