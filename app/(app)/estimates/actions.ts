'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { orNull, str } from '@/lib/validate';
import { isYmd } from '@/lib/time';
import { gbp, ukDate } from '@/lib/format';
import { resolveVehicle } from '@/lib/resolve-vehicle';
import { renderInvoicePdf, pdfFilename } from '@/lib/invoice-pdf';
import { emailConfigured, escapeHtml, sendEmail } from '@/lib/email';
import { siteOrigin } from '@/lib/url';
import type { ActionState } from '@/lib/types';
import { loadEstimate } from './data';

const fail = (errors: Record<string, string>, message = 'Please fix the highlighted fields'): ActionState => ({ ok: false, message, errors, ts: Date.now() });
const oops = (message: string): ActionState => ({ ok: false, message, ts: Date.now() });
const done = (message: string): ActionState => ({ ok: true, message, ts: Date.now() });

async function staff() {
  const m = await getMembership();
  if (!m || m.role === 'mechanic') return null;
  return { m, sb: await createClient() };
}
const touch = (id?: string) => {
  revalidatePath('/estimates');
  if (id) revalidatePath(`/estimates/${id}`);
};

export type EstimateLineInput = {
  type: 'labour' | 'part' | 'fee'; description: string; quantity: number; unit_price_pence: number;
  no_vat: boolean; optional: boolean; part_number: string | null;
};

function readLines(raw: string): { lines: EstimateLineInput[]; error?: string } {
  try {
    const arr = JSON.parse(raw || '[]') as EstimateLineInput[];
    const lines = arr.filter((l) => l && typeof l.description === 'string' && l.description.trim()).map((l) => ({
      type: (['labour', 'part', 'fee'] as const).includes(l.type) ? l.type : 'labour',
      description: l.description.trim().slice(0, 300),
      quantity: Math.min(10000, Math.max(0.01, Math.round(Number(l.quantity) * 100) / 100 || 1)),
      unit_price_pence: Math.max(0, Math.round(Number(l.unit_price_pence) || 0)),
      no_vat: !!l.no_vat, optional: !!l.optional,
      part_number: l.part_number ? String(l.part_number).trim().slice(0, 40) || null : null,
    }));
    if (!lines.length) return { lines, error: 'Add at least one line' };
    if (lines.length > 60) return { lines, error: 'Up to 60 lines' };
    if (lines.every((l) => l.optional)) return { lines, error: 'At least one line must not be optional' };
    return { lines };
  } catch { return { lines: [], error: 'Could not read the lines' }; }
}

export async function saveEstimate(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await staff();
  if (!c) return oops('Only the owner or reception can write estimates');
  const { m, sb } = c;
  const id = str(fd, 'id');
  const title = str(fd, 'title');
  const validUntil = str(fd, 'valid_until');
  const errors: Record<string, string> = {};
  if (title.length > 120) errors.title = 'Keep it under 120 characters';
  if (validUntil && !isYmd(validUntil)) errors.valid_until = 'Pick a date';
  const { lines, error: lineErr } = readLines(str(fd, 'lines'));
  if (lineErr) errors.lines = lineErr;

  let existing: { status: string } | null = null;
  if (id) {
    const { data } = await sb.from('estimates').select('status').eq('id', id).eq('garage_id', m.garage_id).maybeSingle();
    if (!data) return oops('Estimate not found');
    if (!['draft', 'sent'].includes(data.status)) return oops('The customer has answered this estimate. Duplicate it to make changes.');
    existing = data;
  }
  const veh = await resolveVehicle(fd, m.garage_id);
  if ('errors' in veh && veh.errors) Object.assign(errors, veh.errors);
  if (Object.keys(errors).length) return fail(errors);
  if ('error' in veh && veh.error) return oops(veh.error);
  const { vehicleId, customerId } = veh as { vehicleId: string; customerId: string | null };

  const row = { title: orNull(title), notes: orNull(str(fd, 'notes')), valid_until: validUntil || null, vehicle_id: vehicleId, customer_id: customerId };
  let estimateId = id;
  if (existing) {
    const { error } = await sb.from('estimates').update(row).eq('id', id);
    if (error) return oops(error.message);
    await sb.from('estimate_lines').delete().eq('estimate_id', id);
  } else {
    const { data: number, error: ne } = await sb.rpc('claim_estimate_number', { g: m.garage_id });
    if (ne) return oops(ne.message);
    const { data, error } = await sb.from('estimates').insert({ ...row, garage_id: m.garage_id, number }).select('id').single();
    if (error) return oops(error.message);
    estimateId = data.id;
  }
  const { error: le } = await sb.from('estimate_lines').insert(lines.map((l, i) => ({ ...l, garage_id: m.garage_id, estimate_id: estimateId, sort_order: i + 1 })));
  if (le) return oops(le.message);
  touch(estimateId);
  redirect(`/estimates/${estimateId}${existing ? '?saved=1' : '?created=1'}`);
}

/** The link was sent by WhatsApp or copied: mark the estimate as sent */
export async function markEstimateSent(fd: FormData) {
  const c = await staff();
  if (!c) return;
  const id = str(fd, 'id');
  await c.sb.from('estimates').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id).eq('garage_id', c.m.garage_id).eq('status', 'draft');
  touch(id);
}

export async function emailEstimate(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await staff();
  if (!c) return oops('Only the owner or reception can send estimates');
  if (!emailConfigured()) return oops('Email sending is not set up yet');
  const id = str(fd, 'id');
  const to = str(fd, 'to').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return fail({ to: 'Enter a valid email address' });
  const doc = await loadEstimate(id);
  if (!doc) return oops('Estimate not found');
  const e = doc.invoice;
  const status = doc.estimate?.status;
  if (status !== 'draft' && status !== 'sent') return oops('This estimate has already been answered');

  const link = `${await siteOrigin()}/q/${e.public_token}`;
  const first = e.buyer.name?.split(' ')[0] ?? 'there';
  const reg = e.vehicle.registration ? ` for ${e.vehicle.registration}` : '';
  const valid = e.due_at ? ` It's valid until ${ukDate(e.due_at)}.` : '';
  const text = [`Hi ${first},`, '', `Here is estimate ${e.number}${reg} from ${e.seller.name}: ${gbp(e.total_pence)}.${valid}`,
    '', `View it and accept or decline online: ${link}`, '', 'Thanks,', e.seller.name, e.seller.phone ?? ''].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.5">
    <p>Hi ${escapeHtml(first)},</p>
    <p>Here is estimate <b>${escapeHtml(e.number)}</b>${escapeHtml(reg)} from ${escapeHtml(e.seller.name)}: <b>${gbp(e.total_pence)}</b>.${escapeHtml(valid)}</p>
    <p><a href="${link}" style="display:inline-block;background:#1A5BA6;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">View and accept online</a></p>
    <p>Thanks,<br>${escapeHtml(e.seller.name)}${e.seller.phone ? `<br>${escapeHtml(e.seller.phone)}` : ''}</p></div>`;
  const pdf = await renderInvoicePdf(doc);
  const res = await sendEmail({ to, subject: `Estimate ${e.number} from ${e.seller.name}`, text, html, replyTo: e.seller.email, fromName: e.seller.name,
    attachments: [{ filename: pdfFilename(doc), content: pdf }] });
  if (!res.ok) return oops(res.error);
  await c.sb.from('estimates').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id).eq('status', 'draft');
  touch(id);
  return done(`Estimate emailed to ${to}`);
}

/** Customer said yes on the phone or at the counter */
export async function acceptForCustomer(fd: FormData) {
  const c = await staff();
  if (!c) return;
  const id = str(fd, 'id');
  await c.sb.from('estimates').update({ status: 'accepted', responded_at: new Date().toISOString(), accepted_by: `Recorded by ${c.m.display_name}` })
    .eq('id', id).eq('garage_id', c.m.garage_id).in('status', ['draft', 'sent']);
  touch(id);
}

export async function convertToJob(fd: FormData) {
  const c = await staff();
  if (!c) return;
  const id = str(fd, 'id');
  const { data, error } = await c.sb.rpc('estimate_to_job', { p_estimate: id });
  if (error || !data) return;
  touch(id);
  revalidatePath('/jobs');
  redirect(`/jobs/${data}?created=1`);
}

export async function duplicateEstimate(fd: FormData) {
  const c = await staff();
  if (!c) return;
  const { m, sb } = c;
  const id = str(fd, 'id');
  const [{ data: e }, { data: lines }, { data: g }] = await Promise.all([
    sb.from('estimates').select('customer_id, vehicle_id, title, notes').eq('id', id).eq('garage_id', m.garage_id).maybeSingle(),
    sb.from('estimate_lines').select('type, description, quantity, unit_price_pence, no_vat, optional, part_number, sort_order').eq('estimate_id', id),
    sb.from('garages').select('estimate_valid_days').eq('id', m.garage_id).single(),
  ]);
  if (!e) return;
  const { data: number } = await sb.rpc('claim_estimate_number', { g: m.garage_id });
  const valid = new Date(Date.now() + (g?.estimate_valid_days ?? 30) * 86_400_000).toISOString().slice(0, 10);
  const { data: copy } = await sb.from('estimates').insert({ ...e, garage_id: m.garage_id, number, valid_until: valid }).select('id').single();
  if (!copy) return;
  if (lines?.length) await sb.from('estimate_lines').insert(lines.map((l) => ({ ...l, garage_id: m.garage_id, estimate_id: copy.id })));
  touch();
  redirect(`/estimates/${copy.id}/edit`);
}

export async function deleteEstimate(fd: FormData) {
  const c = await staff();
  if (!c) return;
  await c.sb.from('estimates').delete().eq('id', str(fd, 'id')).eq('garage_id', c.m.garage_id).neq('status', 'converted');
  touch();
  redirect('/estimates');
}
