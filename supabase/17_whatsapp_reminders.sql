-- IronBay: WhatsApp reminder send list, message wording, how reminders are sent. Run once after 16.

-- ---------- Settings ----------
-- whatsapp: customers with a mobile go on the WhatsApp send list; customers without one are emailed
-- both:     everyone with a mobile goes on the send list, and everyone with an email is emailed as well
-- email:    automatic emails only (no send list)
alter table garages add column if not exists reminder_channel text not null default 'whatsapp'
  check (reminder_channel in ('whatsapp', 'both', 'email'));
-- custom wording (null = the built-in wording)
alter table garages add column if not exists msg_mot text check (length(msg_mot) <= 1000);
alter table garages add column if not exists msg_service text check (length(msg_service) <= 1000);
alter table garages add column if not exists msg_advisory text check (length(msg_advisory) <= 1000);
grant update (reminder_channel, msg_mot, msg_service, msg_advisory) on garages to authenticated;

-- one send-list reminder per vehicle, due date and stage (stage 0 = "send again" / manual, can repeat)
create unique index if not exists reminder_log_list_once on reminder_log (vehicle_id, kind, due_date, stage)
  where channel = 'whatsapp' and stage <> 0;

-- A UK mobile (07…, +447…) or an international number written with + or 00. Landlines are not on WhatsApp.
create or replace function is_mobile(p_phone text) returns boolean
language sql immutable as $$
  select case
    when p_phone is null then false
    when regexp_replace(p_phone, '\D', '', 'g') ~ '^(07\d{9}|447\d{9}|00447\d{9})$' then true
    when p_phone ~ '^\s*(\+|00)' and regexp_replace(p_phone, '\D', '', 'g') !~ '^(00)?44' then length(regexp_replace(p_phone, '\D', '', 'g')) between 8 and 15
    else false end
$$;

-- ---------- The send list ----------
-- Reminders that are due to go out today and haven't been sent yet.
-- stage: days-before bucket (e.g. 30 then 7), or -1 when the date has passed ("expired" nudge, up to 30 days after).
create or replace function reminder_queue(p_garage uuid)
returns table (vehicle_id uuid, registration text, make text, model text, kind text, due_date date, stage int,
               customer_id uuid, customer_name text, phone text)
language sql stable security definer set search_path = public as $$
  with g as (
    select id, mot_reminder_days, service_reminder_days
    from garages
    where id = p_garage and reminders_enabled and reminder_channel in ('whatsapp', 'both')
      and has_role(p_garage, '{owner,reception}')
  ),
  t as (select (now() at time zone 'Europe/London')::date as d),
  cand as (
    select v.id, v.registration, v.make, v.model, v.customer_id, 'mot'::text as kind, v.mot_due as due,
           (select min(x) from unnest(g.mot_reminder_days) x where v.mot_due <= t.d + x) as bucket
    from vehicles v, g, t
    where v.garage_id = g.id and v.mot_due between t.d - 30 and t.d + (select max(x) from unnest(g.mot_reminder_days) x)
    union all
    select v.id, v.registration, v.make, v.model, v.customer_id, 'service', v.service_due, g.service_reminder_days
    from vehicles v, g, t
    where v.garage_id = g.id and v.service_due between t.d - 30 and t.d + g.service_reminder_days
  ),
  staged as (
    select c.*, case when c.due < t.d then -1 else c.bucket end as stage,
           case when c.due < t.d then c.due else c.due - c.bucket end as window_start
    from cand c, t
  )
  select s.id, s.registration, s.make, s.model, s.kind, s.due, s.stage, cu.id, cu.name, cu.phone
  from staged s
  join customers cu on cu.id = s.customer_id
  where cu.reminder_consent and is_mobile(cu.phone)
    -- already booked in: no need to remind
    and not exists (select 1 from bookings b where b.vehicle_id = s.id and b.status in ('booked', 'confirmed', 'arrived')
                    and b.starts_at >= now() - interval '12 hours')
    and not exists (select 1 from jobs j where j.vehicle_id = s.id and j.status not in ('complete', 'collected'))
    -- already sent at this stage (or a later one), or contacted by hand since this reminder became due
    and not exists (
      select 1 from reminder_log l
      where l.vehicle_id = s.id and l.kind = s.kind and l.due_date = s.due and l.channel <> 'email'
        and (l.stage = s.stage
             or (s.stage > 0 and l.stage > 0 and l.stage < s.stage)
             or (l.stage = 0 and (l.sent_at at time zone 'Europe/London')::date >= s.window_start)))
  order by s.stage = -1 desc, s.due, s.registration
  limit 300;
$$;
revoke execute on function reminder_queue from public, anon;
grant execute on function reminder_queue to authenticated;

-- How many are waiting (sidebar badge and dashboard)
create or replace function reminder_queue_count(p_garage uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from reminder_queue(p_garage);
$$;
revoke execute on function reminder_queue_count from public, anon;
grant execute on function reminder_queue_count to authenticated;
