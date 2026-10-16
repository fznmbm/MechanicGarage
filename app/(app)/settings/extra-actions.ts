'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { orNull, str } from '@/lib/validate';
import type { ActionState, MenuLine } from '@/lib/types';
import { adminConfigured, createAdminClient } from '@/lib/supabase/admin';

const oops = (message: string): ActionState => ({ ok: false, message, ts: Date.now() });
const done = (message: string): ActionState => ({ ok: true, message, ts: Date.now() });
const fail = (errors: Record<string, string>): ActionState => ({ ok: false, message: 'Please fix the highlighted fields', errors, ts: Date.now() });

async function owner() {
  const m = await getMembership();
  if (!m || m.role !== 'owner') return null;
  return { m, sb: await createClient() };
}

export async function saveFeatures(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await owner();
  if (!c) return oops('Only the owner can change settings');
  const review = str(fd, 'google_review_url');
  const prefix = str(fd, 'credit_prefix');
  const auth = str(fd, 'authorisation_text');
  const errors: Record<string, string> = {};
  if (review && !/^https:\/\/\S+$/.test(review)) errors.google_review_url = 'Paste the full link, starting https://';
  if (!/^[A-Za-z0-9-]{1,8}$/.test(prefix)) errors.credit_prefix = 'Up to 8 letters, numbers or dashes, e.g. CN-';
  if (auth.length > 600) errors.authorisation_text = 'Keep it under 600 characters';
  const estPrefix = str(fd, 'estimate_prefix');
  const valid = Number(str(fd, 'estimate_valid_days'));
  const chase = Number(str(fd, 'estimate_chase_days'));
  if (!/^[A-Za-z0-9-]{1,8}$/.test(estPrefix)) errors.estimate_prefix = 'Up to 8 letters, numbers or dashes, e.g. EST-';
  if (!Number.isInteger(valid) || valid < 1 || valid > 365) errors.estimate_valid_days = 'Between 1 and 365 days';
  if (!Number.isInteger(chase) || chase < 0 || chase > 30) errors.estimate_chase_days = 'Between 0 and 30 days';
  if (Object.keys(errors).length) return fail(errors);

  const on = (k: string) => fd.get(k) === 'on';
  const { error } = await c.sb.from('garages').update({
    notify_booking_email: on('notify_booking_email'),
    notify_ready_email: on('notify_ready_email'),
    feature_courtesy_cars: on('feature_courtesy_cars'),
    feature_feedback: on('feature_feedback'),
    feedback_auto_email: on('feedback_auto_email'),
    google_review_url: orNull(review),
    authorisation_text: orNull(auth),
    credit_prefix: prefix.toUpperCase(),
    estimate_prefix: estPrefix.toUpperCase(),
    estimate_valid_days: valid,
    estimate_chase_days: chase,
  }).eq('id', c.m.garage_id);
  if (error) return oops(error.message);
  revalidatePath('/', 'layout');
  return done('Settings saved');
}

/** Service menu: a preset job with its labour, parts and fees */
export async function saveMenuItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await owner();
  if (!c) return oops('Only the owner can change settings');
  const id = str(fd, 'id');
  const name = str(fd, 'name');
  const errors: Record<string, string> = {};
  if (!name || name.length > 80) errors.name = 'Enter a name (up to 80 characters)';

  let lines: MenuLine[] = [];
  try {
    const raw = JSON.parse(str(fd, 'lines') || '[]') as MenuLine[];
    lines = raw
      .filter((l) => l && typeof l.description === 'string' && l.description.trim())
      .map((l) => ({
        type: (['labour', 'part', 'fee'] as const).includes(l.type) ? l.type : 'labour',
        description: l.description.trim().slice(0, 300),
        quantity: Math.min(10000, Math.max(0.01, Math.round(Number(l.quantity) * 100) / 100 || 1)),
        unit_price_pence: Math.max(0, Math.round(Number(l.unit_price_pence) || 0)),
        no_vat: !!l.no_vat,
      }));
  } catch { errors.lines = 'Could not read the lines'; }
  if (!lines.length && !errors.lines) errors.lines = 'Add at least one line';
  if (lines.length > 30) errors.lines = 'Up to 30 lines';
  if (Object.keys(errors).length) return fail(errors);

  const row = { name, lines };
  const { error } = id
    ? await c.sb.from('service_menu').update(row).eq('id', id).eq('garage_id', c.m.garage_id)
    : await c.sb.from('service_menu').insert({ ...row, garage_id: c.m.garage_id, sort_order: Date.now() % 1000000 });
  if (error) return oops(error.message);
  revalidatePath('/settings');
  return done(id ? 'Preset updated' : 'Preset added');
}

export async function deleteMenuItem(fd: FormData) {
  const c = await owner();
  if (!c) return;
  await c.sb.from('service_menu').delete().eq('id', str(fd, 'id')).eq('garage_id', c.m.garage_id);
  revalidatePath('/settings');
}

/** Which roles must use two-factor login */
export async function saveSecurity(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await owner();
  if (!c) return oops('Only the owner can change settings');
  const roles = ['owner', 'reception', 'mechanic'].filter((r) => fd.get(`mfa_${r}`) === 'on');
  if (roles.includes('owner')) {
    const { data: { user } } = await c.sb.auth.getUser();
    if (!user?.factors?.some((f) => f.status === 'verified')) {
      return oops('Turn on two-factor for your own account first (Account and security), so you don’t lock yourself out.');
    }
  }
  const { error } = await c.sb.from('garages').update({ mfa_required_roles: roles }).eq('id', c.m.garage_id);
  if (error) return oops(error.message);
  revalidatePath('/settings');
  return done(roles.length ? 'Two-factor requirement saved' : 'Two-factor is now optional for everyone');
}

/** A staff member lost their phone: remove their authenticator so they can sign in and set it up again */
export async function resetMemberMfa(fd: FormData) {
  const c = await owner();
  if (!c || !adminConfigured()) return;
  const userId = str(fd, 'user_id');
  const { data: member } = await c.sb.from('garage_members').select('user_id').eq('garage_id', c.m.garage_id).eq('user_id', userId).maybeSingle();
  if (!member) return;
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.mfa.listFactors({ userId });
  for (const f of data?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
  revalidatePath('/settings');
}
