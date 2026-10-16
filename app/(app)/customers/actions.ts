'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { normaliseReg } from '@/lib/reg';
import { readCustomer, str } from '@/lib/validate';
import type { ActionState } from '@/lib/types';

const fail = (errors: Record<string, string>, message = 'Please fix the highlighted fields'): ActionState =>
  ({ ok: false, message, errors, ts: Date.now() });
const oops = (message: string): ActionState => ({ ok: false, message, ts: Date.now() });

export async function createCustomer(_: ActionState, fd: FormData): Promise<ActionState> {
  const m = await getMembership();
  if (!m) return oops('You are signed out');
  const { errors, row } = readCustomer(fd);
  if (Object.keys(errors).length) return fail(errors);

  const sb = await createClient();
  const { data, error } = await sb
    .from('customers')
    .insert({ ...row, garage_id: m.garage_id, consent_at: row.reminder_consent ? new Date().toISOString() : null })
    .select('id')
    .single();
  if (error) return oops(error.message);

  revalidatePath('/customers');
  const reg = normaliseReg(str(fd, 'registration'));
  redirect(reg ? `/vehicles/new?customer=${data.id}&reg=${reg}` : `/customers/${data.id}?created=1`);
}

export async function updateCustomer(_: ActionState, fd: FormData): Promise<ActionState> {
  const m = await getMembership();
  if (!m) return oops('You are signed out');
  const id = str(fd, 'id');
  const { errors, row } = readCustomer(fd);
  if (Object.keys(errors).length) return fail(errors);

  const sb = await createClient();
  const { data: before } = await sb.from('customers').select('reminder_consent, consent_at').eq('id', id).single();
  const consent_at = row.reminder_consent
    ? before?.reminder_consent ? before.consent_at : new Date().toISOString()
    : null;

  const { error } = await sb.from('customers').update({ ...row, consent_at }).eq('id', id).eq('garage_id', m.garage_id);
  if (error) return oops(error.message);
  revalidatePath(`/customers/${id}`);
  revalidatePath('/customers');
  return { ok: true, message: 'Customer saved', ts: Date.now() };
}

export async function deleteCustomer(fd: FormData) {
  const m = await getMembership();
  if (!m || m.role === 'mechanic') return;
  const sb = await createClient();
  await sb.from('customers').delete().eq('id', str(fd, 'id')).eq('garage_id', m.garage_id);
  revalidatePath('/customers');
  redirect('/customers');
}

export type CustomerHit = { id: string; name: string; phone: string | null; email: string | null; postcode: string | null };

/** Quick search used by the customer picker */
export async function searchCustomers(q: string): Promise<CustomerHit[]> {
  const m = await getMembership();
  if (!m) return [];
  const term = q.trim().replace(/[%,()*\\]/g, ' ').slice(0, 50);
  if (term.length < 2) return [];
  const sb = await createClient();
  const { data } = await sb
    .from('customers')
    .select('id, name, phone, email, postcode')
    .eq('garage_id', m.garage_id)
    .or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,postcode.ilike.%${term}%`)
    .order('name')
    .limit(8);
  return data ?? [];
}
