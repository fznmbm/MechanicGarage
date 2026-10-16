'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { orNull, str } from '@/lib/validate';
import { parsePounds } from '@/lib/money';
import type { ActionState } from '@/lib/types';

const oops = (message: string): ActionState => ({ ok: false, message, ts: Date.now() });
const done = (message: string): ActionState => ({ ok: true, message, ts: Date.now() });
const fail = (errors: Record<string, string>): ActionState => ({ ok: false, message: 'Please fix the highlighted fields', errors, ts: Date.now() });

async function staff() {
  const m = await getMembership();
  if (!m || m.role === 'mechanic') return null;
  return { m, sb: await createClient() };
}

export async function savePart(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await staff();
  if (!c) return oops('Only the owner or reception can manage parts');
  const id = str(fd, 'id');
  const partNumber = str(fd, 'part_number').toUpperCase();
  const name = str(fd, 'name');
  const sell = parsePounds(str(fd, 'sell') || '0');
  const costRaw = str(fd, 'cost');
  const cost = costRaw ? parsePounds(costRaw) : null;
  const min = Number(str(fd, 'min_qty') || '0');
  const stock = Number(str(fd, 'stock_qty') || '0');
  const errors: Record<string, string> = {};
  if (!partNumber || partNumber.length > 40) errors.part_number = 'Enter a part number';
  if (!name || name.length > 120) errors.name = 'Enter a name';
  if (sell === null) errors.sell = 'Enter a price like 39.99';
  if (costRaw && cost === null) errors.cost = 'Enter a cost like 21.50';
  if (!Number.isFinite(min) || min < 0) errors.min_qty = 'Enter 0 or more';
  if (!id && (!Number.isFinite(stock) || stock < 0)) errors.stock_qty = 'Enter 0 or more';
  if (Object.keys(errors).length) return fail(errors);

  const row = {
    part_number: partNumber, name, sell_pence: sell, cost_pence: cost, min_qty: min,
    location: orNull(str(fd, 'location')), supplier_id: orNull(str(fd, 'supplier_id')),
  };
  if (id) {
    const { error } = await c.sb.from('parts').update(row).eq('id', id).eq('garage_id', c.m.garage_id);
    if (error) return oops(error.code === '23505' ? 'Another part already has that part number' : error.message);
    revalidatePath(`/parts/${id}`);
    revalidatePath('/parts');
    return done('Part saved');
  }
  const { data, error } = await c.sb.from('parts').insert({ ...row, garage_id: c.m.garage_id }).select('id').single();
  if (error) return oops(error.code === '23505' ? 'A part with that part number already exists' : error.message);
  if (stock > 0) await c.sb.rpc('adjust_stock', { p_part: data.id, p_change: stock, p_reason: 'adjustment', p_note: 'Opening stock' });
  revalidatePath('/parts');
  redirect(`/parts/${data.id}?created=1`);
}

export async function adjustStock(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await staff();
  if (!c) return oops('Only the owner or reception can change stock');
  const id = str(fd, 'id');
  const qty = Number(str(fd, 'qty'));
  const mode = str(fd, 'mode'); // delivery | remove | set
  if (!Number.isFinite(qty) || qty < 0 || (mode !== 'set' && qty === 0)) return fail({ qty: 'Enter a quantity' });

  let change = mode === 'remove' ? -qty : qty;
  if (mode === 'set') {
    const { data: p } = await c.sb.from('parts').select('stock_qty').eq('id', id).eq('garage_id', c.m.garage_id).single();
    change = qty - Number(p?.stock_qty ?? 0);
    if (change === 0) return done('Stock is already at that level');
  }
  const { error } = await c.sb.rpc('adjust_stock', {
    p_part: id, p_change: change, p_reason: mode === 'delivery' ? 'delivery' : 'adjustment', p_note: str(fd, 'note'),
  });
  if (error) return oops(error.message);
  revalidatePath(`/parts/${id}`);
  revalidatePath('/parts');
  return done('Stock updated');
}

export async function archivePart(fd: FormData) {
  const c = await staff();
  if (!c) return;
  await c.sb.from('parts').update({ active: false }).eq('id', str(fd, 'id')).eq('garage_id', c.m.garage_id);
  revalidatePath('/parts');
  redirect('/parts');
}

export async function saveSupplier(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await staff();
  if (!c) return oops('Only the owner or reception can manage suppliers');
  const name = str(fd, 'name');
  if (!name) return fail({ name: 'Enter the supplier’s name' });
  const { error } = await c.sb.from('suppliers').insert({
    garage_id: c.m.garage_id, name, phone: orNull(str(fd, 'phone')), email: orNull(str(fd, 'email').toLowerCase()),
    account_ref: orNull(str(fd, 'account_ref')),
  });
  if (error) return oops(error.message);
  revalidatePath('/parts');
  return done('Supplier added');
}

export async function deleteSupplier(fd: FormData) {
  const c = await staff();
  if (!c) return;
  await c.sb.from('suppliers').delete().eq('id', str(fd, 'id')).eq('garage_id', c.m.garage_id);
  revalidatePath('/parts');
}
