import 'server-only';
import { createClient } from '@supabase/supabase-js';

/** Service-role client: bypasses row-level security. Only for cron jobs and Stripe webhooks. */
export const adminConfigured = () => !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
