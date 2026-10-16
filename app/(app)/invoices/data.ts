import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { InvoiceDoc } from '@/lib/invoice';

export async function loadInvoice(id: string): Promise<InvoiceDoc | null> {
  const sb = await createClient();
  const { data } = await sb.rpc('invoice_doc', { p_id: id });
  return (data as InvoiceDoc | null) ?? null;
}

export async function loadPublicInvoice(token: string): Promise<InvoiceDoc | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const sb = await createClient();
  const { data } = await sb.rpc('invoice_doc_public', { p_token: token });
  return (data as InvoiceDoc | null) ?? null;
}

export async function loadCredit(id: string): Promise<InvoiceDoc | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = await createClient();
  const { data } = await sb.rpc('credit_doc', { p_id: id });
  return (data as InvoiceDoc | null) ?? null;
}

export async function loadPublicCredit(token: string): Promise<InvoiceDoc | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const sb = await createClient();
  const { data } = await sb.rpc('credit_doc_public', { p_token: token });
  return (data as InvoiceDoc | null) ?? null;
}
