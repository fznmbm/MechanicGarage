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
