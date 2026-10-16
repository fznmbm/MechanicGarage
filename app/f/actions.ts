'use server';

import { createClient } from '@/lib/supabase/server';

export async function submitFeedback(token: string, score: number, comment: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { ok: false, error: 'This link is not valid' };
  const sb = await createClient();
  const { error } = await sb.rpc('feedback_submit', { p_token: token, p_score: score, p_comment: comment.slice(0, 2000) });
  return error ? { ok: false, error: error.message } : { ok: true };
}
