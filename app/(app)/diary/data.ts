import 'server-only';
import { createClient } from '@/lib/supabase/server';

/** Bays + people who can be assigned work (mechanics and owners) */
export async function diaryOptions(garageId: string) {
  const sb = await createClient();
  const [{ data: bays }, { data: members }, { data: g }] = await Promise.all([
    sb.from('bays').select('id, name').eq('garage_id', garageId).order('sort_order'),
    sb.from('garage_members').select('user_id, display_name, role').eq('garage_id', garageId).eq('active', true)
      .in('role', ['mechanic', 'owner']).order('display_name'),
    sb.from('garages').select('opening_time, closing_time').eq('id', garageId).single(),
  ]);
  return {
    bays: (bays ?? []) as { id: string; name: string }[],
    mechanics: (members ?? []).map((m) => ({ id: m.user_id as string, name: m.display_name as string })),
    opening: ((g?.opening_time as string) ?? '08:00').slice(0, 5),
    closing: ((g?.closing_time as string) ?? '18:00').slice(0, 5),
  };
}
