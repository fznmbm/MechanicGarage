'use server';

import { emailBookingConfirmation } from '@/lib/notify';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { isPlausibleReg, normaliseReg } from '@/lib/reg';
import { orNull, readCustomer, str } from '@/lib/validate';
import { isYmd, ukLocalToUtcISO, ukTime } from '@/lib/time';
import type { ActionState } from '@/lib/types';

const fail = (errors: Record<string, string>, message = 'Please fix the highlighted fields'): ActionState =>
  ({ ok: false, message, errors, ts: Date.now() });
const oops = (message: string): ActionState => ({ ok: false, message, ts: Date.now() });

const ACTIVE = ['booked', 'confirmed', 'arrived'];

/* ---------------- Vehicle search for the booking form ---------------- */

export type VehicleHit = {
  id: string; registration: string; make: string | null; model: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
};

export async function searchVehicles(q: string): Promise<VehicleHit[]> {
  const m = await getMembership();
  if (!m) return [];
  const term = q.trim().replace(/[%,()*\\]/g, ' ').slice(0, 40);
  if (term.length < 2) return [];
  const reg = normaliseReg(term);
  const sb = await createClient();

  const { data: owners } = await sb.from('customers').select('id')
    .eq('garage_id', m.garage_id).or(`name.ilike.%${term}%,phone.ilike.%${term}%`).limit(30);
  const ors: string[] = [];
  if (reg) ors.push(`registration.ilike.${reg}%`);
  if (owners?.length) ors.push(`customer_id.in.(${owners.map((o) => o.id).join(',')})`);
  if (!ors.length) return [];

  const { data } = await sb.from('vehicles')
    .select('id, registration, make, model, customer:customers(id, name, phone)')
    .eq('garage_id', m.garage_id).or(ors.join(',')).order('registration').limit(8);
  return (data ?? []) as unknown as VehicleHit[];
}

/* ---------------- Shared parsing ---------------- */

type Parsed = {
  errors: Record<string, string>;
  row: {
    service_type: string; starts_at: string; ends_at: string; bay_id: string | null; mechanic_id: string | null;
    status: string; source: string; notes: string | null;
  };
};

function readBooking(fd: FormData): Parsed {
  const errors: Record<string, string> = {};
  const service = str(fd, 'service_type');
  const date = str(fd, 'date');
  const time = str(fd, 'time');
  const duration = Number(str(fd, 'duration'));

  if (!service) errors.service_type = 'Choose what the booking is for';
  else if (service.length > 80) errors.service_type = 'Keep it under 80 characters';
  if (!isYmd(date)) errors.date = 'Pick a date';
  if (!/^\d{2}:\d{2}$/.test(time)) errors.time = 'Pick a start time';
  if (!Number.isInteger(duration) || duration < 5 || duration > 24 * 60) errors.duration = 'Choose how long it takes';

  const starts = !errors.date && !errors.time ? ukLocalToUtcISO(date, time) : new Date().toISOString();
  const ends = new Date(new Date(starts).getTime() + (duration || 60) * 60_000).toISOString();

  return {
    errors,
    row: {
      service_type: service,
      starts_at: starts,
      ends_at: ends,
      bay_id: orNull(str(fd, 'bay_id')),
      mechanic_id: orNull(str(fd, 'mechanic_id')),
      status: ['booked', 'confirmed', 'arrived', 'cancelled', 'no_show'].includes(str(fd, 'status')) ? str(fd, 'status') : 'booked',
      source: ['phone', 'walk_in', 'online', 'email'].includes(str(fd, 'source')) ? str(fd, 'source') : 'phone',
      notes: orNull(str(fd, 'notes')),
    },
  };
}

/** Existing vehicle, or quick-add a new vehicle (+ customer) from the booking form */
async function resolveVehicle(fd: FormData, garageId: string) {
  const sb = await createClient();
  const mode = str(fd, 'vehicle_mode');

  if (mode === 'existing') {
    const id = str(fd, 'vehicle_id');
    const { data } = await sb.from('vehicles').select('id, customer_id').eq('id', id).eq('garage_id', garageId).maybeSingle();
    if (!data) return { errors: { vehicle: 'Choose a vehicle' } };
    return { vehicleId: data.id as string, customerId: data.customer_id as string | null };
  }

  if (mode !== 'new') return { errors: { vehicle: 'Choose a vehicle or add a new one' } };

  const errors: Record<string, string> = {};
  const reg = normaliseReg(str(fd, 'nv_registration'));
  if (!isPlausibleReg(reg)) errors.nv_registration = 'Enter a valid UK registration';
  const cust = readCustomer(fd, 'nc_');
  Object.assign(errors, cust.errors);
  if (Object.keys(errors).length) return { errors };

  const { data: dupe } = await sb.from('vehicles').select('id, customer_id')
    .eq('garage_id', garageId).eq('registration', reg).maybeSingle();
  if (dupe) return { vehicleId: dupe.id as string, customerId: dupe.customer_id as string | null };

  const { data: c, error: ce } = await sb.from('customers')
    .insert({ ...cust.row, garage_id: garageId, consent_at: cust.row.reminder_consent ? new Date().toISOString() : null })
    .select('id').single();
  if (ce) return { error: ce.message };

  let history: unknown = null;
  try { history = JSON.parse(str(fd, 'nv_mot_history') || 'null'); } catch { history = null; }
  const num = (k: string) => (str(fd, k) && Number.isFinite(Number(str(fd, k))) ? Number(str(fd, k)) : null);

  const { data: v, error: ve } = await sb.from('vehicles').insert({
    garage_id: garageId,
    customer_id: c.id,
    registration: reg,
    make: orNull(str(fd, 'nv_make')),
    model: orNull(str(fd, 'nv_model')),
    colour: orNull(str(fd, 'nv_colour')),
    fuel_type: orNull(str(fd, 'nv_fuel_type')),
    engine_size: num('nv_engine_size'),
    year_of_manufacture: num('nv_year'),
    mot_due: isYmd(str(fd, 'nv_mot_due')) ? str(fd, 'nv_mot_due') : null,
    last_mileage: num('nv_last_mileage'),
    mot_history: Array.isArray(history) ? history : null,
    mot_checked_at: Array.isArray(history) ? new Date().toISOString() : null,
  }).select('id').single();
  if (ve) return { error: ve.message };
  return { vehicleId: v.id as string, customerId: c.id as string };
}

/** Bay or mechanic already busy at that time? */
async function findClash(garageId: string, row: Parsed['row'], excludeId?: string) {
  if (!ACTIVE.includes(row.status) || (!row.bay_id && !row.mechanic_id)) return null;
  const sb = await createClient();
  const ors = [row.bay_id && `bay_id.eq.${row.bay_id}`, row.mechanic_id && `mechanic_id.eq.${row.mechanic_id}`].filter(Boolean);
  let q = sb.from('bookings')
    .select('id, starts_at, ends_at, service_type, bay_id, mechanic_id, vehicle:vehicles(registration)')
    .eq('garage_id', garageId).in('status', ACTIVE)
    .lt('starts_at', row.ends_at).gt('ends_at', row.starts_at)
    .or(ors.join(','))
    .limit(1);
  if (excludeId) q = q.neq('id', excludeId);
  const { data } = await q;
  const hit = data?.[0] as unknown as { starts_at: string; ends_at: string; service_type: string; bay_id: string | null; vehicle: { registration: string } | null } | undefined;
  if (!hit) return null;
  const what = hit.bay_id && hit.bay_id === row.bay_id ? 'That bay' : 'That mechanic';
  return `${what} is already booked ${ukTime(hit.starts_at)}–${ukTime(hit.ends_at)} (${hit.service_type}${hit.vehicle ? `, ${hit.vehicle.registration}` : ''}).`;
}

/* ---------------- Create / update ---------------- */

export async function createBooking(_: ActionState, fd: FormData): Promise<ActionState> {
  const m = await getMembership();
  if (!m) return oops('You are signed out');

  const { errors, row } = readBooking(fd);
  if (Object.keys(errors).length) return fail(errors);

  if (fd.get('allow_clash') !== 'on') {
    const clash = await findClash(m.garage_id, row);
    if (clash) return fail({ clash }, clash);
  }

  const veh = await resolveVehicle(fd, m.garage_id);
  if ('errors' in veh && veh.errors) return fail(veh.errors);
  if ('error' in veh && veh.error) return oops(veh.error);

  const sb = await createClient();
  const { data, error } = await sb.from('bookings')
    .insert({ ...row, garage_id: m.garage_id, vehicle_id: veh.vehicleId, customer_id: veh.customerId })
    .select('id').single();
  if (error) return oops(error.message);

  if (fd.get('send_confirmation') !== 'off') await confirmBooking(sb, m.garage_id, data.id);

  revalidatePath('/diary');
  revalidatePath('/');
  redirect(`/diary/${data.id}?created=1`);
}

export async function updateBooking(_: ActionState, fd: FormData): Promise<ActionState> {
  const m = await getMembership();
  if (!m) return oops('You are signed out');
  const id = str(fd, 'id');

  const { errors, row } = readBooking(fd);
  if (Object.keys(errors).length) return fail(errors);

  if (fd.get('allow_clash') !== 'on') {
    const clash = await findClash(m.garage_id, row, id);
    if (clash) return fail({ clash }, clash);
  }

  const veh = await resolveVehicle(fd, m.garage_id);
  if ('errors' in veh && veh.errors) return fail(veh.errors);
  if ('error' in veh && veh.error) return oops(veh.error);

  const sb = await createClient();
  const { error } = await sb.from('bookings')
    .update({ ...row, vehicle_id: veh.vehicleId, customer_id: veh.customerId })
    .eq('id', id).eq('garage_id', m.garage_id);
  if (error) return oops(error.message);

  revalidatePath('/diary');
  revalidatePath(`/diary/${id}`);
  revalidatePath('/');
  redirect(`/diary/${id}?saved=1`);
}

/** Booking confirmation email, if the garage has it switched on */
async function confirmBooking(sb: Awaited<ReturnType<typeof createClient>>, garageId: string, bookingId: string) {
  const [{ data: g }, { data: b }] = await Promise.all([
    sb.from('garages').select('name, phone, email, address, postcode, brand_colour, notify_booking_email').eq('id', garageId).single(),
    sb.from('bookings').select('starts_at, service_type, customer:customers(name, email), vehicle:vehicles(registration)').eq('id', bookingId).single(),
  ]);
  if (!g?.notify_booking_email || !b) return;
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const cust = one(b.customer as unknown as { name: string; email: string | null } | null);
  await emailBookingConfirmation({
    garage: g, to: cust?.email ?? null, name: cust?.name ?? null, startsAt: b.starts_at, service: b.service_type,
    registration: one(b.vehicle as unknown as { registration: string } | null)?.registration ?? null,
  });
}

/* ---------------- Status + delete ---------------- */

export async function setBookingStatus(fd: FormData) {
  const m = await getMembership();
  if (!m) return;
  const id = str(fd, 'id');
  const status = str(fd, 'status');
  if (!['booked', 'confirmed', 'arrived', 'cancelled', 'no_show'].includes(status)) return;
  const sb = await createClient();
  await sb.from('bookings').update({ status }).eq('id', id).eq('garage_id', m.garage_id);
  revalidatePath(`/diary/${id}`);
  revalidatePath('/diary');
  revalidatePath('/');
}

export async function deleteBooking(fd: FormData) {
  const m = await getMembership();
  if (!m || m.role === 'mechanic') return;
  const sb = await createClient();
  const date = str(fd, 'date');
  // money taken against it stays on record: remove the deposit first
  const { count } = await sb.from('payments').select('id', { count: 'exact', head: true }).eq('booking_id', str(fd, 'id')).is('invoice_id', null);
  if (count) return;
  await sb.from('bookings').delete().eq('id', str(fd, 'id')).eq('garage_id', m.garage_id);
  revalidatePath('/diary');
  revalidatePath('/');
  redirect(isYmd(date) ? `/diary?date=${date}` : '/diary');
}
