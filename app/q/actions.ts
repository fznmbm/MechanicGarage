'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function respondToEstimate(token: string, accept: boolean, optional: string[], name: string, note: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { ok: false, error: 'This link is not valid' };
  const ids = optional.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 60);
  const sb = await createClient();
  const { error } = await sb.rpc('estimate_respond', { p_token: token, p_accept: accept, p_optional: ids, p_name: name.slice(0, 100), p_note: note.slice(0, 1000) });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/q/${token}`);
  return { ok: true };
}
