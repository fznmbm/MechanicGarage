import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/** Links in sign-up confirmation, password reset and email change messages land here */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawNext = url.searchParams.get('next') ?? '/';
  const next = /^\/(?!\/)/.test(rawNext) ? rawNext : '/';
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const sb = await createClient();

  let error: string | null = null;
  if (code) {
    const res = await sb.auth.exchangeCodeForSession(code);
    error = res.error?.message ?? null;
  } else if (tokenHash && type) {
    const res = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
    error = res.error?.message ?? null;
  } else {
    error = url.searchParams.get('error_description') ?? 'That link is not complete';
  }
  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(`That link has expired or was already used. ${error}`)}`, url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
