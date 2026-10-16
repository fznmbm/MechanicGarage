'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { isPlausibleReg, normaliseReg } from '@/lib/reg';
import { orNull, readCustomer, str } from '@/lib/validate';
import { lookupVehicle, type LookupResult, type MotTest } from '@/lib/vehicle-lookup';
import type { ActionState } from '@/lib/types';

const fail = (errors: Record<string, string>, message = 'Please fix the highlighted fields'): ActionState =>
  ({ ok: false, message, errors, ts: Date.now() });
const oops = (message: string): ActionState => ({ ok: false, message, ts: Date.now() });

/* ---------------- Lookup ---------------- */

export type LookupResponse = { result: LookupResult; existingId?: string };

export async function lookupRegistration(reg: string): Promise<LookupResponse> {
  const m = await getMembership();
  if (!m) return { result: { ok: false, code: 'error', message: 'You are signed out' } };
  const r = normaliseReg(reg);
  if (!isPlausibleReg(r)) {
    return { result: { ok: false, code: 'invalid', message: 'That does not look like a UK registration' } };
  }

  const sb = await createClient();
  const [{ data: existing }, result] = await Promise.all([
    sb.from('vehicles').select('id').eq('garage_id', m.garage_id).eq('registration', r).maybeSingle(),
    lookupVehicle(r),
  ]);
  return { result, existingId: existing?.id };
}

/* ---------------- Shared field parsing ---------------- */

function readVehicle(fd: FormData) {
  const errors: Record<string, string> = {};
  const registration = normaliseReg(str(fd, 'registration'));
  const int = (k: string, min: number, max: number, label: string) => {
    const v = str(fd, k).replace(/,/g, '');
    if (!v) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      errors[k] = `${label} must be a whole number between ${min.toLocaleString()} and ${max.toLocaleString()}`;
      return null;
    }
    return n;
  };
  const date = (k: string) => {
    const v = str(fd, k);
    if (!v) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { errors[k] = 'Enter a valid date'; return null; }
    return v;
  };

  if (!isPlausibleReg(registration)) errors.registration = 'Enter a valid UK registration';
  const vin = str(fd, 'vin').toUpperCase().replace(/\s/g, '');
  if (vin && !/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)) errors.vin = 'VINs are 11–17 letters and numbers (no I, O or Q)';

  const row = {
    registration,
    make: orNull(str(fd, 'make')),
    model: orNull(str(fd, 'model')),
    colour: orNull(str(fd, 'colour')),
    fuel_type: orNull(str(fd, 'fuel_type')),
    engine_size: int('engine_size', 50, 10000, 'Engine size'),
    year_of_manufacture: int('year_of_manufacture', 1900, new Date().getFullYear() + 1, 'Year'),
    first_registered: date('first_registered'),
    mot_due: date('mot_due'),
    service_due: date('service_due'),
    tax_status: orNull(str(fd, 'tax_status')),
    tax_due: date('tax_due'),
    last_mileage: int('last_mileage', 0, 2_000_000, 'Mileage'),
    vin: orNull(vin),
    notes: orNull(str(fd, 'notes')),
  };
  return { errors, row };
}

/** Customer chosen in the picker: existing id, a new customer, or none */
async function resolveCustomer(fd: FormData, garageId: string): Promise<{ id: string | null; errors?: Record<string, string>; error?: string }> {
  const mode = str(fd, 'customer_mode');
  if (mode === 'existing') return { id: orNull(str(fd, 'customer_id')) };
  if (mode !== 'new') return { id: null };

  const { errors, row } = readCustomer(fd, 'new_');
  if (Object.keys(errors).length) return { id: null, errors };
  const sb = await createClient();
  const { data, error } = await sb
    .from('customers')
    .insert({ ...row, garage_id: garageId, consent_at: row.reminder_consent ? new Date().toISOString() : null })
    .select('id')
    .single();
  if (error) return { id: null, error: error.message };
  return { id: data.id };
}

function readMotHistory(fd: FormData): MotTest[] | null {
  const raw = str(fd, 'mot_history');
  if (!raw || raw.length > 300_000) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/* ---------------- Create / update / delete ---------------- */

export async function createVehicle(_: ActionState, fd: FormData): Promise<ActionState> {
  const m = await getMembership();
  if (!m) return oops('You are signed out');
  const { errors, row } = readVehicle(fd);
  if (str(fd, 'customer_mode') === 'new') Object.assign(errors, readCustomer(fd, 'new_').errors);
  if (Object.keys(errors).length) return fail(errors);

  const sb = await createClient();
  const { data: dupe } = await sb.from('vehicles').select('id')
    .eq('garage_id', m.garage_id).eq('registration', row.registration).maybeSingle();
  if (dupe) return fail({ registration: 'This vehicle is already on file' }, 'This vehicle is already on file');

  const customer = await resolveCustomer(fd, m.garage_id);
  if (customer.errors) return fail(customer.errors);
  if (customer.error) return oops(customer.error);

  const history = readMotHistory(fd);
  const looked = str(fd, 'looked_up') === '1';
  const { data, error } = await sb
    .from('vehicles')
    .insert({
      ...row,
      garage_id: m.garage_id,
      customer_id: customer.id,
      mot_history: history,
      has_outstanding_recall: str(fd, 'recall') === '1' ? true : str(fd, 'recall') === '0' ? false : null,
      mot_checked_at: history ? new Date().toISOString() : null,
      dvla_checked_at: looked ? new Date().toISOString() : null,
    })
    .select('id')
    .single();
  if (error) return oops(error.code === '23505' ? 'This vehicle is already on file' : error.message);

  revalidatePath('/vehicles');
  if (customer.id) revalidatePath(`/customers/${customer.id}`);
  redirect(`/vehicles/${data.id}?created=1`);
}

export async function updateVehicle(_: ActionState, fd: FormData): Promise<ActionState> {
  const m = await getMembership();
  if (!m) return oops('You are signed out');
  const id = str(fd, 'id');
  const { errors, row } = readVehicle(fd);
  if (str(fd, 'customer_mode') === 'new') Object.assign(errors, readCustomer(fd, 'new_').errors);
  if (Object.keys(errors).length) return fail(errors);

  const sb = await createClient();
  const { data: clash } = await sb.from('vehicles').select('id')
    .eq('garage_id', m.garage_id).eq('registration', row.registration).neq('id', id).maybeSingle();
  if (clash) return fail({ registration: 'Another vehicle on file already has this registration' });

  const customer = await resolveCustomer(fd, m.garage_id);
  if (customer.errors) return fail(customer.errors);
  if (customer.error) return oops(customer.error);

  const { error } = await sb.from('vehicles')
    .update({ ...row, customer_id: customer.id })
    .eq('id', id).eq('garage_id', m.garage_id);
  if (error) return oops(error.message);

  revalidatePath('/vehicles');
  revalidatePath(`/vehicles/${id}`);
  redirect(`/vehicles/${id}?saved=1`);
}

export async function refreshVehicle(_: ActionState, fd: FormData): Promise<ActionState> {
  const m = await getMembership();
  if (!m) return oops('You are signed out');
  const id = str(fd, 'id');
  const sb = await createClient();
  const { data: v } = await sb.from('vehicles').select('*').eq('id', id).eq('garage_id', m.garage_id).single();
  if (!v) return oops('Vehicle not found');

  const res = await lookupVehicle(v.registration);
  if (!res.ok) return oops(res.message);
  const x = res.vehicle;

  // Only overwrite with values the lookup actually returned
  const patch: Record<string, unknown> = {
    make: x.make ?? v.make,
    model: x.model ?? v.model,
    colour: x.colour ?? v.colour,
    fuel_type: x.fuelType ?? v.fuel_type,
    engine_size: x.engineSize ?? v.engine_size,
    year_of_manufacture: x.yearOfManufacture ?? v.year_of_manufacture,
    first_registered: x.firstRegistered ?? v.first_registered,
    mot_due: x.motDue ?? v.mot_due,
    tax_status: x.taxStatus ?? v.tax_status,
    tax_due: x.taxDue ?? v.tax_due,
    last_mileage: Math.max(x.lastMileage ?? 0, v.last_mileage ?? 0) || null,
    has_outstanding_recall: x.hasOutstandingRecall ?? v.has_outstanding_recall,
    dvla_checked_at: new Date().toISOString(),
  };
  if (x.sources.includes('dvsa')) {
    patch.mot_history = x.motTests;
    patch.mot_checked_at = new Date().toISOString();
  }

  const { error } = await sb.from('vehicles').update(patch).eq('id', id).eq('garage_id', m.garage_id);
  if (error) return oops(error.message);
  revalidatePath(`/vehicles/${id}`);
  return { ok: true, message: 'Vehicle details updated from DVSA', ts: Date.now() };
}

export async function deleteVehicle(fd: FormData) {
  const m = await getMembership();
  if (!m || m.role === 'mechanic') return;
  const sb = await createClient();
  await sb.from('vehicles').delete().eq('id', str(fd, 'id')).eq('garage_id', m.garage_id);
  revalidatePath('/vehicles');
  redirect('/vehicles');
}
