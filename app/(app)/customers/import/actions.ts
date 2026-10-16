'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import type { ImportRow } from '@/lib/import';

export type BatchResult = {
  customers_created: number; customers_matched: number;
  vehicles_created: number; vehicles_updated: number;
  skipped: number; errors: { row: number; message: string }[];
};

/** Imports up to 500 rows. Called repeatedly by the import page so large files show progress. */
export async function importBatch(rows: ImportRow[], consent: boolean, last: boolean): Promise<BatchResult | { error: string }> {
  const m = await getMembership();
  if (!m) return { error: 'You are signed out' };
  if (m.role === 'mechanic') return { error: 'Only the owner or reception can import' };
  if (!Array.isArray(rows) || rows.length > 500) return { error: 'Too many rows in one batch' };

  const sb = await createClient();
  const { data, error } = await sb.rpc('import_customers', { p_garage: m.garage_id, p_rows: rows, p_consent: consent });
  if (error) return { error: error.message };
  if (last) {
    revalidatePath('/customers');
    revalidatePath('/vehicles');
    revalidatePath('/reminders');
  }
  return data as BatchResult;
}
