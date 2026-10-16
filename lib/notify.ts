import 'server-only';
import { emailConfigured, escapeHtml, sendEmail } from './email';
import { prettyReg } from './reg';
import { ukDateOf, ukLongDate, ukTime } from './time';

/* Automatic customer emails: booking confirmation, ready to collect, feedback request.
   Each is skipped quietly when email isn't set up, the garage has switched it off, or there's no address. */

type Garage = { name: string; phone: string | null; email: string | null; address?: string | null; postcode?: string | null; brand_colour: string | null };

const brandOf = (c: string | null) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#1A5BA6');
const validEmail = (e: string | null | undefined): e is string => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function layout(g: Garage, first: string, paragraphs: string[], button?: { href: string; label: string }) {
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.5;max-width:520px">
    <p>Hi ${escapeHtml(first || 'there')},</p>
    ${paragraphs.map((p) => `<p>${p}</p>`).join('\n    ')}
    ${button ? `<p><a href="${button.href}" style="display:inline-block;background:${brandOf(g.brand_colour)};color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(button.label)}</a></p>` : ''}
    <p>Thanks,<br>${escapeHtml(g.name)}${g.phone ? `<br>${escapeHtml(g.phone)}` : ''}</p></div>`;
  const text = [`Hi ${first || 'there'},`, '', ...paragraphs.map((p) => p.replace(/<[^>]+>/g, '')), ...(button ? ['', `${button.label}: ${button.href}`] : []),
    '', 'Thanks,', g.name, g.phone ?? ''].join('\n');
  return { html, text };
}

async function send(g: Garage, to: string, subject: string, body: { html: string; text: string }) {
  const res = await sendEmail({ to, subject, ...body, replyTo: g.email, fromName: g.name });
  if (!res.ok) console.error(`Email "${subject}" to ${to} failed: ${res.error}`);
  return res.ok;
}

export async function emailBookingConfirmation(o: {
  garage: Garage; to: string | null; name: string | null; startsAt: string; service: string; registration: string | null;
}) {
  if (!emailConfigured() || !validEmail(o.to)) return false;
  const first = o.name?.split(' ')[0] ?? '';
  const where = [o.garage.address?.replace(/\n/g, ', '), o.garage.postcode].filter(Boolean).join(', ');
  const body = layout(o.garage, first, [
    `Your booking with ${escapeHtml(o.garage.name)} is confirmed:`,
    `<b>${escapeHtml(o.service)}</b>${o.registration ? ` for <b>${escapeHtml(prettyReg(o.registration))}</b>` : ''}<br>${escapeHtml(ukLongDate(ukDateOf(o.startsAt)))} at ${ukTime(o.startsAt)}`,
    ...(where ? [`Where: ${escapeHtml(where)}`] : []),
    `If you need to change it, just reply to this email${o.garage.phone ? ` or call ${escapeHtml(o.garage.phone)}` : ''}.`,
  ]);
  return send(o.garage, o.to, `Booking confirmed: ${ukLongDate(ukDateOf(o.startsAt))} at ${ukTime(o.startsAt)}`, body);
}

export async function emailReadyToCollect(o: { garage: Garage; to: string | null; name: string | null; registration: string | null; total?: string | null }) {
  if (!emailConfigured() || !validEmail(o.to)) return false;
  const car = o.registration ? prettyReg(o.registration) : 'vehicle';
  const body = layout(o.garage, o.name?.split(' ')[0] ?? '', [
    `Good news: your ${escapeHtml(car)} is ready to collect from ${escapeHtml(o.garage.name)}.`,
    ...(o.total ? [`The total is <b>${escapeHtml(o.total)}</b>.`] : []),
    `Any questions, just reply${o.garage.phone ? ` or call ${escapeHtml(o.garage.phone)}` : ''}.`,
  ]);
  return send(o.garage, o.to, `Your ${car} is ready to collect`, body);
}

export async function emailFeedbackRequest(o: { garage: Garage; to: string | null; name: string | null; registration: string | null; link: string }) {
  if (!emailConfigured() || !validEmail(o.to)) return false;
  const car = o.registration ? prettyReg(o.registration) : 'vehicle';
  const body = layout(o.garage, o.name?.split(' ')[0] ?? '', [
    `Thanks for bringing your ${escapeHtml(car)} to ${escapeHtml(o.garage.name)}.`,
    'How did we do? It takes ten seconds and helps us improve.',
  ], { href: o.link, label: 'Rate your visit' });
  return send(o.garage, o.to, `How did we do with your ${car}?`, body);
}
