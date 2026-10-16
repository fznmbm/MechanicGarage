'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { orNull, str } from '@/lib/validate';
import { isYmd } from '@/lib/time';
import { parsePounds } from '@/lib/money';
import { gbp, ukDate } from '@/lib/format';
import { balance, overpaid, type InvoiceDoc } from '@/lib/invoice';
import { renderInvoicePdf, pdfFilename } from '@/lib/invoice-pdf';
import { emailConfigured, escapeHtml, sendEmail } from '@/lib/email';
import { siteOrigin } from '@/lib/url';
import type { ActionState } from '@/lib/types';
import { loadCredit, loadInvoice } from './data';

const fail = (errors: Record<string, string>, message = 'Please fix the highlighted fields'): ActionState =>
  ({ ok: false, message, errors, ts: Date.now() });
const oops = (message: string): ActionState => ({ ok: false, message, ts: Date.now() });
const done = (message: string): ActionState => ({ ok: true, message, ts: Date.now() });

async function staff() {
  const m = await getMembership();
  if (!m || m.role === 'mechanic') return null;
  return { m, sb: await createClient() };
}

const touch = (id: string, jobId?: string | null) => {
  revalidatePath(`/invoices/${id}`);
  revalidatePath('/reports');
  revalidatePath('/invoices');
  revalidatePath('/');
  if (jobId) revalidatePath(`/jobs/${jobId}`);
};

export async function issueInvoice(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await staff();
  if (!c) return oops('Only the owner or reception can issue invoices');
  const jobId = str(fd, 'job_id');
  const issue = str(fd, 'issued_at');
  const due = str(fd, 'due_at');
  const errors: Record<string, string> = {};
  if (!isYmd(issue)) errors.issued_at = 'Pick the invoice date';
  if (due && !isYmd(due)) errors.due_at = 'Pick a due date';
  else if (due && due < issue) errors.due_at = 'Due date can’t be before the invoice date';
  if (Object.keys(errors).length) return fail(errors);

  const { data, error } = await c.sb.rpc('issue_invoice', {
    p_job: jobId, p_issue: issue, p_due: due || null, p_notes: orNull(str(fd, 'notes')),
  });
  if (error) return oops(error.message);
  touch(data as string, jobId);
  redirect(`/invoices/${data}?created=1`);
}

export async function recordPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await staff();
  if (!c) return oops('Only the owner or reception can record payments');
  const id = str(fd, 'invoice_id');
  const amount = parsePounds(str(fd, 'amount'));
  const method = str(fd, 'method');
  const date = str(fd, 'paid_at');
  const errors: Record<string, string> = {};

  const { data: inv } = await c.sb.from('invoices').select('id, job_id, total_pence, paid_pence, credited_pence, status')
    .eq('id', id).eq('garage_id', c.m.garage_id).maybeSingle();
  if (!inv) return oops('Invoice not found');
  if (inv.status === 'void') return oops('This invoice is void');

  if (amount === null || amount <= 0) errors.amount = 'Enter the amount paid, e.g. 120.00';
  else if (amount > balance(inv) + 1) errors.amount = `That’s more than the ${gbp(balance(inv))} owed`;
  if (!['cash', 'card', 'transfer', 'stripe'].includes(method)) errors.method = 'Choose how they paid';
  if (!isYmd(date)) errors.paid_at = 'Pick the date';
  if (Object.keys(errors).length) return fail(errors);

  const { error } = await c.sb.from('payments').insert({
    garage_id: c.m.garage_id, invoice_id: id, amount_pence: amount, method,
    paid_at: `${date}T12:00:00Z`, reference: orNull(str(fd, 'reference')),
  });
  if (error) return oops(error.message);
  touch(id, inv.job_id);
  return done(`Payment of ${gbp(amount!)} recorded`);
}

export async function deletePayment(fd: FormData) {
  const c = await staff();
  if (!c || c.m.role !== 'owner') return;
  const id = str(fd, 'invoice_id');
  await c.sb.from('payments').delete().eq('id', str(fd, 'payment_id')).eq('garage_id', c.m.garage_id);
  touch(id);
}

export async function voidInvoice(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await staff();
  if (!c || c.m.role !== 'owner') return oops('Only the owner can void invoices');
  const id = str(fd, 'invoice_id');
  const reason = str(fd, 'reason');
  if (!reason) return fail({ reason: 'Say why, e.g. “Wrong price on brake pads, reissued”' });
  const { data: inv } = await c.sb.from('invoices').select('job_id').eq('id', id).eq('garage_id', c.m.garage_id).maybeSingle();
  if (!inv) return oops('Invoice not found');
  const { error } = await c.sb.rpc('void_invoice', { p_invoice: id, p_reason: reason });
  if (error) return oops(error.message);
  touch(id, inv.job_id);
  return done('Invoice voided. The job can now be invoiced again.');
}

export async function emailInvoice(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await staff();
  if (!c) return oops('Only the owner or reception can email invoices');
  const id = str(fd, 'invoice_id');
  const doc = await loadInvoice(id);
  if (!doc) return oops('Invoice not found');
  const res = await emailDoc(doc, str(fd, 'to'), `/i/${doc.invoice.public_token}`);
  if (!res.ok) return res;
  await c.sb.from('invoices').update({ emailed_at: new Date().toISOString() }).eq('id', id);
  touch(id);
  return res;
}

export async function emailCreditNote(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await staff();
  if (!c) return oops('Only the owner or reception can email credit notes');
  const doc = await loadCredit(str(fd, 'invoice_id'));
  if (!doc) return oops('Credit note not found');
  return emailDoc(doc, str(fd, 'to'), `/c/${doc.invoice.public_token}`);
}

/** Email an invoice or credit note with its PDF attached */
async function emailDoc(doc: InvoiceDoc, rawTo: string, path: string): Promise<ActionState> {
  if (!emailConfigured()) return oops('Email sending is not set up yet');
  const to = rawTo.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return fail({ to: 'Enter a valid email address' });
  const i = doc.invoice;
  const credit = doc.kind === 'credit';
  const what = credit ? 'credit note' : 'invoice';
  const owed = credit ? 0 : balance(i);
  const link = `${await siteOrigin()}${path}`;
  const first = i.buyer.name?.split(' ')[0] ?? 'there';
  const reg = i.vehicle.registration ? ` for ${i.vehicle.registration}` : '';
  const status = credit
    ? `This credits ${gbp(i.total_pence)}${doc.against ? ` against invoice ${doc.against.number}` : ''}.${doc.refund?.amount_pence ? ` A refund of ${gbp(doc.refund.amount_pence)} has been made.` : ''}`
    : owed > 0 ? `Amount due: ${gbp(owed)}${i.due_at && i.due_at !== i.issued_at ? ` by ${ukDate(i.due_at)}` : ''}.` : 'This invoice has been paid in full. Thank you.';

  const text = [
    `Hi ${first},`, '',
    `Please find attached ${what} ${i.number}${reg} from ${i.seller.name}.`, status,
    '', `View it online: ${link}`, '', 'Thanks,', i.seller.name, i.seller.phone ?? '',
  ].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.5">
    <p>Hi ${escapeHtml(first)},</p>
    <p>Please find attached ${what} <b>${escapeHtml(i.number)}</b>${escapeHtml(reg)} from ${escapeHtml(i.seller.name)}.</p>
    <p>${escapeHtml(status)}</p>
    <p><a href="${link}" style="display:inline-block;background:#1A5BA6;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">View ${what} online</a></p>
    <p>Thanks,<br>${escapeHtml(i.seller.name)}${i.seller.phone ? `<br>${escapeHtml(i.seller.phone)}` : ''}</p></div>`;

  const pdf = await renderInvoicePdf(doc);
  const res = await sendEmail({
    to, subject: `${credit ? 'Credit note' : 'Invoice'} ${i.number} from ${i.seller.name}`, text, html,
    replyTo: i.seller.email, fromName: i.seller.name,
    attachments: [{ filename: pdfFilename(doc), content: pdf }],
  });
  if (!res.ok) return oops(res.error);
  return done(`${credit ? 'Credit note' : 'Invoice'} emailed to ${to}`);
}

/* ---------------- Credit notes and refunds ---------------- */

export async function issueCreditNote(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await staff();
  if (!c || c.m.role !== 'owner') return oops('Only the owner can issue credit notes');
  const id = str(fd, 'invoice_id');
  const mode = str(fd, 'mode');
  const date = str(fd, 'issued_at');
  const reason = str(fd, 'reason');
  const refund = str(fd, 'refund_method');
  const errors: Record<string, string> = {};
  if (!isYmd(date)) errors.issued_at = 'Pick the date';
  if (!reason) errors.reason = 'Say why, e.g. “Brake pads returned” or “Goodwill”';
  else if (reason.length > 500) errors.reason = 'Keep it under 500 characters';
  if (refund && !['cash', 'card', 'transfer'].includes(refund)) errors.refund_method = 'Choose how you refunded';

  const doc = await loadInvoice(id);
  if (!doc) return oops('Invoice not found');
  const credited = doc.credited_lines ?? {};
  const left = (lineId: string, q: number | string) => Math.round((Number(q) - Number(credited[lineId] ?? 0)) * 100) / 100;

  let lines: Record<string, unknown>[] = [];
  if (mode === 'all') {
    lines = doc.lines.filter((l) => left(l.id, l.quantity) > 0).map((l) => ({ invoice_line_id: l.id, quantity: left(l.id, l.quantity) }));
  } else if (mode === 'lines') {
    for (const l of doc.lines) {
      const raw = str(fd, `qty_${l.id}`);
      if (!raw) continue;
      const q = Number(raw);
      if (!Number.isFinite(q) || q < 0) { errors[`qty_${l.id}`] = 'Enter a number'; continue; }
      if (q === 0) continue;
      if (q > left(l.id, l.quantity)) { errors[`qty_${l.id}`] = `Up to ${left(l.id, l.quantity)}`; continue; }
      lines.push({ invoice_line_id: l.id, quantity: q });
    }
    if (!lines.length && !Object.keys(errors).length) errors.lines = 'Enter how many of at least one item to credit';
  } else if (mode === 'amount') {
    const amount = parsePounds(str(fd, 'amount'));
    const description = str(fd, 'description') || reason;
    const max = (doc.invoice.total_pence) - (doc.invoice.credited_pence ?? 0);
    if (amount === null || amount <= 0) errors.amount = 'Enter the amount, e.g. 25.00';
    else if (amount > max) errors.amount = `No more than ${gbp(max)}`;
    else lines = [{ description: description.slice(0, 300), gross_pence: amount }];
  } else return oops('Choose what to credit');
  if (Object.keys(errors).length) return fail(errors);

  const { data, error } = await c.sb.rpc('issue_credit_note', {
    p_invoice: id, p_issue: date, p_reason: reason, p_lines: lines, p_refund: refund || null,
  });
  if (error) return oops(error.message);
  touch(id, doc.invoice.job_id);
  redirect(`/invoices/credit/${data}?created=1`);
}

/** Pay back an overpayment (after a credit note, or a deposit larger than the bill) */
export async function recordRefund(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await staff();
  if (!c || c.m.role !== 'owner') return oops('Only the owner can record refunds');
  const id = str(fd, 'invoice_id');
  const amount = parsePounds(str(fd, 'amount'));
  const method = str(fd, 'method');
  const { data: inv } = await c.sb.from('invoices').select('id, job_id, total_pence, paid_pence, credited_pence, status')
    .eq('id', id).eq('garage_id', c.m.garage_id).maybeSingle();
  if (!inv) return oops('Invoice not found');
  const max = overpaid(inv);
  const errors: Record<string, string> = {};
  if (amount === null || amount <= 0) errors.amount = 'Enter the amount refunded';
  else if (amount > max) errors.amount = `No more than the ${gbp(max)} overpaid`;
  if (!['cash', 'card', 'transfer'].includes(method)) errors.method = 'Choose how you refunded';
  if (Object.keys(errors).length) return fail(errors);
  const { error } = await c.sb.from('payments').insert({
    garage_id: c.m.garage_id, invoice_id: id, amount_pence: -amount!, method, reference: 'Refund',
  });
  if (error) return oops(error.message);
  touch(id, inv.job_id);
  return done(`Refund of ${gbp(amount!)} recorded`);
}

/* ---------------- Deposits ---------------- */

/** A payment taken before the invoice exists, against a job or a booking. It moves onto the invoice when that's created. */
export async function takeDeposit(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await staff();
  if (!c) return oops('Only the owner or reception can take payments');
  const jobId = str(fd, 'job_id');
  const bookingId = str(fd, 'booking_id');
  const amount = parsePounds(str(fd, 'amount'));
  const method = str(fd, 'method');
  const errors: Record<string, string> = {};
  if (amount === null || amount <= 0) errors.amount = 'Enter the amount, e.g. 50.00';
  if (!['cash', 'card', 'transfer'].includes(method)) errors.method = 'Choose how they paid';
  if (Object.keys(errors).length) return fail(errors);

  const table = jobId ? 'jobs' : 'bookings';
  const { data: owner } = await c.sb.from(table).select('id').eq('id', jobId || bookingId).eq('garage_id', c.m.garage_id).maybeSingle();
  if (!owner) return oops('Not found');
  if (jobId) {
    const { data: has } = await c.sb.rpc('job_has_invoice', { p_job: jobId });
    if (has) return oops('This job has an invoice. Record the payment on the invoice instead.');
  }
  const { error } = await c.sb.from('payments').insert({
    garage_id: c.m.garage_id, job_id: jobId || null, booking_id: bookingId || null,
    amount_pence: amount, method, reference: orNull(str(fd, 'reference')) ?? 'Deposit',
  });
  if (error) return oops(error.message);
  if (jobId) revalidatePath(`/jobs/${jobId}`);
  if (bookingId) revalidatePath(`/diary/${bookingId}`);
  revalidatePath('/reports');
  return done(`Deposit of ${gbp(amount!)} taken`);
}

export async function removeDeposit(fd: FormData) {
  const c = await staff();
  if (!c || c.m.role !== 'owner') return;
  const { data: p } = await c.sb.from('payments').select('id, job_id, booking_id').eq('id', str(fd, 'payment_id'))
    .eq('garage_id', c.m.garage_id).is('invoice_id', null).maybeSingle();
  if (!p) return;
  await c.sb.from('payments').delete().eq('id', p.id);
  if (p.job_id) revalidatePath(`/jobs/${p.job_id}`);
  if (p.booking_id) revalidatePath(`/diary/${p.booking_id}`);
}
