import { adminConfigured, createAdminClient } from '@/lib/supabase/admin';
import { emailConfigured, sendEmail } from '@/lib/email';
import { garageLink } from '@/lib/garage-url';
import { reminderEmail } from '@/lib/reminders';
import { ukDatePlus, ukToday } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type G = {
  id: string; name: string; slug: string; custom_domain: string | null; phone: string | null; email: string | null;
  brand_colour: string | null; online_booking_enabled: boolean; mot_reminder_days: number[]; service_reminder_days: number;
};
type V = {
  id: string; registration: string; make: string | null; mot_due: string | null; service_due: string | null;
  customer: { id: string; name: string; email: string | null; reminder_consent: boolean; unsubscribe_token: string } | null;
};

/** Daily job (Vercel Cron): email MOT and service reminders to customers who opted in */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  if (!adminConfigured() || !emailConfigured()) return Response.json({ ok: false, reason: 'Email or service key not configured' });

  const sb = createAdminClient();
  const today = ukToday();
  const started = Date.now();
  let sent = 0, failed = 0;

  const { data: garages } = await sb.from('garages')
    .select('id, name, slug, custom_domain, phone, email, brand_colour, online_booking_enabled, mot_reminder_days, service_reminder_days')
    .eq('reminders_enabled', true).in('plan_status', ['trial', 'active', 'comped']);

  for (const g of (garages ?? []) as G[]) {
    const stages = [...(g.mot_reminder_days ?? [30])].sort((a, b) => a - b);          // e.g. [7, 30]
    const maxMot = stages[stages.length - 1] ?? 30;
    const jobs: { kind: 'mot' | 'service'; col: 'mot_due' | 'service_due'; window: number }[] = [
      { kind: 'mot', col: 'mot_due', window: maxMot },
      { kind: 'service', col: 'service_due', window: g.service_reminder_days ?? 14 },
    ];

    for (const job of jobs) {
      const { data: vehicles } = await sb.from('vehicles')
        .select('id, registration, make, mot_due, service_due, customer:customers(id, name, email, reminder_consent, unsubscribe_token)')
        .eq('garage_id', g.id).gte(job.col, today).lte(job.col, ukDatePlus(job.window)).limit(300);

      for (const v of (vehicles ?? []) as unknown as V[]) {
        if (Date.now() - started > 50_000) return Response.json({ ok: true, sent, failed, partial: true });
        const c = v.customer;
        const due = job.kind === 'mot' ? v.mot_due : v.service_due;
        if (!c?.reminder_consent || !c.email || !due) continue;

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
  return Response.json({ ok: true, sent, failed });
}
