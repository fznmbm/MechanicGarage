'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { ActionState } from '@/lib/types';

const oops = (message: string): ActionState => ({ ok: false, message, ts: Date.now() });
const done = (message: string): ActionState => ({ ok: true, message, ts: Date.now() });

export type Enrolment = { factorId: string; qr: string; secret: string } | { error: string };

/** Step 1: create an authenticator-app factor and return its QR code */
export async function startEnrolment(): Promise<Enrolment> {
  const sb = await createClient();
  const { data: list } = await sb.auth.mfa.listFactors();
  // tidy up half-finished attempts so the friendly name is free
  for (const f of list?.all ?? []) if (f.status === 'unverified') await sb.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) return { error: error?.message ?? 'Could not start set-up' };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Step 2: prove the app works by entering a code; the session becomes two-factor */
export async function confirmEnrolment(_: ActionState, fd: FormData): Promise<ActionState> {
  const factorId = String(fd.get('factor_id') ?? '');
  const code = String(fd.get('code') ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return { ok: false, message: 'Enter the 6-digit code', errors: { code: 'Enter the 6-digit code from the app' }, ts: Date.now() };
  const sb = await createClient();
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { ok: false, message: 'That code didn’t work', errors: { code: 'That code didn’t work. Check the time on your phone is set automatically.' }, ts: Date.now() };
  revalidatePath('/account');
  return done('Two-factor login is on');
}

export async function removeFactor(fd: FormData) {
  const sb = await createClient();
  await sb.auth.mfa.unenroll({ factorId: String(fd.get('factor_id') ?? '') });
  revalidatePath('/account');
}

/** Sign-in step: the 6-digit code */
export async function verifyLoginCode(_: ActionState, fd: FormData): Promise<ActionState> {
  const code = String(fd.get('code') ?? '').replace(/\s/g, '');
  const raw = String(fd.get('next') ?? '/');
  const next = /^\/(?!\/)/.test(raw) ? raw : '/';
  if (!/^\d{6}$/.test(code)) return { ok: false, message: 'Enter the 6-digit code', errors: { code: 'Enter the 6-digit code from your app' }, ts: Date.now() };
  const sb = await createClient();
  const { data } = await sb.auth.mfa.listFactors();
  const factor = data?.totp?.[0];
  if (!factor) redirect(next);
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { ok: false, message: 'That code didn’t work', errors: { code: 'That code didn’t work. Codes change every 30 seconds.' }, ts: Date.now() };
  redirect(next);
}

export async function changePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const pw = String(fd.get('password') ?? '');
  const again = String(fd.get('confirm') ?? '');
  if (pw.length < 8) return { ok: false, message: 'Too short', errors: { password: 'At least 8 characters' }, ts: Date.now() };
  if (pw !== again) return { ok: false, message: 'Passwords don’t match', errors: { confirm: 'Passwords don’t match' }, ts: Date.now() };
  const sb = await createClient();
  const { error } = await sb.auth.updateUser({ password: pw });
  if (error) return oops(error.message);
  return done('Password changed');
}

export async function signOutEverywhere() {
  const sb = await createClient();
  await sb.auth.signOut({ scope: 'global' });
  redirect('/login');
}
