import 'server-only';
import { createClient } from './supabase/server';
import { isPlausibleReg, normaliseReg } from './reg';
import { orNull, readCustomer, str } from './validate';
import { isYmd } from './time';

/** Reads the VehiclePicker fields: an existing vehicle, or a quick-added vehicle and customer */
export async function resolveVehicle(fd: FormData, garageId: string) {
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
