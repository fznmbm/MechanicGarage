import { adminConfigured, createAdminClient } from '@/lib/supabase/admin';
import { verifyStripeSignature } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, string> = {
  active: 'active', trialing: 'active', past_due: 'past_due', unpaid: 'past_due',
  canceled: 'cancelled', incomplete_expired: 'cancelled', paused: 'past_due',
};

type Sub = { id: string; customer: string; status: string; current_period_end?: number; metadata?: { garage_id?: string }; items?: { data?: { current_period_end?: number }[] } };

/** Stripe → RampDesk: keeps each garage's plan in step with its subscription */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || !adminConfigured()) return new Response('Not configured', { status: 503 });
  const body = await req.text();
  if (!verifyStripeSignature(body, req.headers.get('stripe-signature'), secret)) return new Response('Bad signature', { status: 400 });

  const event = JSON.parse(body) as { type: string; data: { object: Record<string, unknown> } };
  const sb = createAdminClient();
  const obj = event.data.object;

  if (event.type === 'checkout.session.completed') {
    const garageId = (obj.client_reference_id as string) || (obj.metadata as { garage_id?: string })?.garage_id;
    if (garageId) {
      await sb.from('garages').update({
        stripe_customer_id: obj.customer as string, stripe_subscription_id: obj.subscription as string, plan_status: 'active',
      }).eq('id', garageId).neq('plan_status', 'comped');
    }
  } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const s = obj as unknown as Sub;
    const end = s.current_period_end ?? s.items?.data?.[0]?.current_period_end;
    const patch = {
      plan_status: event.type.endsWith('deleted') ? 'cancelled' : STATUS[s.status] ?? 'past_due',
      plan_renews_at: end ? new Date(end * 1000).toISOString() : null,
      stripe_subscription_id: s.id,
    };
    let q = sb.from('garages').update(patch).neq('plan_status', 'comped');
    q = s.metadata?.garage_id ? q.eq('id', s.metadata.garage_id) : q.eq('stripe_customer_id', s.customer);
    await q;
  }
  return Response.json({ received: true });
}
