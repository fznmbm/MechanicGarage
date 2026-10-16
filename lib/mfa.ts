import type { SupabaseClient, User } from '@supabase/supabase-js';

/** Assurance level of the current session (aal1 = password only, aal2 = password + code) */
export async function sessionAal(sb: SupabaseClient): Promise<'aal1' | 'aal2' | null> {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  try {
    const payload = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString());
    return payload.aal === 'aal2' ? 'aal2' : 'aal1';
  } catch { return 'aal1'; }
}

export const hasVerifiedFactor = (user: User | null) => !!user?.factors?.some((f) => f.status === 'verified');

/** Signed in with a password but still owes the 6-digit code */
export async function needsCode(sb: SupabaseClient, user: User | null) {
  return hasVerifiedFactor(user) && (await sessionAal(sb)) !== 'aal2';
}
