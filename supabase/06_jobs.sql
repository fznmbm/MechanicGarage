-- RampDesk: Job cards. Run once after 01–05.

-- ---------- Job numbering (atomic per-garage counter) ----------
alter table garages add column if not exists job_counter int not null default 0;
update garages g set job_counter = greatest(job_counter, coalesce((select max(job_number) from jobs j where j.garage_id = g.id), 0));

create or replace function claim_job_number(g uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_member(g) then raise exception 'not allowed'; end if;
  update garages set job_counter = job_counter + 1 where id = g returning job_counter into n;
  return n;
end $$;
revoke execute on function claim_job_number from anon;
grant execute on function claim_job_number to authenticated;

-- ---------- Jobs ----------
alter table jobs add column if not exists bay_id uuid references bays on delete set null;
alter table jobs add column if not exists promised_at timestamptz;
alter table jobs add column if not exists started_at timestamptz;
alter table jobs add column if not exists collected_at timestamptz;
alter table jobs add column if not exists created_by uuid references auth.users default auth.uid();
create unique index if not exists jobs_one_per_booking on jobs (booking_id) where booking_id is not null;
create index if not exists jobs_vehicle on jobs (vehicle_id);

drop policy if exists tenant_all on jobs;
create policy jobs_read   on jobs for select using (is_member(garage_id));
create policy jobs_insert on jobs for insert with check (is_member(garage_id));
create policy jobs_update on jobs for update using (is_member(garage_id)) with check (is_member(garage_id));
create policy jobs_delete on jobs for delete using (has_role(garage_id, '{owner,reception}'));

-- ---------- Job lines ----------
alter table job_lines add column if not exists part_number text;
alter table job_lines add column if not exists cost_pence int;          -- trade cost, for margin
alter table job_lines add column if not exists done boolean not null default false;
alter table job_lines add column if not exists created_at timestamptz not null default now();
create index if not exists job_lines_job on job_lines (job_id, sort_order);

-- ---------- Photos ----------
create table if not exists job_photos (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  job_id uuid not null references jobs on delete cascade,
  path text not null,
  caption text,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists job_photos_job on job_photos (job_id, created_at);
alter table job_photos enable row level security;
create policy job_photos_all on job_photos for all
  using (is_member(garage_id)) with check (is_member(garage_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "job photos read" on storage.objects for select to authenticated
  using (bucket_id = 'job-photos' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "job photos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'job-photos' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "job photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'job-photos' and public.is_member(((storage.foldername(name))[1])::uuid));

-- ---------- Time clocking ----------
create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages on delete cascade,
  job_id uuid not null references jobs on delete cascade,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check (ended_at is null or ended_at > started_at)
);
-- a person can only be clocked on to one job at a time
create unique index if not exists time_entries_one_open on time_entries (user_id) where ended_at is null;
create index if not exists time_entries_job on time_entries (job_id);
alter table time_entries enable row level security;
create policy time_read on time_entries for select using (is_member(garage_id));
create policy time_insert on time_entries for insert
  with check (is_member(garage_id) and user_id = auth.uid());
create policy time_update on time_entries for update
  using (user_id = auth.uid() or has_role(garage_id, '{owner}'))
  with check (is_member(garage_id));
create policy time_delete on time_entries for delete using (has_role(garage_id, '{owner}'));
