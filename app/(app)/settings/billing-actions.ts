'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { stripe, stripeConfigured } from '@/lib/stripe';
import { siteOrigin } from '@/lib/url';

export async function startCheckout() {
  const m = await getMembership();
  if (!m || m.role !== 'owner' || !stripeConfigured()) redirect('/settings?tab=plan');
  const sb = await createClient();
  const { data: g } = await sb.from('garages').select('id, name, stripe_customer_id').eq('id', m.garage_id).single();
  const origin = await siteOrigin();
  let url = '/settings?tab=plan&billing=error';
  try {
    const session = await stripe<{ url: string }>('checkout/sessions', {
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID!.trim(), quantity: 1 }],
      client_reference_id: m.garage_id,
      ...(g?.stripe_customer_id ? { customer: g.stripe_customer_id } : { customer_email: m.email }),
      subscription_data: { metadata: { garage_id: m.garage_id } },
      metadata: { garage_id: m.garage_id },
      allow_promotion_codes: true,
      success_url: `${origin}/settings?tab=plan&billing=success`,
      cancel_url: `${origin}/settings?tab=plan`,
    });
    url = session.url;
  } catch { /* fall through to the error redirect */ }
  redirect(url);
}

export async function openBillingPortal() {
  const m = await getMembership();
  if (!m || m.role !== 'owner' || !stripeConfigured()) redirect('/settings?tab=plan');
  const sb = await createClient();
  const { data: g } = await sb.from('garages').select('stripe_customer_id').eq('id', m.garage_id).single();
  if (!g?.stripe_customer_id) redirect('/settings?tab=plan');
  let url = '/settings?tab=plan&billing=error';
  try {
    const session = await stripe<{ url: string }>('billing_portal/sessions', {
      customer: g.stripe_customer_id, return_url: `${await siteOrigin()}/settings?tab=plan`,
    });
    url = session.url;
  } catch { /* fall through */ }
  redirect(url);
}
