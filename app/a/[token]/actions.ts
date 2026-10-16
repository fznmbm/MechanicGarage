'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function respond(token: string, lineId: string, decision: 'approved' | 'declined'): Promise<{ ok: boolean; error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(token) || !/^[0-9a-f-]{36}$/i.test(lineId)) return { ok: false, error: 'Invalid link' };
  const sb = await createClient();
  const { error } = await sb.rpc('approval_respond', { p_token: token, p_line: lineId, p_decision: decision });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/a/${token}`);
  return { ok: true };
}
