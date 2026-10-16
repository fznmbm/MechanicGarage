'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { str } from '@/lib/validate';
import { emailConfigured, escapeHtml, sendEmail } from '@/lib/email';
import { siteOrigin } from '@/lib/url';
import type { ActionState } from '@/lib/types';

const oops = (message: string): ActionState => ({ ok: false, message, ts: Date.now() });
const done = (message: string): ActionState => ({ ok: true, message, ts: Date.now() });

async function owner() {
  const m = await getMembership();
  if (!m || m.role !== 'owner') return null;
  return { m, sb: await createClient() };
}

export async function createInvite(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await owner();
  if (!c) return oops('Only the owner can invite staff');
  const name = str(fd, 'display_name');
  const role = str(fd, 'role');
  const email = str(fd, 'email').toLowerCase();
  const errors: Record<string, string> = {};
  if (!name) errors.display_name = 'Enter their name';
  if (!['owner', 'reception', 'mechanic'].includes(role)) errors.role = 'Choose a role';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email';
  if (Object.keys(errors).length) return { ok: false, message: 'Please fix the highlighted fields', errors, ts: Date.now() };

  const { data, error } = await c.sb.from('invites')
    .insert({ garage_id: c.m.garage_id, display_name: name, role, email: email || null })
    .select('token').single();
  if (error) return oops(error.message);

  let sent = false;
  if (email && emailConfigured()) {
    const link = `${await siteOrigin()}/join/${data.token}`;
    const res = await sendEmail({
      to: email, fromName: c.m.garage.name,
      subject: `Join ${c.m.garage.name} on RampDesk`,
      text: `Hi ${name},\n\n${c.m.display_name} has invited you to join ${c.m.garage.name} as ${role}.\n\nSet up your login here (link valid for 14 days):\n${link}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.5"><p>Hi ${escapeHtml(name)},</p>
        <p>${escapeHtml(c.m.display_name)} has invited you to join <b>${escapeHtml(c.m.garage.name)}</b> as ${role}.</p>
        <p><a href="${link}" style="display:inline-block;background:#1A5BA6;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Set up your login</a></p>
        <p style="color:#64748b;font-size:12px">This link is valid for 14 days.</p></div>`,
    });
    sent = res.ok;
  }
  revalidatePath('/settings');
  return done(sent ? `Invite emailed to ${email}` : 'Invite created. Share the link with them.');
}

export async function revokeInvite(fd: FormData) {
  const c = await owner();
  if (!c) return;
  await c.sb.from('invites').delete().eq('id', str(fd, 'id')).eq('garage_id', c.m.garage_id);
  revalidatePath('/settings');
}

export async function updateMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await owner();
  if (!c) return oops('Only the owner can manage staff');
  const userId = str(fd, 'user_id');
  const role = str(fd, 'role');
  const active = str(fd, 'active') === '1';
  if (!['owner', 'reception', 'mechanic'].includes(role)) return oops('Choose a role');

  // never leave the garage without an active owner
  const { data: owners } = await c.sb.from('garage_members').select('user_id')
    .eq('garage_id', c.m.garage_id).eq('role', 'owner').eq('active', true);
  const isLastOwner = owners?.length === 1 && owners[0].user_id === userId;
  if (isLastOwner && (role !== 'owner' || !active)) return oops('A garage needs at least one active owner');

  const { error } = await c.sb.from('garage_members').update({ role, active })
    .eq('garage_id', c.m.garage_id).eq('user_id', userId);
  if (error) return oops(error.message);
  revalidatePath('/settings');
  return done(active ? 'Staff member updated' : 'Staff member deactivated');
}
