'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { isPlausibleReg, normaliseReg } from '@/lib/reg';
import { orNull, readCustomer, str } from '@/lib/validate';
import { isYmd, ukLocalToUtcISO } from '@/lib/time';
import { parsePounds } from '@/lib/money';
import { JOB_FLOW } from '@/lib/jobs';
import { VHC_TEMPLATE } from '@/lib/vhc';
import type { ActionState } from '@/lib/types';

const fail = (errors: Record<string, string>, message = 'Please fix the highlighted fields'): ActionState =>
  ({ ok: false, message, errors, ts: Date.now() });
const oops = (message: string): ActionState => ({ ok: false, message, ts: Date.now() });
const done = (message: string): ActionState => ({ ok: true, message, ts: Date.now() });

async function ctx() {
  const m = await getMembership();
  if (!m) return null;
  return { m, sb: await createClient() };
}

/** Make sure a job belongs to this garage */
async function ownJob(sb: Awaited<ReturnType<typeof createClient>>, garageId: string, jobId: string) {
  const { data } = await sb.from('jobs').select('id, status, started_at, vehicle_id, mileage_in')
    .eq('id', jobId).eq('garage_id', garageId).maybeSingle();
  return data;
}

/** Invoiced jobs are locked: change the work only after voiding the invoice */
async function invoiced(sb: Awaited<ReturnType<typeof createClient>>, jobId: string) {
  const { data } = await sb.rpc('job_has_invoice', { p_job: jobId });
  return !!data;
}
const LOCKED = 'This job has been invoiced. Void the invoice to change the work.';

const touch = (id: string) => {
  revalidatePath(`/jobs/${id}`);
  revalidatePath('/jobs');
  revalidatePath('/');
};

/* ---------------- Create ---------------- */

async function insertJob(
  sb: Awaited<ReturnType<typeof createClient>>, garageId: string,
  row: Record<string, unknown>
): Promise<{ id?: string; error?: string }> {
  const { data: n, error: ne } = await sb.rpc('claim_job_number', { g: garageId });
  if (ne || typeof n !== 'number') return { error: ne?.message ?? 'Could not create a job number' };
  const { data, error } = await sb.from('jobs').insert({ ...row, garage_id: garageId, job_number: n }).select('id').single();
  if (error) return { error: error.message };
  return { id: data.id };
}

/** One tap from a booking: creates (or opens) the job and marks the booking arrived */
export async function startJobFromBooking(fd: FormData) {
  const c = await ctx();
  if (!c) return;
  const { m, sb } = c;
  const bookingId = str(fd, 'booking_id');

  const { data: existing } = await sb.from('jobs').select('id').eq('garage_id', m.garage_id).eq('booking_id', bookingId).maybeSingle();
  if (existing) redirect(`/jobs/${existing.id}`);

  const { data: b } = await sb.from('bookings')
    .select('id, vehicle_id, customer_id, bay_id, mechanic_id, service_type, notes, ends_at')
    .eq('id', bookingId).eq('garage_id', m.garage_id).maybeSingle();
  if (!b) return;

  const complaint = [b.service_type, b.notes].filter(Boolean).join('\n');
  const res = await insertJob(sb, m.garage_id, {
    booking_id: b.id, vehicle_id: b.vehicle_id, customer_id: b.customer_id, bay_id: b.bay_id,
    assigned_to: b.mechanic_id, customer_complaint: complaint, promised_at: b.ends_at,
  });
  if (!res.id) return;

  await sb.from('bookings').update({ status: 'arrived' }).eq('id', b.id).in('status', ['booked', 'confirmed']);
  revalidatePath(`/diary/${b.id}`);
  revalidatePath('/diary');
  touch(res.id);
  redirect(`/jobs/${res.id}?created=1`);
}

export async function createJob(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  if (!c) return oops('You are signed out');
  const { m, sb } = c;

  const errors: Record<string, string> = {};
  const mileage = str(fd, 'mileage_in').replace(/,/g, '');
  if (mileage && (!/^\d{1,7}$/.test(mileage))) errors.mileage_in = 'Enter the mileage as a whole number';
  const complaint = str(fd, 'customer_complaint');
  if (!complaint) errors.customer_complaint = 'Describe the work or the customer’s problem';
  const promised = readPromised(fd, errors);

  // vehicle: existing or quick-add (same fields as the booking form)
  const mode = str(fd, 'vehicle_mode');
  let vehicleId: string | null = null;
  let customerId: string | null = null;
  if (mode === 'existing') {
    const { data } = await sb.from('vehicles').select('id, customer_id').eq('id', str(fd, 'vehicle_id')).eq('garage_id', m.garage_id).maybeSingle();
    if (!data) errors.vehicle = 'Choose a vehicle';
    else { vehicleId = data.id; customerId = data.customer_id; }
  } else if (mode === 'new') {
    const reg = normaliseReg(str(fd, 'nv_registration'));
    if (!isPlausibleReg(reg)) errors.nv_registration = 'Enter a valid UK registration';
    Object.assign(errors, readCustomer(fd, 'nc_').errors);
  } else errors.vehicle = 'Choose a vehicle or add a new one';
  if (Object.keys(errors).length) return fail(errors);

  if (mode === 'new') {
    const reg = normaliseReg(str(fd, 'nv_registration'));
    const { data: dupe } = await sb.from('vehicles').select('id, customer_id').eq('garage_id', m.garage_id).eq('registration', reg).maybeSingle();
    if (dupe) { vehicleId = dupe.id; customerId = dupe.customer_id; }
    else {
      const cust = readCustomer(fd, 'nc_');
      const { data: cu, error: ce } = await sb.from('customers')
        .insert({ ...cust.row, garage_id: m.garage_id, consent_at: cust.row.reminder_consent ? new Date().toISOString() : null })
        .select('id').single();
      if (ce) return oops(ce.message);
      let history: unknown = null;
      try { history = JSON.parse(str(fd, 'nv_mot_history') || 'null'); } catch { history = null; }
      const num = (k: string) => (str(fd, k) && Number.isFinite(Number(str(fd, k))) ? Number(str(fd, k)) : null);
      const { data: v, error: ve } = await sb.from('vehicles').insert({
        garage_id: m.garage_id, customer_id: cu.id, registration: reg,
        make: orNull(str(fd, 'nv_make')), model: orNull(str(fd, 'nv_model')), colour: orNull(str(fd, 'nv_colour')),
        fuel_type: orNull(str(fd, 'nv_fuel_type')), engine_size: num('nv_engine_size'), year_of_manufacture: num('nv_year'),
        mot_due: isYmd(str(fd, 'nv_mot_due')) ? str(fd, 'nv_mot_due') : null, last_mileage: num('nv_last_mileage'),
        mot_history: Array.isArray(history) ? history : null,
        mot_checked_at: Array.isArray(history) ? new Date().toISOString() : null,
      }).select('id').single();
      if (ve) return oops(ve.message);
      vehicleId = v.id; customerId = cu.id;
    }
  }

  const res = await insertJob(sb, m.garage_id, {
    vehicle_id: vehicleId, customer_id: customerId, customer_complaint: complaint,
    mileage_in: mileage ? Number(mileage) : null,
    assigned_to: orNull(str(fd, 'assigned_to')), bay_id: orNull(str(fd, 'bay_id')), promised_at: promised,
  });
  if (!res.id) return oops(res.error ?? 'Could not create the job');
  if (mileage && vehicleId) await bumpMileage(sb, vehicleId, Number(mileage));

  touch(res.id);
  redirect(`/jobs/${res.id}?created=1`);
}

function readPromised(fd: FormData, errors: Record<string, string>) {
  const d = str(fd, 'promised_date');
  const t = str(fd, 'promised_time');
  if (!d && !t) return null;
  if (!isYmd(d)) { errors.promised_date = 'Pick a date'; return null; }
  return ukLocalToUtcISO(d, /^\d{2}:\d{2}$/.test(t) ? t : '17:00');
}

async function bumpMileage(sb: Awaited<ReturnType<typeof createClient>>, vehicleId: string, miles: number) {
  const { data } = await sb.from('vehicles').select('last_mileage').eq('id', vehicleId).single();
  if (!data?.last_mileage || miles > data.last_mileage) {
    await sb.from('vehicles').update({ last_mileage: miles }).eq('id', vehicleId);
  }
}

/* ---------------- Details + notes ---------------- */

export async function updateJobDetails(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  if (!c) return oops('You are signed out');
  const { m, sb } = c;
  const id = str(fd, 'id');
  const job = await ownJob(sb, m.garage_id, id);
  if (!job) return oops('Job not found');

  const errors: Record<string, string> = {};
  const mileage = str(fd, 'mileage_in').replace(/,/g, '');
  if (mileage && !/^\d{1,7}$/.test(mileage)) errors.mileage_in = 'Enter the mileage as a whole number';
  const promised = readPromised(fd, errors);
  if (Object.keys(errors).length) return fail(errors);

  const { error } = await sb.from('jobs').update({
    mileage_in: mileage ? Number(mileage) : null,
    assigned_to: orNull(str(fd, 'assigned_to')),
    bay_id: orNull(str(fd, 'bay_id')),
    promised_at: promised,
  }).eq('id', id);
  if (error) return oops(error.message);
  if (mileage && job.vehicle_id) await bumpMileage(sb, job.vehicle_id, Number(mileage));
  touch(id);
  return done('Job details saved');
}

export async function saveJobNotes(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  if (!c) return oops('You are signed out');
  const { m, sb } = c;
  const id = str(fd, 'id');
  const complaint = str(fd, 'customer_complaint');
  const notes = str(fd, 'mechanic_notes');
  if (complaint.length > 4000 || notes.length > 8000) return oops('Notes are too long');
  const { error } = await sb.from('jobs')
    .update({ customer_complaint: orNull(complaint), mechanic_notes: orNull(notes) })
    .eq('id', id).eq('garage_id', m.garage_id);
  if (error) return oops(error.message);
  touch(id);
  return done('Notes saved');
}

/* ---------------- Status ---------------- */

export async function setJobStatus(fd: FormData) {
  const c = await ctx();
  if (!c) return;
  const { m, sb } = c;
  const id = str(fd, 'id');
  const status = str(fd, 'status');
  if (!(JOB_FLOW as readonly string[]).includes(status)) return;
  const job = await ownJob(sb, m.garage_id, id);
  if (!job) return;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  if (status === 'in_progress' && !job.started_at) patch.started_at = now;
  if (status === 'complete') patch.completed_at = now;
  if (status === 'collected') patch.collected_at = now;
  if (!['complete', 'collected'].includes(status)) { patch.completed_at = null; patch.collected_at = null; }
  if (status === 'complete' && !job.started_at) patch.started_at = now;

  await sb.from('jobs').update(patch).eq('id', id);
  // finishing a job clocks everyone off it
  if (['complete', 'collected'].includes(status)) {
    await sb.from('time_entries').update({ ended_at: now }).eq('job_id', id).is('ended_at', null);
    // a service was done: the next one is due in 12 months
    if (job.vehicle_id) {
      const { data: svc } = await sb.from('job_lines').select('id').eq('job_id', id).ilike('description', '%service%').limit(1);
      if (svc?.length) {
        const due = new Date();
        due.setFullYear(due.getFullYear() + 1);
        await sb.from('vehicles').update({ service_due: due.toISOString().slice(0, 10) }).eq('id', job.vehicle_id);
      }
    }
  }
  touch(id);
}

/* ---------------- Lines ---------------- */

export async function saveLine(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  if (!c) return oops('You are signed out');
  const { m, sb } = c;
  const jobId = str(fd, 'job_id');
  const lineId = str(fd, 'line_id');
  if (!(await ownJob(sb, m.garage_id, jobId))) return oops('Job not found');
  if (await invoiced(sb, jobId)) return oops(LOCKED);

  const type = str(fd, 'type');
  const description = str(fd, 'description');
  const qty = Number(str(fd, 'quantity'));
  const errors: Record<string, string> = {};

  if (!['labour', 'part', 'fee'].includes(type)) errors.type = 'Choose a type';
  if (!description) errors.description = 'Describe the work or part';
  else if (description.length > 300) errors.description = 'Keep it under 300 characters';
  if (!Number.isFinite(qty) || qty <= 0 || qty > 10000) errors.quantity = type === 'labour' ? 'Enter the hours' : 'Enter a quantity';

  // Mechanics can add lines without prices; reception/owner set the price
  const priceRaw = str(fd, 'unit_price');
  let price: number | null = priceRaw ? parsePounds(priceRaw) : 0;
  if (price === null) errors.unit_price = 'Enter a price like 45.00';
  const costRaw = str(fd, 'cost');
  const cost = costRaw ? parsePounds(costRaw) : null;
  if (costRaw && cost === null) errors.cost = 'Enter a cost like 12.50';
  if (Object.keys(errors).length) return fail(errors);

  const isMech = m.role === 'mechanic';
  // a part picked from stock
  let stockPart: { id: string; sell_pence: number; cost_pence: number | null } | null = null;
  const partId = type === 'part' ? str(fd, 'part_id') : '';
  if (partId) {
    const { data: sp } = await sb.from('parts').select('id, sell_pence, cost_pence').eq('id', partId).eq('garage_id', m.garage_id).maybeSingle();
    stockPart = sp;
  }
  const row: Record<string, unknown> = {
    type, description, quantity: Math.round(qty * 100) / 100,
    part_number: type === 'part' ? orNull(str(fd, 'part_number')) : null,
    part_id: stockPart?.id ?? null,
  };
  if (!isMech) {
    row.no_vat = fd.get('no_vat') === 'on';
    // extra work the customer must agree to first; keep an existing approved/declined answer
    const needs = fd.get('needs_approval') === 'on';
    const current = str(fd, 'current_approval');
    row.approval = needs ? (['approved', 'declined'].includes(current) ? current : 'pending') : 'not_required';
  }
  if (!isMech) { row.unit_price_pence = price; row.cost_pence = type === 'part' ? cost : null; }

  if (lineId) {
    const { error } = await sb.from('job_lines').update(row).eq('id', lineId).eq('job_id', jobId);
    if (error) return oops(error.message);
  } else {
    if (isMech) {
      // mechanics: labour priced at the garage rate, parts left at £0 for reception to price
      const { data: g } = await sb.from('garages').select('labour_rate_pence').eq('id', m.garage_id).single();
      price = type === 'labour' ? g?.labour_rate_pence ?? 0 : stockPart?.sell_pence ?? 0;
      row.unit_price_pence = price;
      if (stockPart) row.cost_pence = stockPart.cost_pence;
    }
    const { count } = await sb.from('job_lines').select('id', { count: 'exact', head: true }).eq('job_id', jobId);
    const { error } = await sb.from('job_lines').insert({ ...row, garage_id: m.garage_id, job_id: jobId, sort_order: (count ?? 0) + 1 });
    if (error) return oops(error.message);
  }
  touch(jobId);
  return done(lineId ? 'Line updated' : 'Line added');
}

export async function deleteLine(fd: FormData) {
  const c = await ctx();
  if (!c) return;
  const jobId = str(fd, 'job_id');
  if (await invoiced(c.sb, jobId)) return;
  await c.sb.from('job_lines').delete().eq('id', str(fd, 'line_id')).eq('garage_id', c.m.garage_id);
  touch(jobId);
}

export async function toggleLineDone(fd: FormData) {
  const c = await ctx();
  if (!c) return;
  const jobId = str(fd, 'job_id');
  await c.sb.from('job_lines').update({ done: str(fd, 'done') === '1' })
    .eq('id', str(fd, 'line_id')).eq('garage_id', c.m.garage_id);
  touch(jobId);
}

/** Turn an MOT advisory into a labour line to quote for */
export async function addAdvisoryLine(fd: FormData) {
  const c = await ctx();
  if (!c) return;
  const { m, sb } = c;
  const jobId = str(fd, 'job_id');
  if (!(await ownJob(sb, m.garage_id, jobId))) return;
  if (await invoiced(sb, jobId)) return;
  const text = str(fd, 'text').slice(0, 300);
  const { count } = await sb.from('job_lines').select('id', { count: 'exact', head: true }).eq('job_id', jobId);
  await sb.from('job_lines').insert({
    garage_id: m.garage_id, job_id: jobId, type: 'labour', description: `MOT advisory: ${text}`,
    quantity: 1, unit_price_pence: 0, sort_order: (count ?? 0) + 1,
  });
  touch(jobId);
}

/* ---------------- Time clock ---------------- */

export async function clockOn(fd: FormData) {
  const c = await ctx();
  if (!c) return;
  const { m, sb } = c;
  const jobId = str(fd, 'job_id');
  const job = await ownJob(sb, m.garage_id, jobId);
  if (!job) return;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  const now = new Date().toISOString();
  // switching jobs: clock off whatever you were on
  await sb.from('time_entries').update({ ended_at: now }).eq('user_id', user.id).is('ended_at', null);
  await sb.from('time_entries').insert({ garage_id: m.garage_id, job_id: jobId, user_id: user.id, started_at: now });
  if (job.status === 'checked_in') {
    await sb.from('jobs').update({ status: 'in_progress', started_at: job.started_at ?? now }).eq('id', jobId);
  }
  touch(jobId);
}

export async function clockOff(fd: FormData) {
  const c = await ctx();
  if (!c) return;
  const { sb } = c;
  const jobId = str(fd, 'job_id');
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  await sb.from('time_entries').update({ ended_at: new Date().toISOString() }).eq('user_id', user.id).is('ended_at', null);
  touch(jobId);
}

/* ---------------- Photos ---------------- */

const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function uploadPhoto(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  if (!c) return oops('You are signed out');
  const { m, sb } = c;
  const jobId = str(fd, 'job_id');
  if (!(await ownJob(sb, m.garage_id, jobId))) return oops('Job not found');

  const files = fd.getAll('photo').filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return oops('Choose a photo');
  let added = 0;
  for (const file of files.slice(0, 10)) {
    const ext = PHOTO_TYPES[file.type];
    if (!ext || file.size > 5 * 1024 * 1024) continue;
    const path = `${m.garage_id}/${jobId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from('job-photos').upload(path, file, { contentType: file.type });
    if (error) return oops(`Upload failed: ${error.message}`);
    await sb.from('job_photos').insert({ garage_id: m.garage_id, job_id: jobId, path, caption: orNull(str(fd, 'caption')) });
    added++;
  }
  if (!added) return oops('Photos must be JPG, PNG or WebP under 5 MB');
  touch(jobId);
  return done(added === 1 ? 'Photo added' : `${added} photos added`);
}

export async function deletePhoto(fd: FormData) {
  const c = await ctx();
  if (!c) return;
  const { m, sb } = c;
  const { data: p } = await sb.from('job_photos').select('id, path, job_id').eq('id', str(fd, 'photo_id')).eq('garage_id', m.garage_id).maybeSingle();
  if (!p) return;
  await sb.storage.from('job-photos').remove([p.path]);
  await sb.from('job_photos').delete().eq('id', p.id);
  touch(p.job_id);
}

/* ---------------- Delete ---------------- */

export async function deleteJob(fd: FormData) {
  const c = await ctx();
  if (!c || c.m.role === 'mechanic') return;
  const { m, sb } = c;
  const id = str(fd, 'id');
  const { data: photos } = await sb.from('job_photos').select('path').eq('job_id', id).eq('garage_id', m.garage_id);
  if (photos?.length) await sb.storage.from('job-photos').remove(photos.map((p) => p.path));
  await sb.from('jobs').delete().eq('id', id).eq('garage_id', m.garage_id);
  revalidatePath('/jobs');
  revalidatePath('/');
  redirect('/jobs');
}

/* ---------------- Vehicle health check ---------------- */

export async function startHealthCheck(fd: FormData) {
  const c = await ctx();
  if (!c) return;
  const { m, sb } = c;
  const jobId = str(fd, 'job_id');
  if (!(await ownJob(sb, m.garage_id, jobId))) return;
  const { count } = await sb.from('job_checks').select('id', { count: 'exact', head: true }).eq('job_id', jobId);
  if (count) return;
  let n = 0;
  const rows = VHC_TEMPLATE.flatMap((cat) => cat.items.map((item) => ({
    garage_id: m.garage_id, job_id: jobId, category: cat.category, item, sort_order: n++,
  })));
  await sb.from('job_checks').insert(rows);
  touch(jobId);
}

export async function setCheck(input: { jobId: string; checkId: string; status: string; note: string }) {
  const c = await ctx();
  if (!c) return;
  if (!['unchecked', 'green', 'amber', 'red', 'na'].includes(input.status)) return;
  await c.sb.from('job_checks')
    .update({ status: input.status, note: input.note.trim().slice(0, 300) || null, updated_at: new Date().toISOString() })
    .eq('id', input.checkId).eq('job_id', input.jobId).eq('garage_id', c.m.garage_id);
  revalidatePath(`/jobs/${input.jobId}`);
}

/** Turn a red/amber health-check item into work for the customer to approve */
export async function checkToLine(fd: FormData) {
  const c = await ctx();
  if (!c) return;
  const { m, sb } = c;
  const jobId = str(fd, 'job_id');
  if (!(await ownJob(sb, m.garage_id, jobId)) || (await invoiced(sb, jobId))) return;
  const { data: k } = await sb.from('job_checks').select('item, note').eq('id', str(fd, 'check_id')).eq('job_id', jobId).maybeSingle();
  if (!k) return;
  const { data: g } = await sb.from('garages').select('labour_rate_pence').eq('id', m.garage_id).single();
  const { count } = await sb.from('job_lines').select('id', { count: 'exact', head: true }).eq('job_id', jobId);
  await sb.from('job_lines').insert({
    garage_id: m.garage_id, job_id: jobId, type: 'labour', description: `${k.item}${k.note ? `: ${k.note}` : ''}`.slice(0, 300),
    quantity: 1, unit_price_pence: m.role === 'mechanic' ? g?.labour_rate_pence ?? 0 : 0, approval: 'pending', sort_order: (count ?? 0) + 1,
  });
  touch(jobId);
}

/* ---------------- Customer approval ---------------- */

export async function markApprovalSent(fd: FormData) {
  const c = await ctx();
  if (!c || c.m.role === 'mechanic') return;
  const jobId = str(fd, 'job_id');
  const job = await ownJob(c.sb, c.m.garage_id, jobId);
  if (!job) return;
  const patch: Record<string, unknown> = { approval_sent_at: new Date().toISOString() };
  if (['checked_in', 'in_progress'].includes(job.status)) patch.status = 'awaiting_approval';
  await c.sb.from('jobs').update(patch).eq('id', jobId);
  touch(jobId);
}

/* ---------------- Parts picker ---------------- */

export type PartHit = { id: string; part_number: string; name: string; sell_pence: number; cost_pence: number | null; stock_qty: number };

export async function searchParts(q: string): Promise<PartHit[]> {
  const c = await ctx();
  if (!c) return [];
  const term = q.trim().replace(/[%,()*\\]/g, ' ').slice(0, 40);
  if (term.length < 2) return [];
  const { data } = await c.sb.from('parts').select('id, part_number, name, sell_pence, cost_pence, stock_qty')
    .eq('garage_id', c.m.garage_id).eq('active', true)
    .or(`name.ilike.%${term}%,part_number.ilike.%${term}%`).order('name').limit(8);
  return ((data ?? []) as PartHit[]).map((p) => ({ ...p, stock_qty: Number(p.stock_qty), cost_pence: c.m.role === 'mechanic' ? null : p.cost_pence }));
}
