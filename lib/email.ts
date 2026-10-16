import 'server-only';

/* Email via Resend (free tier: 3,000 emails/month). Optional: without
   RESEND_API_KEY + EMAIL_FROM the app falls back to opening the user's mail app. */

export const emailConfigured = () => !!(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());

export async function sendEmail(opts: {
  to: string; subject: string; html: string; text: string; replyTo?: string | null; fromName?: string;
  attachments?: { filename: string; content: Buffer }[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!emailConfigured()) return { ok: false, error: 'Email sending is not set up' };
  // EMAIL_FROM like "invoices@ironbay.co.uk"; the garage name is used as the display name
  const fromAddr = process.env.EMAIL_FROM!.trim().replace(/^.*<(.+)>$/, '$1');
  const from = opts.fromName ? `${opts.fromName.replace(/["<>]/g, '')} <${fromAddr}>` : process.env.EMAIL_FROM!.trim();
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        attachments: opts.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: (body as { message?: string }).message ?? `Email failed (${res.status})` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not reach the email service' };
  }
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
