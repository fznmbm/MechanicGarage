import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type BoardJob = {
  id: string; job_number: number; status: string; customer_complaint: string | null; promised_at: string | null;
  assigned_to: string | null; created_at: string; completed_at: string | null; collected_at: string | null;
  vehicle: { registration: string; make: string | null; model: string | null } | null;
  customer: { name: string } | null;
  lines: { quantity: number; unit_price_pence: number }[];
};

export async function staffNames(garageId: string) {
  const sb = await createClient();
  const { data } = await sb.from('garage_members').select('user_id, display_name, role').eq('garage_id', garageId).eq('active', true);
  return new Map((data ?? []).map((m) => [m.user_id as string, m.display_name as string]));
}
