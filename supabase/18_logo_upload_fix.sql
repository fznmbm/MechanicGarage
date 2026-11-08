-- Fix "new row violates row-level security policy" when uploading a logo.
drop policy if exists "logos owner select" on storage.objects;
create policy "logos owner select" on storage.objects for select to authenticated
  using (bucket_id = 'garage-logos'
         and public.has_role(((storage.foldername(name))[1])::uuid, '{owner}'));