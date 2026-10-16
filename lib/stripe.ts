import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/* Stripe via its REST API (no SDK needed). Used for the platform subscription only. */

export const stripeConfigured = () => !!(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_PRICE_ID?.trim());

/** Flatten { a: { b: 1 }, c: [x] } into Stripe's form encoding: a[b]=1&c[0]=x */
function encode(obj: Record<string, unknown>, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') encode(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripe<T = Record<string, unknown>>(path: string, params: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY!.trim()}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: encode(params),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error?: { message?: string } }).error?.message ?? `Stripe error ${res.status}`);
  return json as T;
}

/** Verify a webhook's Stripe-Signature header (HMAC-SHA256 over "timestamp.body") */
export function verifyStripeSignature(body: string, header: string | null, secret: string, toleranceSec = 300) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
