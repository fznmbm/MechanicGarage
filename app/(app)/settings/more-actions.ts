'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { orNull, str } from '@/lib/validate';
import { parsePounds } from '@/lib/money';
import type { ActionState } from '@/lib/types';
import { DEFAULT_MESSAGES } from '@/lib/reminders';

const oops = (message: string): ActionState => ({ ok: false, message, ts: Date.now() });
const done = (message: string): ActionState => ({ ok: true, message, ts: Date.now() });
const fail = (errors: Record<string, string>): ActionState => ({ ok: false, message: 'Please fix the highlighted fields', errors, ts: Date.now() });

async function owner() {
  const m = await getMembership();
  if (!m || m.role !== 'owner') return null;
  return { m, sb: await createClient() };
}

export async function saveBookingSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await owner();
  if (!c) return oops('Only the owner can change settings');
  const lead = Number(str(fd, 'booking_lead_hours'));
  const ahead = Number(str(fd, 'booking_days_ahead'));
  const msg = str(fd, 'booking_message');
  const errors: Record<string, string> = {};
  if (!Number.isInteger(lead) || lead < 0 || lead > 168) errors.booking_lead_hours = 'Between 0 and 168 hours';
  if (!Number.isInteger(ahead) || ahead < 1 || ahead > 120) errors.booking_days_ahead = 'Between 1 and 120 days';
  if (msg.length > 300) errors.booking_message = 'Keep it under 300 characters';
  if (Object.keys(errors).length) return fail(errors);

  const enabled = fd.get('online_booking_enabled') === 'on';
  const { error } = await c.sb.from('garages').update({
    online_booking_enabled: enabled, booking_lead_hours: lead, booking_days_ahead: ahead, booking_message: orNull(msg),
  }).eq('id', c.m.garage_id);
  if (error) return oops(error.message);
  revalidatePath('/settings');
  return done(enabled ? 'Online booking is on' : 'Online booking settings saved');
}

export async function saveService(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await owner();
  if (!c) return oops('Only the owner can change settings');
  const id = str(fd, 'id');
  const name = str(fd, 'name');
  const duration = Number(str(fd, 'duration_minutes'));
  const priceRaw = str(fd, 'price_from');
  const price = priceRaw ? parsePounds(priceRaw) : null;
  const errors: Record<string, string> = {};
  if (!name || name.length > 60) errors.name = 'Enter a name (up to 60 characters)';
  if (!Number.isInteger(duration) || duration < 15 || duration > 600) errors.duration_minutes = 'Choose a duration';
  if (priceRaw && price === null) errors.price_from = 'Enter a price like 54.85';
  if (Object.keys(errors).length) return fail(errors);

  const row = { name, duration_minutes: duration, price_from_pence: price, description: orNull(str(fd, 'description')) };
  const { error } = id
    ? await c.sb.from('online_services').update(row).eq('id', id).eq('garage_id', c.m.garage_id)
    : await c.sb.from('online_services').insert({ ...row, garage_id: c.m.garage_id, sort_order: Date.now() % 100000 });
  if (error) return oops(error.message);
  revalidatePath('/settings');
  return done(id ? 'Service updated' : 'Service added');
}

export async function deleteService(fd: FormData) {
  const c = await owner();
  if (!c) return;
  await c.sb.from('online_services').delete().eq('id', str(fd, 'id')).eq('garage_id', c.m.garage_id);
  revalidatePath('/settings');
}

export async function saveReminderSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await owner();
  if (!c) return oops('Only the owner can change settings');
  const first = Number(str(fd, 'mot_first'));
  const second = Number(str(fd, 'mot_second'));
  const service = Number(str(fd, 'service_reminder_days'));
  const errors: Record<string, string> = {};
  if (!Number.isInteger(first) || first < 7 || first > 60) errors.mot_first = 'Between 7 and 60 days';
  if (!Number.isInteger(second) || second < 0 || second >= first) errors.mot_second = 'Must be fewer days than the first reminder (0 to skip)';
  if (!Number.isInteger(service) || service < 1 || service > 60) errors.service_reminder_days = 'Between 1 and 60 days';
  // message wording: saved only when it differs from ours, so improvements to the built-in wording reach everyone else
  const msgs: Record<string, string | null> = {};
  for (const k of ['mot', 'service', 'advisory'] as const) {
    const raw = fd.get(`msg_${k}`);
    if (raw == null) continue;
    const t = String(raw).replace(/\r/g, '').trim();
    if (t.length > 1000) errors[`msg_${k}`] = 'Keep it under 1000 characters';
    else if (!t) errors[`msg_${k}`] = 'The message can’t be empty (use “Use our wording” to reset it)';
    msgs[`msg_${k}`] = t === DEFAULT_MESSAGES[k] ? null : t;
  }
  if (Object.keys(errors).length) return fail(errors);
  const channel = String(fd.get('reminder_channel') ?? '');

  const { error } = await c.sb.from('garages').update({
    reminders_enabled: fd.get('reminders_enabled') === 'on',
    mot_reminder_days: second > 0 ? [first, second] : [first],
    service_reminder_days: service,
    ...(['whatsapp', 'both', 'email'].includes(channel) ? { reminder_channel: channel } : {}),
    ...msgs,
  }).eq('id', c.m.garage_id);
  if (error) return oops(error.message);
  revalidatePath('/settings');
  revalidatePath('/reminders');
  return done('Reminder settings saved');
}
