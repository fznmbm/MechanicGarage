import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { garageLink } from '@/lib/garage-url';
import { reminderMessage } from '@/lib/reminders';
import { waLink } from '@/lib/phone';
import { addDays, ukToday, ukDayRange, ukTime } from '@/lib/time';
import { ukDate } from '@/lib/format';
import type { SendItem, SentItem } from './send-list';

type Q = {
  vehicle_id: string; registration: string; make: string | null; model: string | null; kind: 'mot' | 'service';
  due_date: string; stage: number; customer_id: string; customer_name: string; phone: string;
};

const KIND = { mot: 'MOT', service: 'Service', advisory: 'Advisory' } as Record<string, string>;

/** Label for a reminder, e.g. "MOT due 14 Dec · 2nd reminder" */
function label(kind: string, due: string, stage: number, stages: number[]) {
  if (stage === -1) return `${KIND[kind]} ${kind === 'mot' ? 'expired' : 'was due'} ${ukDate(due)}`;
  const second = kind === 'mot' && stages.length > 1 && stage === Math.min(...stages);
  return `${KIND[kind]} due ${ukDate(due)}${second ? ' · 2nd reminder' : ''}`;
}

/** Today's WhatsApp send list for the Reminders page */
export async function loadSendList(garageId: string): Promise<{
  items: SendItem[]; sent: SentItem[]; waiting: number; noConsent: number; off: 'disabled' | 'email' | null;
}> {
  const sb = await createClient();
  const { start } = ukDayRange();
  const [{ data: g }, { data: queue }, { data: logs }, { data: members }] = await Promise.all([
    sb.from('garages').select('name, phone, slug, custom_domain, online_booking_enabled, reminders_enabled, reminder_channel, mot_reminder_days, msg_mot, msg_service')
      .eq('id', garageId).single(),
    sb.rpc('reminder_queue', { p_garage: garageId }),
    sb.from('reminder_log').select('id, kind, channel, stage, sent_at, sent_by, vehicle:vehicles(registration), customer:customers(name)')
      .eq('garage_id', garageId).in('channel', ['whatsapp', 'manual']).neq('stage', 0).gte('sent_at', start.toISOString())
      .order('sent_at', { ascending: false }).limit(100),
    sb.from('garage_members').select('user_id, display_name').eq('garage_id', garageId),
  ]);
  if (!g) return { items: [], sent: [], waiting: 0, noConsent: 0, off: 'disabled' };
  const off = !g.reminders_enabled ? 'disabled' : g.reminder_channel === 'email' ? 'email' : null;

  const bookUrl = g.online_booking_enabled ? garageLink(g, '/book') : null;
  const stages = (g.mot_reminder_days ?? [30]) as number[];
  const today = ukToday();
  const items: SendItem[] = ((queue ?? []) as Q[]).flatMap((q) => {
    const message = reminderMessage({
      kind: q.kind, firstName: q.customer_name.split(' ')[0], garage: g.name, phone: g.phone, registration: q.registration,
      make: q.make, due: q.due_date, bookUrl, overdue: q.due_date < today, template: q.kind === 'mot' ? g.msg_mot : g.msg_service,
    });
    const waUrl = waLink(q.phone, message);
    if (!waUrl) return [];
    return [{
      key: `${q.vehicle_id}:${q.kind}:${q.due_date}:${q.stage}`, vehicleId: q.vehicle_id, customerId: q.customer_id,
      kind: q.kind, due: q.due_date, stage: q.stage, reg: q.registration,
      vehicle: [q.make, q.model].filter(Boolean).join(' ') || 'Vehicle', customer: q.customer_name, phone: q.phone,
      label: label(q.kind, q.due_date, q.stage, stages), overdue: q.stage === -1, message, waUrl,
    }];
  });

  const names = new Map(((members ?? []) as { user_id: string; display_name: string }[]).map((x) => [x.user_id, x.display_name]));
  const sent: SentItem[] = ((logs ?? []) as unknown as {
    id: string; kind: string; channel: string; stage: number; sent_at: string; sent_by: string | null;
    vehicle: { registration: string } | null; customer: { name: string } | null;
  }[]).map((l) => ({
    key: l.id, reg: l.vehicle?.registration ?? '', customer: l.customer?.name ?? 'Customer',
    label: `${KIND[l.kind]}${l.stage === -1 ? ' expired' : ' reminder'}`,
    how: l.channel === 'whatsapp' ? 'WhatsApp' : 'Done', when: ukTime(l.sent_at), by: l.sent_by ? names.get(l.sent_by) ?? null : null,
  }));

  // customers who are due but can't go on the list (no consent or no mobile), so the garage knows they exist
  let noConsent = 0;
  if (!off) {
    const { data: due } = await sb.from('vehicles').select('id, customer:customers!inner(reminder_consent, phone)', { count: 'exact' })
      .eq('garage_id', garageId).gte('mot_due', today).lte('mot_due', addDays(today, Math.max(...stages))).limit(500);
    noConsent = ((due ?? []) as unknown as { customer: { reminder_consent: boolean; phone: string | null } }[])
      .filter((v) => !v.customer.reminder_consent || !waLink(v.customer.phone)).length;
  }
  return { items, sent, waiting: items.length, noConsent, off };
}
