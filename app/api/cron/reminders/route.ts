import { adminConfigured, createAdminClient } from '@/lib/supabase/admin';
import { emailConfigured, sendEmail } from '@/lib/email';
import { garageLink } from '@/lib/garage-url';
import { reminderEmail } from '@/lib/reminders';
import { emailEstimateChase } from '@/lib/notify';
import { ukDatePlus, ukToday } from '@/lib/time';
import { waNumber } from '@/lib/phone';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type G = {
  id: string; name: string; slug: string; custom_domain: string | null; phone: string | null; email: string | null;
  brand_colour: string | null; online_booking_enabled: boolean; mot_reminder_days: number[]; service_reminder_days: number;
  reminder_channel: 'whatsapp' | 'both' | 'email' | null;
};
type V = {
  id: string; registration: string; make: string | null; mot_due: string | null; service_due: string | null;
  customer: { id: string; name: string; email: string | null; phone: string | null; reminder_consent: boolean; unsubscribe_token: string } | null;
};

/** Daily job (Vercel Cron): email MOT and service reminders to customers who opted in.
    Customers with a mobile are on the garage's WhatsApp send list instead, unless it sends both. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  if (!adminConfigured() || !emailConfigured()) return Response.json({ ok: false, reason: 'Email or service key not configured' });

  const sb = createAdminClient();
  const today = ukToday();
  const started = Date.now();
  let sent = 0, failed = 0;

  const { data: garages } = await sb.from('garages')
    .select('id, name, slug, custom_domain, phone, email, brand_colour, online_booking_enabled, mot_reminder_days, service_reminder_days, reminder_channel')
    .eq('reminders_enabled', true).in('plan_status', ['trial', 'active', 'comped']);

  for (const g of (garages ?? []) as G[]) {
    // cars already booked in or in the workshop don't need a reminder
    const [{ data: booked }, { data: open }] = await Promise.all([
      sb.from('bookings').select('vehicle_id').eq('garage_id', g.id).in('status', ['booked', 'confirmed', 'arrived'])
        .gte('starts_at', new Date(Date.now() - 12 * 3_600_000).toISOString()).not('vehicle_id', 'is', null).limit(2000),
      sb.from('jobs').select('vehicle_id').eq('garage_id', g.id).not('status', 'in', '(complete,collected)').limit(2000),
    ]);
    const busy = new Set([...(booked ?? []), ...(open ?? [])].map((r) => r.vehicle_id as string));
    const stages = [...(g.mot_reminder_days ?? [30])].sort((a, b) => a - b);          // e.g. [7, 30]
    const maxMot = stages[stages.length - 1] ?? 30;
    const jobs: { kind: 'mot' | 'service'; col: 'mot_due' | 'service_due'; window: number }[] = [
      { kind: 'mot', col: 'mot_due', window: maxMot },
      { kind: 'service', col: 'service_due', window: g.service_reminder_days ?? 14 },
    ];

    for (const job of jobs) {
      const { data: vehicles } = await sb.from('vehicles')
        .select('id, registration, make, mot_due, service_due, customer:customers(id, name, email, phone, reminder_consent, unsubscribe_token)')
        .eq('garage_id', g.id).gte(job.col, today).lte(job.col, ukDatePlus(job.window)).limit(300);

      for (const v of (vehicles ?? []) as unknown as V[]) {
        if (Date.now() - started > 50_000) return Response.json({ ok: true, sent, failed, partial: true });
        const c = v.customer;
        const due = job.kind === 'mot' ? v.mot_due : v.service_due;
        if (!c?.reminder_consent || !c.email || !due || busy.has(v.id)) continue;
        // WhatsApp garages: customers with a mobile are on the send list instead
        if ((g.reminder_channel ?? 'whatsapp') === 'whatsapp' && waNumber(c.phone)) continue;

        // which reminder is this? the smallest "days before" bucket the due date now falls into
        const stage = job.kind === 'mot' ? stages.find((d) => due <= ukDatePlus(d)) ?? maxMot : job.window;

        // claim it first (unique index) so a customer never gets the same reminder twice
        const { error: claim } = await sb.from('reminder_log').insert({
          garage_id: g.id, vehicle_id: v.id, customer_id: c.id, kind: job.kind, due_date: due, stage, channel: 'email', sent_by: null,
        });
        if (claim) continue; // already sent

        const mail = reminderEmail({
          kind: job.kind, firstName: c.name.split(' ')[0], garage: g.name, phone: g.phone, registration: v.registration, make: v.make,
          due, bookUrl: g.online_booking_enabled ? garageLink(g, '/book') : null, brand: g.brand_colour,
          unsubscribeUrl: garageLink(g, `/u/${c.unsubscribe_token}`),
        });
        const res = await sendEmail({ to: c.email, fromName: g.name, replyTo: g.email, ...mail });
        if (res.ok) sent++;
        else {
          failed++;
          await sb.from('reminder_log').delete().eq('vehicle_id', v.id).eq('kind', job.kind).eq('due_date', due).eq('stage', stage).eq('channel', 'email');
        }
        await new Promise((r) => setTimeout(r, 550)); // stay under the email provider's rate limit
      }
    }
  }
  // estimates sent a few days ago with no answer: one reminder each
  let chased = 0;
  const { data: eg } = await sb.from('garages')
    .select('id, name, slug, custom_domain, phone, email, brand_colour, estimate_chase_days')
    .gt('estimate_chase_days', 0).in('plan_status', ['trial', 'active', 'comped']);
  for (const g of (eg ?? []) as (Pick<G, 'id' | 'name' | 'slug' | 'custom_domain' | 'phone' | 'email' | 'brand_colour'> & { estimate_chase_days: number })[]) {
    const { data: due } = await sb.from('estimates')
      .select('id, number, public_token, customer:customers(name, email), vehicle:vehicles(registration)')
      .eq('garage_id', g.id).eq('status', 'sent').is('chased_at', null)
      .lte('sent_at', new Date(Date.now() - g.estimate_chase_days * 86_400_000).toISOString())
      .or(`valid_until.is.null,valid_until.gte.${today}`).limit(100);
    for (const e of (due ?? []) as unknown as { id: string; number: string; public_token: string; customer: { name: string; email: string | null } | null; vehicle: { registration: string } | null }[]) {
      if (Date.now() - started > 55_000) return Response.json({ ok: true, sent, failed, chased, partial: true });
      // claim first so it's never sent twice
      const { data: claimed } = await sb.from('estimates').update({ chased_at: new Date().toISOString() }).eq('id', e.id).is('chased_at', null).select('id');
      if (!claimed?.length || !e.customer?.email) continue;
      const ok = await emailEstimateChase({ garage: g, to: e.customer.email, name: e.customer.name, number: e.number,
        registration: e.vehicle?.registration ?? null, link: garageLink(g, `/q/${e.public_token}`) });
      if (ok) chased++;
      await new Promise((r) => setTimeout(r, 550));
    }
  }
  return Response.json({ ok: true, sent, failed, chased });
}
