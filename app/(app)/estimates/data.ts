import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { InvoiceDoc } from '@/lib/invoice';

export async function loadEstimate(id: string): Promise<InvoiceDoc | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = await createClient();
  const { data } = await sb.rpc('estimate_doc', { p_id: id });
  return (data as InvoiceDoc | null) ?? null;
}

export async function loadPublicEstimate(token: string): Promise<InvoiceDoc | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const sb = await createClient();
  const { data } = await sb.rpc('estimate_doc_public', { p_token: token });
  return (data as InvoiceDoc | null) ?? null;
}
