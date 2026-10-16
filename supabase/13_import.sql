-- RampDesk: CSV import of customers and vehicles. Run once after 01–12.

-- Phone numbers compared by digits only, with +44 / 44 turned into a leading 0
create or replace function norm_phone(p text) returns text
language sql immutable as $$
  select nullif(regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^(00)?44', '0'), '');
$$;

create index if not exists customers_garage_phone on customers (garage_id, norm_phone(phone));
create index if not exists customers_garage_email on customers (garage_id, lower(email));

-- Imports a batch of rows (max 500). Each row is an object with any of:
--   name, phone, email, address, postcode, customer_notes, consent (bool),
--   registration, make, model, colour, fuel_type, year (int), vin, mot_due, service_due (yyyy-mm-dd), mileage (int), vehicle_notes
-- Customers are matched by phone or email, vehicles by registration. Existing details are never overwritten,
-- only blanks are filled in. Returns counts and the first 50 row errors (row = position in the batch + p_offset).
create or replace function import_customers(p_garage uuid, p_rows jsonb, p_consent boolean default false, p_offset int default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; i int := 0;
  v_name text; v_phone text; v_email text; v_reg text; v_consent boolean;
  cust uuid; veh vehicles; created boolean;
  c_new int := 0; c_match int := 0; v_new int := 0; v_upd int := 0; skipped int := 0;
  errs jsonb := '[]'::jsonb;
begin
  if not has_role(p_garage, '{owner,reception}') then raise exception 'Only the owner or reception can import'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'Send up to 500 rows at a time'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      v_name  := left(nullif(trim(r->>'name'), ''), 100);
      v_phone := left(nullif(trim(r->>'phone'), ''), 30);
      v_email := left(lower(nullif(trim(r->>'email'), '')), 200);
      v_reg   := upper(regexp_replace(coalesce(r->>'registration', ''), '[^A-Za-z0-9]', '', 'g'));
      v_consent := p_consent or coalesce((r->>'consent')::boolean, false);
      if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then v_email := null; end if;
      if v_reg <> '' and (length(v_reg) > 8 or length(v_reg) < 2) then raise exception 'Registration "%" is not valid', r->>'registration'; end if;
      if v_name is null and v_phone is null and v_email is null and v_reg = '' then
        skipped := skipped + 1; continue;
      end if;

      -- Customer
      cust := null;
      if v_name is not null or v_phone is not null or v_email is not null then
        select id into cust from customers
         where garage_id = p_garage
           and ((v_phone is not null and norm_phone(phone) = norm_phone(v_phone))
             or (v_email is not null and lower(email) = v_email))
         order by created_at limit 1;
        if cust is null then
          insert into customers (garage_id, name, phone, email, address, postcode, notes, reminder_consent, consent_at)
          values (p_garage, coalesce(v_name, v_phone, v_email), v_phone, v_email,
                  left(nullif(trim(r->>'address'), ''), 300), left(upper(nullif(trim(r->>'postcode'), '')), 10),
                  left(nullif(trim(r->>'customer_notes'), ''), 2000), v_consent, case when v_consent then now() end)
          returning id into cust;
          c_new := c_new + 1;
        else
          update customers set
            phone    = coalesce(phone, v_phone),
            email    = coalesce(email, v_email),
            address  = coalesce(address, left(nullif(trim(r->>'address'), ''), 300)),
            postcode = coalesce(postcode, left(upper(nullif(trim(r->>'postcode'), '')), 10)),
            reminder_consent = reminder_consent or v_consent,
            consent_at = case when not reminder_consent and v_consent then now() else consent_at end
          where id = cust;
          c_match := c_match + 1;
        end if;
      end if;

      -- Vehicle
      if v_reg <> '' then
        select * into veh from vehicles where garage_id = p_garage and registration = v_reg;
        created := not found;
        if created then
          insert into vehicles (garage_id, customer_id, registration, make, model, colour, fuel_type,
                                year_of_manufacture, vin, mot_due, service_due, last_mileage, notes)
          values (p_garage, cust, v_reg,
                  left(nullif(trim(r->>'make'), ''), 50), left(nullif(trim(r->>'model'), ''), 80),
                  left(nullif(trim(r->>'colour'), ''), 30), left(nullif(trim(r->>'fuel_type'), ''), 30),
                  (r->>'year')::int, left(upper(nullif(trim(r->>'vin'), '')), 17),
                  (r->>'mot_due')::date, (r->>'service_due')::date, (r->>'mileage')::int,
                  left(nullif(trim(r->>'vehicle_notes'), ''), 2000));
          v_new := v_new + 1;
        else
          update vehicles set
            customer_id = coalesce(customer_id, cust),
            make   = coalesce(make, left(nullif(trim(r->>'make'), ''), 50)),
            model  = coalesce(model, left(nullif(trim(r->>'model'), ''), 80)),
            colour = coalesce(colour, left(nullif(trim(r->>'colour'), ''), 30)),
            fuel_type = coalesce(fuel_type, left(nullif(trim(r->>'fuel_type'), ''), 30)),
            year_of_manufacture = coalesce(year_of_manufacture, (r->>'year')::int),
            vin    = coalesce(vin, left(upper(nullif(trim(r->>'vin'), '')), 17)),
            mot_due = coalesce(mot_due, (r->>'mot_due')::date),
            service_due = coalesce(service_due, (r->>'service_due')::date),
            last_mileage = greatest(last_mileage, (r->>'mileage')::int)
          where id = veh.id;
          v_upd := v_upd + 1;
        end if;
      end if;
    exception when others then
      skipped := skipped + 1;
      if jsonb_array_length(errs) < 50 then
        errs := errs || jsonb_build_object('row', coalesce((r->>'line')::int, p_offset + i), 'message', sqlerrm);
      end if;
    end;
  end loop;

  return jsonb_build_object('customers_created', c_new, 'customers_matched', c_match,
    'vehicles_created', v_new, 'vehicles_updated', v_upd, 'skipped', skipped, 'errors', errs);
end $$;

revoke all on function import_customers from public, anon;
grant execute on function import_customers to authenticated;
