/**
 * The number WhatsApp needs (digits, country code first), or null when it isn't a mobile.
 * UK mobiles (07…, +44 7…) and international numbers written with + or 00 are accepted.
 * UK landlines (01…, 02…, 03…) are not on WhatsApp, so they return null.
 * Must match is_mobile() in supabase/17_whatsapp_reminders.sql.
 */
export function waNumber(phone?: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, '');
  if (/^07\d{9}$/.test(d)) return `44${d.slice(1)}`;
  if (/^447\d{9}$/.test(d)) return d;
  if (/^00447\d{9}$/.test(d)) return d.slice(2);
  if (/^\s*(\+|00)/.test(phone) && !/^(00)?44/.test(d)) {
    const n = d.replace(/^00/, '');
    return n.length >= 8 && n.length <= 15 ? n : null;
  }
  return null;
}

/** wa.me link that opens a chat with the message already typed */
export function waLink(phone: string | null | undefined, text?: string): string | null {
  const n = waNumber(phone);
  if (!n) return null;
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
