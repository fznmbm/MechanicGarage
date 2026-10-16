'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { isPlausibleReg, normaliseReg } from '@/lib/reg';
import { orNull, str } from '@/lib/validate';
import { isYmd, ukLocalToUtcISO } from '@/lib/time';
import type { ActionState } from '@/lib/types';

const oops = (message: string): ActionState => ({ ok: false, message, ts: Date.now() });
const done = (message: string): ActionState => ({ ok: true, message, ts: Date.now() });
const fail = (errors: Record<string, string>): ActionState => ({ ok: false, message: 'Please fix the highlighted fields', errors, ts: Date.now() });

async function staff() {
  const m = await getMembership();
  if (!m || m.role === 'mechanic') return null;
  return { m, sb: await createClient() };
}

const touch = (jobId?: string | null) => {
  revalidatePath('/courtesy-cars');
  if (jobId) revalidatePath(`/jobs/${jobId}`);
};

const FUEL = ['Empty', '1/4', '1/2', '3/4', 'Full'];
const miles = (v: string) => (v ? (/^\d{1,7}$/.test(v.replace(/,/g, '')) ? Number(v.replace(/,/g, '')) : NaN) : null);

export async function saveCar(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await staff();
  if (!c) return oops('Only the owner or reception can manage courtesy cars');
  const id = str(fd, 'id');
  const reg = normaliseReg(str(fd, 'registration'));
  const description = str(fd, 'description');
  if (!isPlausibleReg(reg)) return fail({ registration: 'Enter a valid registration' });
  if (description.length > 80) return fail({ description: 'Keep it under 80 characters' });
  const row = { registration: reg, description: orNull(description), notes: orNull(str(fd, 'notes')) };
  const { error } = id
    ? await c.sb.from('courtesy_cars').update(row).eq('id', id).eq('garage_id', c.m.garage_id)
    : await c.sb.from('courtesy_cars').insert({ ...row, garage_id: c.m.garage_id });
  if (error) return oops(error.code === '23505' ? 'That car is already on the list' : error.message);
  touch();
  return done(id ? 'Car updated' : 'Car added');
}

export async function setCarActive(fd: FormData) {
  const c = await staff();
  if (!c) return;
  await c.sb.from('courtesy_cars').update({ active: str(fd, 'active') === '1' }).eq('id', str(fd, 'id')).eq('garage_id', c.m.garage_id);
  touch();
}

export async function lendCar(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await staff();
  if (!c) return oops('Only the owner or reception can lend courtesy cars');
  const carId = str(fd, 'car_id');
  const jobId = str(fd, 'job_id');
  const dueDate = str(fd, 'due_date');
  const dueTime = str(fd, 'due_time');
  const mileage = miles(str(fd, 'mileage_out'));
  const fuel = str(fd, 'fuel_out');
  const errors: Record<string, string> = {};
  if (!carId) errors.car_id = 'Choose a car';
  if (dueDate && !isYmd(dueDate)) errors.due_date = 'Pick a date';
  if (Number.isNaN(mileage)) errors.mileage_out = 'Whole number';
  if (fuel && !FUEL.includes(fuel)) errors.fuel_out = 'Choose a level';
  if (Object.keys(errors).length) return fail(errors);

  let customerId: string | null = orNull(str(fd, 'customer_id'));
  if (jobId) {
    const { data: j } = await c.sb.from('jobs').select('customer_id').eq('id', jobId).eq('garage_id', c.m.garage_id).maybeSingle();
    if (!j) return oops('Job not found');
    customerId = j.customer_id;
  }
  const { error } = await c.sb.from('courtesy_loans').insert({
    garage_id: c.m.garage_id, car_id: carId, job_id: jobId || null, customer_id: customerId,
    due_back_at: dueDate ? ukLocalToUtcISO(dueDate, /^\d{2}:\d{2}$/.test(dueTime) ? dueTime : '17:30') : null,
    mileage_out: mileage, fuel_out: orNull(fuel), licence_checked: fd.get('licence_checked') === 'on', notes: orNull(str(fd, 'notes')),
  });
  if (error) return oops(error.code === '23505' ? 'That car is already out' : error.message);
  touch(jobId);
  return done('Courtesy car lent');
}

export async function returnCar(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await staff();
  if (!c) return oops('Only the owner or reception can do this');
  const id = str(fd, 'loan_id');
  const mileage = miles(str(fd, 'mileage_in'));
  const fuel = str(fd, 'fuel_in');
  if (Number.isNaN(mileage)) return fail({ mileage_in: 'Whole number' });
  if (fuel && !FUEL.includes(fuel)) return fail({ fuel_in: 'Choose a level' });
  const { data: loan } = await c.sb.from('courtesy_loans').select('id, job_id, mileage_out, notes').eq('id', id).eq('garage_id', c.m.garage_id).maybeSingle();
  if (!loan) return oops('Loan not found');
  if (mileage != null && loan.mileage_out != null && mileage < loan.mileage_out) return fail({ mileage_in: 'Lower than the mileage out' });
  const note = str(fd, 'notes');
  const { error } = await c.sb.from('courtesy_loans').update({
    returned_at: new Date().toISOString(), mileage_in: mileage, fuel_in: orNull(fuel),
    notes: note ? [loan.notes, `Returned: ${note}`].filter(Boolean).join('\n') : loan.notes,
  }).eq('id', id);
  if (error) return oops(error.message);
  touch(loan.job_id);
  return done('Car returned');
}
