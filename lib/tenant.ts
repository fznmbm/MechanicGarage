import { headers } from 'next/headers';
import { cache } from 'react';
import { createClient } from './supabase/server';

export type PublicGarage = {
  id: string; name: string; slug: string; logo_url: string | null;
  brand_colour: string | null; phone: string | null; email: string | null; address: string | null;
};

export type Membership = {
  garage_id: string;
  role: 'owner' | 'reception' | 'mechanic';
  display_name: string;
  email: string;
  garage: { id: string; name: string; slug: string; logo_url: string | null; brand_colour: string | null; plan_status: string; trial_ends_at: string | null };
};

export const getTenant = cache(async (): Promise<PublicGarage | null> => {
  const h = await headers();
  const slug = h.get('x-garage-slug');
  const host = h.get('x-garage-host');
  if (!slug && !host) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc('garage_public', { p_slug: slug, p_host: host });
  return (data?.[0] as PublicGarage) ?? null;
});

export const getMembership = cache(async (): Promise<Membership | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const tenant = await getTenant();
  let q = supabase
    .from('garage_members')
    .select('garage_id, role, display_name, garage:garages(id, name, slug, logo_url, brand_colour, plan_status, trial_ends_at)')
    .eq('user_id', user.id)
    .eq('active', true);
  if (tenant) q = q.eq('garage_id', tenant.id);

  const { data } = await q.limit(1).maybeSingle();
  return data ? ({ ...(data as object), email: user.email ?? '' } as Membership) : null;
});
