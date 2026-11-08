'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { isYmd } from '@/lib/time';

/** Record that someone contacted the customer (WhatsApp, phone or other) */
export async function logReminder(input: { vehicleId: string; kind: string; due: string | null; channel: string }) {
  const m = await getMembership();
  if (!m) return;
  if (!['mot', 'service', 'advisory'].includes(input.kind) || !['whatsapp', 'phone', 'manual'].includes(input.channel)) return;
  const sb = await createClient();
  const { data: v } = await sb.from('vehicles').select('id, customer_id').eq('id', input.vehicleId).eq('garage_id', m.garage_id).maybeSingle();
  if (!v) return;
  await sb.from('reminder_log').insert({
    garage_id: m.garage_id, vehicle_id: v.id, customer_id: v.customer_id, kind: input.kind,
    due_date: isYmd(input.due) ? input.due : null, channel: input.channel, stage: 0,
  });
  revalidatePath('/reminders');
}

type QueueItem = { vehicleId: string; kind: string; due: string; stage: number };
const validItem = (i: QueueItem) =>
  /^[0-9a-f-]{36}$/i.test(i.vehicleId) && ['mot', 'service'].includes(i.kind) && isYmd(i.due) && Number.isInteger(i.stage) && i.stage !== 0;

/**
 * Send list: record that a reminder went out on WhatsApp (or was dealt with another way, when skipped).
 * Each reminder can only be recorded once, so two people can't send the same one.
 */
export async function markQueueItem(input: QueueItem & { how: 'whatsapp' | 'done' }): Promise<{ ok: boolean; message?: string }> {
  const m = await getMembership();
  if (!m || m.role === 'mechanic' || !validItem(input)) return { ok: false, message: 'Not allowed' };
  const sb = await createClient();
  const { data: v } = await sb.from('vehicles').select('id, customer_id').eq('id', input.vehicleId).eq('garage_id', m.garage_id).maybeSingle();
  if (!v) return { ok: false, message: 'Vehicle not found' };
  const { error } = await sb.from('reminder_log').insert({
    garage_id: m.garage_id, vehicle_id: v.id, customer_id: v.customer_id, kind: input.kind,
    due_date: input.due, stage: input.stage, channel: input.how === 'whatsapp' ? 'whatsapp' : 'manual',
  });
  if (error?.code === '23505') {
    // someone else got there first
    const { data: first } = await sb.from('reminder_log').select('sent_by, sent_at').eq('vehicle_id', v.id).eq('kind', input.kind)
      .eq('due_date', input.due).eq('stage', input.stage).eq('channel', 'whatsapp').maybeSingle();
    const { data: who } = first?.sent_by
      ? await sb.from('garage_members').select('display_name').eq('garage_id', m.garage_id).eq('user_id', first.sent_by).maybeSingle()
      : { data: null };
    revalidatePath('/reminders');
    return { ok: false, message: `Already sent${who?.display_name ? ` by ${who.display_name}` : ''}` };
  }
  if (error) return { ok: false, message: 'Could not save. Please try again.' };
  revalidatePath('/reminders');
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Undo "sent" (tapped by mistake, or WhatsApp didn't open). Only recent ones, only your own. */
export async function undoQueueItem(input: QueueItem): Promise<{ ok: boolean }> {
  const m = await getMembership();
  if (!m || m.role === 'mechanic' || !validItem(input)) return { ok: false };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from('reminder_log').delete()
    .eq('garage_id', m.garage_id).eq('vehicle_id', input.vehicleId).eq('kind', input.kind).eq('due_date', input.due).eq('stage', input.stage)
    .in('channel', ['whatsapp', 'manual']).eq('sent_by', user?.id ?? '').gte('sent_at', new Date(Date.now() - 30 * 60_000).toISOString());
  revalidatePath('/reminders');
  revalidatePath('/', 'layout');
  return { ok: !error };
}

/** Declined work: mark the items as followed up so they leave the list */
export async function markDeclinedFollowedUp(fd: FormData) {
  const m = await getMembership();
  if (!m || m.role === 'mechanic') return;
  const ids = fd.getAll('line_id').map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50);
  if (!ids.length) return;
  const sb = await createClient();
  await sb.from('job_lines').update({ followed_up_at: new Date().toISOString() }).in('id', ids).eq('garage_id', m.garage_id);
  revalidatePath('/reminders');
}
