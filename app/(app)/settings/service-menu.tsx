'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/field';
import { useActionToast } from '@/components/use-action-toast';
import { gbp } from '@/lib/format';
import { parsePounds } from '@/lib/money';
import type { MenuItem, MenuLine } from '@/lib/types';
import { deleteMenuItem, saveMenuItem } from './extra-actions';

type Draft = { type: MenuLine['type']; description: string; quantity: string; price: string; no_vat: boolean };
const toDraft = (l: MenuLine): Draft => ({ type: l.type, description: l.description, quantity: String(l.quantity), price: (l.unit_price_pence / 100).toFixed(2), no_vat: !!l.no_vat });
const blank = (type: MenuLine['type'], labourRate: number): Draft => ({ type, description: '', quantity: '1', price: type === 'labour' && labourRate ? (labourRate / 100).toFixed(2) : '', no_vat: false });

export const menuTotal = (lines: MenuLine[]) => lines.reduce((s, l) => s + Math.round(l.quantity * l.unit_price_pence), 0);

function Editor({ item, labourRate, onClose }: { item: MenuItem | null; labourRate: number; onClose: () => void }) {
  const { formAction, pending, err, state } = useActionToast(saveMenuItem);
  const [lines, setLines] = useState<Draft[]>(item ? item.lines.map(toDraft) : [blank('labour', labourRate)]);
  const [seen, setSeen] = useState(state.ts);
  if (state.ts !== seen) { setSeen(state.ts); if (state.ok) onClose(); }
  const set = (i: number, patch: Partial<Draft>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const json = JSON.stringify(lines.map((l) => ({
    type: l.type, description: l.description, quantity: Number(l.quantity) || 1, unit_price_pence: parsePounds(l.price) ?? 0, no_vat: l.no_vat,
  })));
  const total = lines.reduce((s, l) => s + Math.round((Number(l.quantity) || 0) * (parsePounds(l.price) ?? 0)), 0);

  return (
    <form suppressHydrationWarning action={formAction} className="space-y-4 rounded-lg border bg-muted/30 p-4">
      {item && <input type="hidden" name="id" value={item.id} />}
      <input type="hidden" name="lines" value={json} />
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{item ? 'Edit preset' : 'New preset'}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}><X /> Close</Button>
      </div>
      <Field label="Name" htmlFor="menu_name" error={err('name')}>
        <Input id="menu_name" name="name" defaultValue={item?.name ?? ''} placeholder="e.g. Full service, small petrol car" autoFocus />
      </Field>
      <div className="space-y-2">
        <div className="hidden grid-cols-[6.5rem_1fr_4.5rem_6rem_2rem] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
          <span>Type</span><span>Description</span><span>Qty / hrs</span><span>Price £</span><span />
        </div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[6.5rem_1fr] gap-2 rounded-md border bg-background p-2 sm:grid-cols-[6.5rem_1fr_4.5rem_6rem_2rem] sm:border-0 sm:bg-transparent sm:p-0">
            <NativeSelect value={l.type} onChange={(e) => set(i, { type: e.target.value as MenuLine['type'] })} aria-label="Type" className="h-8">
              <option value="labour">Labour</option><option value="part">Part</option><option value="fee">Fee</option>
            </NativeSelect>
            <Input value={l.description} onChange={(e) => set(i, { description: e.target.value })} placeholder="Description" className="h-8" aria-label="Description" />
            <Input value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} inputMode="decimal" className="h-8 text-right" aria-label="Quantity" />
            <Input value={l.price} onChange={(e) => set(i, { price: e.target.value })} inputMode="decimal" placeholder="0.00" className="h-8 text-right" aria-label="Unit price" />
            <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label="Remove line"
              onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></Button>
            {l.type === 'fee' && (
              <label className="col-span-full flex items-center gap-2 text-xs text-muted-foreground sm:col-start-2">
                <input type="checkbox" checked={l.no_vat} onChange={(e) => set(i, { no_vat: e.target.checked })} className="size-3.5 accent-primary" />
                Outside the scope of VAT (e.g. the MOT test fee)
              </label>
            )}
          </div>
        ))}
        {err('lines') && <p className="text-xs text-destructive">{err('lines')}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, blank('labour', labourRate)])}><Plus /> Labour</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, blank('part', labourRate)])}><Plus /> Part</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, blank('fee', labourRate)])}><Plus /> Fee</Button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">Total {gbp(total)} before VAT</span>
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />}{item ? 'Update preset' : 'Add preset'}</Button>
      </div>
    </form>
  );
}

export function ServiceMenuTab({ items, labourRate }: { items: MenuItem[]; labourRate: number }) {
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Service menu</CardTitle>
        <CardDescription>Jobs you do often, with their labour, parts and prices. Add one to a job card in a single tap; prices can still be changed on the job.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {items.map((it) => (
              <li key={it.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{it.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {it.lines.length} line{it.lines.length === 1 ? '' : 's'} · {gbp(menuTotal(it.lines))} before VAT · {it.lines.map((l) => l.description).join(', ')}
                  </div>
                </div>
                <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Edit" onClick={() => { setEditing(it); setAdding(false); }}><Pencil className="size-3.5" /></Button>
                <form suppressHydrationWarning action={deleteMenuItem}>
                  <input type="hidden" name="id" value={it.id} />
                  <Button type="submit" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label="Delete"><Trash2 className="size-3.5" /></Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {editing || adding ? (
          <Editor key={editing?.id ?? 'new'} item={editing} labourRate={labourRate} onClose={() => { setEditing(null); setAdding(false); }} />
        ) : (
          <Button type="button" variant="outline" onClick={() => setAdding(true)}><Plus /> Add a preset</Button>
        )}
        {items.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">For example: “Full service” with 2 hours’ labour, oil, oil filter and air filter; “MOT” with the MOT fee marked outside the scope of VAT.</p>
        )}
      </CardContent>
    </Card>
  );
}
