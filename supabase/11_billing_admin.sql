-- RampDesk: subscriptions + platform admin. Run once after 10.
-- plan_status: trial | active | past_due | cancelled | comped (free, e.g. your first garage)

alter table garages add column if not exists trial_ends_at timestamptz;
update garages set trial_ends_at = coalesce(trial_ends_at, now() + interval '14 days');
alter table garages alter column trial_ends_at set default now() + interval '14 days';
alter table garages add column if not exists stripe_customer_id text;
alter table garages add column if not exists stripe_subscription_id text;
alter table garages add column if not exists plan_renews_at timestamptz;

create table if not exists platform_admins (user_id uuid primary key references auth.users on delete cascade);
alter table platform_admins enable row level security;  -- no policies: only reachable via functions below

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;
grant execute on function is_platform_admin to authenticated;

create or replace function admin_garages() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Not allowed'; end if;
  return coalesce((select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
    select g.id, g.name, g.slug, g.custom_domain, g.plan_status, g.trial_ends_at, g.plan_renews_at, g.created_at,
      g.stripe_customer_id is not null as has_stripe,
      (select gm.email from garage_members gm where gm.garage_id = g.id and gm.role = 'owner' order by gm.created_at limit 1) as owner_email,
      (select count(*) from garage_members gm where gm.garage_id = g.id and gm.active) as staff,
      (select count(*) from customers c where c.garage_id = g.id) as customers,
      (select count(*) from jobs j where j.garage_id = g.id and j.created_at > now() - interval '30 days') as jobs_30d,
      (select coalesce(sum(i.total_pence), 0) from invoices i where i.garage_id = g.id and i.status <> 'void'
         and i.issued_at > (now() - interval '30 days')::date) as invoiced_30d,
      (select max(j.created_at) from jobs j where j.garage_id = g.id) as last_activity
    from garages g) x), '[]'::jsonb);
end $$;
revoke execute on function admin_garages from public, anon;
grant execute on function admin_garages to authenticated;

create or replace function admin_update_garage(p_id uuid, p_plan_status text, p_trial_ends date, p_custom_domain text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Not allowed'; end if;
  if p_plan_status not in ('trial', 'active', 'past_due', 'cancelled', 'comped') then raise exception 'Invalid plan status'; end if;
  update garages set plan_status = p_plan_status,
    trial_ends_at = case when p_trial_ends is null then trial_ends_at else (p_trial_ends + time '23:59') at time zone 'Europe/London' end,
    custom_domain = nullif(lower(trim(p_custom_domain)), '')
  where id = p_id;
end $$;
revoke execute on function admin_update_garage from public, anon;
grant execute on function admin_update_garage to authenticated;

-- To make yourself platform admin, run once (with your login email):
--   insert into platform_admins (user_id) select id from auth.users where email = 'you@example.com';
