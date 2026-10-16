import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { vatRateOn } from '@/lib/money';
import { addDays, ukToday } from '@/lib/time';
import type { PickedVehicle } from '@/components/vehicle-picker';
import type { MenuItem } from '@/lib/types';

/** Everything the estimate form needs from the garage */
export async function estimateFormData(garageId: string, vehicleId?: string | null) {
  const sb = await createClient();
  const [{ data: g }, { data: menu }, vehicleRes] = await Promise.all([
    sb.from('garages').select('labour_rate_pence, vat_registered, vat_effective_from, default_vat_rate, estimate_valid_days').eq('id', garageId).single(),
    sb.from('service_menu').select('id, name, lines, active, sort_order').eq('garage_id', garageId).eq('active', true).order('sort_order'),
    vehicleId
      ? sb.from('vehicles').select('id, registration, make, model, customer:customers(id, name, phone)').eq('id', vehicleId).eq('garage_id', garageId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    labourRate: g?.labour_rate_pence ?? 0,
    vatRate: g ? vatRateOn(g, ukToday()) : null,
    validUntil: addDays(ukToday(), g?.estimate_valid_days ?? 30),
    menu: (menu ?? []) as MenuItem[],
    vehicle: (vehicleRes.data as unknown as PickedVehicle) ?? null,
  };
}
