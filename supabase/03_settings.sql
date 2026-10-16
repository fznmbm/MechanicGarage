-- RampDesk: Settings support. Run once in the Supabase SQL editor after 01 and 02.

-- Extra business fields
alter table garages add column if not exists postcode text;
alter table garages add column if not exists website text;

-- Owners may only edit these columns (not slug, plan_status, custom_domain, etc.)
revoke update on garages from anon, authenticated;
grant update (name, address, postcode, phone, email, website, logo_url, brand_colour,
              labour_rate_pence, vat_registered, vat_number, vat_effective_from, default_vat_rate,
              invoice_prefix, next_invoice_number, payment_terms_days, invoice_terms)
  on garages to authenticated;

drop policy if exists garage_update on garages;
create policy garage_update on garages for update
  using (has_role(id, '{owner}')) with check (has_role(id, '{owner}'));

-- Bays: everyone in the garage can read, only owners can change
drop policy if exists tenant_all on bays;
create policy bays_read  on bays for select using (is_member(garage_id));
create policy bays_write on bays for all
  using (has_role(garage_id, '{owner}')) with check (has_role(garage_id, '{owner}'));

-- Logo storage (public bucket, 1 MB, images only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('garage-logos', 'garage-logos', true, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- Files live under <garage_id>/... and only that garage's owners can write them
create policy "logos owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'garage-logos'
              and public.has_role(((storage.foldername(name))[1])::uuid, '{owner}'));
create policy "logos owner update" on storage.objects for update to authenticated
  using (bucket_id = 'garage-logos'
         and public.has_role(((storage.foldername(name))[1])::uuid, '{owner}'));
create policy "logos owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'garage-logos'
         and public.has_role(((storage.foldername(name))[1])::uuid, '{owner}'));
