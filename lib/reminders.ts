import { ukDate } from './format';
import { prettyReg } from './reg';

export type ReminderKind = 'mot' | 'service' | 'advisory';

type Ctx = {
  kind: ReminderKind; firstName: string; garage: string; phone: string | null; registration: string;
  make: string | null; due: string | null; bookUrl: string | null; overdue?: boolean; advisories?: string[];
};

const car = (c: Ctx) => `${c.make ? `${c.make} ` : ''}${prettyReg(c.registration)}`;

/** Short message for WhatsApp / text */
export function reminderMessage(c: Ctx) {
  const book = c.bookUrl ? ` Book online: ${c.bookUrl}` : '';
  const call = c.phone ? `${c.bookUrl ? ' or call' : ' Call'} ${c.phone}` : '';
  const hi = `Hi ${c.firstName || 'there'}, it's ${c.garage}.`;
  if (c.kind === 'mot') {
    return `${hi} The MOT on your ${car(c)} ${c.overdue ? 'expired' : 'is due'} on ${ukDate(c.due)}.${book}${call}${book || call ? '.' : ''}`;
  }
  if (c.kind === 'service') {
    return `${hi} Your ${car(c)} is due a service${c.due ? ` around ${ukDate(c.due)}` : ''}.${book}${call}${book || call ? '.' : ''}`;
  }
  return `${hi} At its last MOT your ${car(c)} had ${c.advisories?.length === 1 ? 'an advisory' : 'some advisories'} worth sorting before they become a problem` +
    `${c.advisories?.length ? `: ${c.advisories.slice(0, 2).join('; ')}` : ''}. Would you like a quote?${book}${call}${book || call ? '.' : ''}`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Email for automatic MOT / service reminders */
export function reminderEmail(c: Ctx & { unsubscribeUrl: string; brand?: string | null }) {
  const brand = c.brand && /^#[0-9a-fA-F]{6}$/.test(c.brand) ? c.brand : '#1A5BA6';
  const what = c.kind === 'mot' ? 'MOT' : 'service';
  const subject = `${what} reminder for ${prettyReg(c.registration)}`;
  const line = c.kind === 'mot'
    ? `The MOT on your ${car(c)} is due on <b>${ukDate(c.due)}</b>.`
    : `Your ${car(c)} is due a service around <b>${ukDate(c.due)}</b>.`;
  const text = [
    `Hi ${c.firstName || 'there'},`, '',
    line.replace(/<\/?b>/g, ''),
    c.bookUrl ? `Book online: ${c.bookUrl}` : '',
    c.phone ? `Or call us on ${c.phone}.` : '', '',
    `Thanks,`, c.garage, '', `Stop these reminders: ${c.unsubscribeUrl}`,
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.5;max-width:520px">
    <p>Hi ${esc(c.firstName || 'there')},</p>
    <p>${line.replace(car(c), esc(car(c)))}</p>
    ${c.bookUrl ? `<p><a href="${c.bookUrl}" style="display:inline-block;background:${brand};color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Book online</a></p>` : ''}
    ${c.phone ? `<p>Or call us on <b>${esc(c.phone)}</b>.</p>` : ''}
    <p>Thanks,<br>${esc(c.garage)}</p>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px">You're receiving this because you asked ${esc(c.garage)} for MOT and service reminders.
      <a href="${c.unsubscribeUrl}" style="color:#94a3b8">Stop these reminders</a>.</p></div>`;
  return { subject, text, html };
}
