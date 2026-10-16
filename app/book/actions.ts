'use server';

import { createClient } from '@/lib/supabase/server';
import { isYmd } from '@/lib/time';

export async function getSlots(garageId: string, date: string, duration: number): Promise<string[]> {
  if (!isYmd(date)) return [];
  const sb = await createClient();
  const { data } = await sb.rpc('booking_slots', { p_garage: garageId, p_date: date, p_duration: duration });
  return (data as string[] | null) ?? [];
}

export type BookResult = { ok: true; reference: string } | { ok: false; error: string };

export async function submitBooking(input: {
  garageId: string; serviceId: string; date: string; time: string; reg: string; name: string; phone: string;
  email: string; notes: string; consent: boolean; website: string;
}): Promise<BookResult> {
  // honeypot: real customers never fill the hidden "website" field
  if (input.website) return { ok: true, reference: 'THANKS' };
  if (!isYmd(input.date) || !/^\d{2}:\d{2}$/.test(input.time)) return { ok: false, error: 'Please pick a date and time' };
  const sb = await createClient();
  const { data, error } = await sb.rpc('create_online_booking', {
    p_garage: input.garageId, p_service: input.serviceId, p_date: input.date, p_time: input.time,
    p_reg: input.reg, p_name: input.name, p_phone: input.phone, p_email: input.email, p_notes: input.notes,
    p_consent: input.consent,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, reference: (data as { reference: string }).reference };
}
