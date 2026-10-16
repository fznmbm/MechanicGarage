-- RampDesk: reports. Run once after 11.

create or replace function report_summary(p_garage uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ts_from timestamptz; ts_to timestamptz;
begin
  if not has_role(p_garage, '{owner,reception}') then raise exception 'Not allowed'; end if;
  ts_from := p_from::timestamp at time zone 'Europe/London';
  ts_to := (p_to + 1)::timestamp at time zone 'Europe/London';

  return jsonb_build_object(
    'sales', (select jsonb_build_object(
        'invoices', count(*), 'net', coalesce(sum(subtotal_pence), 0), 'vat', coalesce(sum(vat_pence), 0), 'gross', coalesce(sum(total_pence), 0))
      from invoices where garage_id = p_garage and status <> 'void' and issued_at between p_from and p_to),
    'by_type', (select coalesce(jsonb_object_agg(type, total), '{}'::jsonb) from (
        select l.type, sum(l.line_total_pence) total from invoice_lines l join invoices i on i.id = l.invoice_id
        where i.garage_id = p_garage and i.status <> 'void' and i.issued_at between p_from and p_to group by l.type) t),
    'payments', (select jsonb_build_object('total', coalesce(sum(amount_pence), 0),
        'by_method', coalesce((select jsonb_object_agg(method, total) from (
            select method, sum(amount_pence) total from payments where garage_id = p_garage and paid_at >= ts_from and paid_at < ts_to group by method) m), '{}'::jsonb))
      from payments where garage_id = p_garage and paid_at >= ts_from and paid_at < ts_to),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'taken', taken) order by d) from (
        select (paid_at at time zone 'Europe/London')::date d, sum(amount_pence) taken from payments
        where garage_id = p_garage and paid_at >= ts_from and paid_at < ts_to group by 1) x), '[]'::jsonb),
    'outstanding', (select coalesce(sum(total_pence - paid_pence), 0) from invoices where garage_id = p_garage and status in ('issued', 'part_paid')),
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
        select i.buyer->>'name' as name, sum(i.total_pence) as total, count(*) as invoices from invoices i
        where i.garage_id = p_garage and i.status <> 'void' and i.issued_at between p_from and p_to
        group by 1 order by 2 desc limit 5) x), '[]'::jsonb)
  );
end $$;
revoke execute on function report_summary from public, anon;
grant execute on function report_summary to authenticated;
