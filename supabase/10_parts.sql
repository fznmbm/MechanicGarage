-- RampDesk: parts, stock and suppliers. Run once after 09.

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  name text not null,
  phone text, email text, account_ref text, notes text,
  created_at timestamptz not null default now()
);
create table if not exists parts (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  part_number text not null,
  name text not null,
  supplier_id uuid references suppliers on delete set null,
  cost_pence int,
  sell_pence int not null default 0,
  stock_qty numeric(10,2) not null default 0,
  min_qty numeric(10,2) not null default 0,
  location text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (garage_id, part_number)
);
create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  part_id uuid not null references parts on delete cascade,
  qty_change numeric(10,2) not null,
  reason text not null check (reason in ('job', 'delivery', 'adjustment', 'return')),
  job_id uuid references jobs on delete set null,
  note text,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists parts_garage_name on parts (garage_id, lower(name));
create index if not exists stock_movements_part on stock_movements (part_id, created_at desc);

alter table job_lines add column if not exists part_id uuid references parts on delete set null;

alter table suppliers enable row level security;
alter table parts enable row level security;
alter table stock_movements enable row level security;
create policy suppliers_read on suppliers for select using (is_member(garage_id));
create policy suppliers_write on suppliers for all using (has_role(garage_id, '{owner,reception}')) with check (has_role(garage_id, '{owner,reception}'));
create policy parts_read on parts for select using (is_member(garage_id));
create policy parts_write on parts for all using (has_role(garage_id, '{owner,reception}')) with check (has_role(garage_id, '{owner,reception}'));
create policy stock_read on stock_movements for select using (is_member(garage_id));
create policy stock_insert on stock_movements for insert with check (has_role(garage_id, '{owner,reception}'));

-- Using a stocked part on a job takes it out of stock (and puts it back if removed)
create or replace function job_line_stock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.part_id is not null
     and (tg_op = 'DELETE' or old.part_id is distinct from new.part_id or old.quantity <> new.quantity) then
    update parts set stock_qty = stock_qty + old.quantity where id = old.part_id;
    insert into stock_movements (garage_id, part_id, qty_change, reason, job_id, note)
    values (old.garage_id, old.part_id, old.quantity, 'return', old.job_id, case when tg_op = 'DELETE' then 'Removed from job' else 'Job line changed' end);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.part_id is not null
     and (tg_op = 'INSERT' or old.part_id is distinct from new.part_id or old.quantity <> new.quantity) then
    update parts set stock_qty = stock_qty - new.quantity where id = new.part_id;
    insert into stock_movements (garage_id, part_id, qty_change, reason, job_id)
    values (new.garage_id, new.part_id, -new.quantity, 'job', new.job_id);
  end if;
  return null;
end $$;
drop trigger if exists job_lines_stock on job_lines;
create trigger job_lines_stock after insert or update or delete on job_lines for each row execute function job_line_stock();

-- Manual stock change (delivery / stock-take) by owner or reception
create or replace function adjust_stock(p_part uuid, p_change numeric, p_reason text, p_note text) returns numeric
language plpgsql security definer set search_path = public as $$
declare g uuid; q numeric;
begin
  select garage_id into g from parts where id = p_part;
  if g is null or not has_role(g, '{owner,reception}') then raise exception 'Not allowed'; end if;
  if p_reason not in ('delivery', 'adjustment', 'return') then raise exception 'Invalid reason'; end if;
  update parts set stock_qty = stock_qty + p_change where id = p_part returning stock_qty into q;
  insert into stock_movements (garage_id, part_id, qty_change, reason, note) values (g, p_part, p_change, p_reason, nullif(trim(p_note), ''));
  return q;
end $$;
revoke execute on function adjust_stock from public, anon;
grant execute on function adjust_stock to authenticated;
