-- RampDesk: onboarding + public branding functions. Run after 01_schema.sql.

alter table garages alter column brand_colour drop default;

create or replace function create_garage(p_name text, p_slug text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_slug !~ '^[a-z0-9](-?[a-z0-9])*$' or length(p_slug) > 40 then
    raise exception 'Web address can only use lowercase letters, numbers and hyphens';
  end if;
  if p_slug in ('www','app','admin','api','mail','book','login') then
    raise exception 'That web address is reserved';
  end if;
  insert into garages (name, slug) values (p_name, p_slug) returning id into g;
  insert into garage_members (garage_id, user_id, role, display_name)
    values (g, auth.uid(), 'owner', p_display_name);
  insert into bays (garage_id, name, sort_order)
    values (g, 'Bay 1', 1), (g, 'Bay 2', 2), (g, 'Bay 3', 3);
  return g;
end $$;
revoke execute on function create_garage from anon;

create or replace function garage_public(p_slug text default null, p_host text default null)
returns table (id uuid, name text, slug text, logo_url text, brand_colour text,
               phone text, email text, address text)
language sql stable security definer set search_path = public as $$
  select id, name, slug, logo_url, brand_colour, phone, email, address
  from garages
  where (p_slug is not null and slug = p_slug)
     or (p_host is not null and custom_domain = p_host)
  limit 1;
$$;
grant execute on function garage_public to anon, authenticated;
