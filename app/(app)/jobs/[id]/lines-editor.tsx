'use client';

import { useEffect, useState, useTransition } from 'react';
import { Plus, Pencil, Trash2, Loader2, Check, X, Wrench, Package, Receipt, Hourglass, ThumbsUp, ThumbsDown, Boxes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Field } from '@/components/field';
import { useActionToast } from '@/components/use-action-toast';
import { gbp } from '@/lib/format';
import { billable, lineTotal, totals } from '@/lib/money';
import { cn } from '@/lib/utils';
import { addMenuToJob, deleteLine, saveLine, searchParts, toggleLineDone, type PartHit } from '../actions';

export type JobLine = {
  id: string; type: 'labour' | 'part' | 'fee'; description: string; quantity: number; unit_price_pence: number;
  cost_pence: number | null; part_number: string | null; done: boolean; no_vat: boolean;
  approval: 'not_required' | 'pending' | 'approved' | 'declined'; part_id: string | null;
};

const TYPE = {
  labour: { label: 'Labour', icon: Wrench, className: 'bg-primary/10 text-primary' },
  part: { label: 'Part', icon: Package, className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  fee: { label: 'Fee', icon: Receipt, className: 'bg-muted text-muted-foreground' },
} as const;

const APPROVAL = {
  pending: { label: 'Awaiting customer', icon: Hourglass, className: 'text-violet-700 dark:text-violet-400' },
  approved: { label: 'Customer approved', icon: ThumbsUp, className: 'text-success' },
  declined: { label: 'Customer declined', icon: ThumbsDown, className: 'text-destructive' },
} as const;

const pounds = (p: number | null | undefined) => (p == null ? '' : (p / 100).toFixed(2));

export function LinesEditor({
  jobId, lines, canPrice, labourRate, vatRate, locked, menu = [],
}: { jobId: string; lines: JobLine[]; canPrice: boolean; labourRate: number; vatRate: number | null; locked: boolean; menu?: { id: string; name: string }[] }) {
  const { formAction, pending, err, state } = useActionToast(saveLine);
  const [editing, setEditing] = useState<JobLine | null>(null);
  const [type, setType] = useState<JobLine['type']>('labour');
  const [formKey, setFormKey] = useState(0);
  const [open, setOpen] = useState(lines.length === 0 && !locked);
  const [lastTs, setLastTs] = useState<number | undefined>(undefined);

  // stock part picker
  const [partQ, setPartQ] = useState('');
  const [hits, setHits] = useState<PartHit[]>([]);
  const [picked, setPicked] = useState<PartHit | null>(null);
  const [, startSearch] = useTransition();

  useEffect(() => {
    if (type !== 'part' || partQ.trim().length < 2) return;
    const t = setTimeout(() => startSearch(async () => setHits(await searchParts(partQ))), 250);
    return () => clearTimeout(t);
  }, [partQ, type]);

  const resetForm = () => { setEditing(null); setPicked(null); setPartQ(''); setHits([]); setFormKey((k) => k + 1); };

  // After a successful save: reset the form (adjusting state during render, no effect needed)
  if (state.ts !== lastTs) {
    setLastTs(state.ts);
    if (state.ok) resetForm();
  }

  const bill = billable(lines);
  const t = totals(bill, vatRate);
  const waiting = totals(lines.filter((l) => l.approval === 'pending'), vatRate).gross;
  const labourHours = bill.filter((l) => l.type === 'labour').reduce((s, l) => s + Number(l.quantity), 0);
  const partsCost = bill.reduce((s, l) => s + (l.type === 'part' && l.cost_pence ? Math.round(l.cost_pence * Number(l.quantity)) : 0), 0);
  const partsSell = bill.filter((l) => l.type === 'part').reduce((s, l) => s + lineTotal(l), 0);

  const startEdit = (l: JobLine) => { setEditing(l); setType(l.type); setPicked(null); setPartQ(''); setOpen(true); setFormKey((k) => k + 1); };
  const cancel = () => { resetForm(); setOpen(false); };
  const shownHits = type === 'part' && partQ.trim().length >= 2 && !picked ? hits : [];

  return (
    <div className="space-y-4">
      {lines.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2 text-left font-medium"><span className="sr-only">Done</span></th>
                <th className="px-3 py-2 text-left font-medium">Item</th>
                <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Qty / hrs</th>
                {canPrice && <th className="px-3 py-2 text-right font-medium">Price</th>}
                {canPrice && <th className="px-3 py-2 text-right font-medium">Total</th>}
                <th className="w-20 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((l) => {
                const T = TYPE[l.type];
                const A = l.approval !== 'not_required' ? APPROVAL[l.approval] : null;
                const off = l.approval === 'declined';
                return (
                  <tr key={l.id} className={cn(editing?.id === l.id && 'bg-primary/5', off && 'opacity-60')}>
                    <td className="px-3 py-2.5 align-top">
                      <form suppressHydrationWarning action={toggleLineDone}>
                        <input suppressHydrationWarning type="hidden" name="job_id" value={jobId} />
                        <input suppressHydrationWarning type="hidden" name="line_id" value={l.id} />
                        <input suppressHydrationWarning type="hidden" name="done" value={l.done ? '0' : '1'} />
                        <button type="submit" aria-label={l.done ? 'Mark not done' : 'Mark done'} disabled={locked || off}
                          className={cn('flex size-5 items-center justify-center rounded border transition',
                            l.done ? 'border-success bg-success text-white' : 'hover:border-primary')}>
                          {l.done && <Check className="size-3.5" />}
                        </button>
                      </form>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <span className={cn('mt-0.5 inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', T.className)}>
                          <T.icon className="size-3" />{T.label}
                        </span>
                        <div className="min-w-0">
                          <div className={cn('leading-snug', (l.done || off) && 'text-muted-foreground line-through')}>{l.description}</div>
                          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            {l.part_number && <span className="font-mono">{l.part_number}</span>}
                            {l.part_id && <span className="flex items-center gap-1"><Boxes className="size-3" /> From stock</span>}
                            {canPrice && vatRate != null && l.no_vat && <span>No VAT</span>}
                            {A && <span className={cn('flex items-center gap-1 font-medium', A.className)}><A.icon className="size-3" />{A.label}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{Number(l.quantity)}</td>
                    {canPrice && (
                      <td className={cn('px-3 py-2.5 text-right whitespace-nowrap tabular-nums', l.unit_price_pence === 0 && 'text-warning-foreground dark:text-warning')}>
                        {l.unit_price_pence === 0 ? 'To price' : gbp(l.unit_price_pence)}
                      </td>
                    )}
                    {canPrice && <td className={cn('px-3 py-2.5 text-right font-medium tabular-nums', off && 'line-through')}>{gbp(lineTotal(l))}</td>}
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      {!locked && (
                        <>
                          <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Edit line" onClick={() => startEdit(l)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <form suppressHydrationWarning action={deleteLine} className="inline">
                            <input suppressHydrationWarning type="hidden" name="job_id" value={jobId} />
                            <input suppressHydrationWarning type="hidden" name="line_id" value={l.id} />
                            <Button type="submit" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label="Delete line">
                              <Trash2 className="size-3.5" />
                            </Button>
                          </form>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No work added yet. Add labour, parts or fees below.
        </p>
      )}

      {/* add / edit form */}
      {!locked && (open ? (
        <form suppressHydrationWarning action={formAction} key={formKey} className="space-y-4 rounded-lg border bg-muted/30 p-4">
          <input suppressHydrationWarning type="hidden" name="job_id" value={jobId} />
          {editing && <input suppressHydrationWarning type="hidden" name="line_id" value={editing.id} />}
          <input suppressHydrationWarning type="hidden" name="part_id" value={type === 'part' ? picked?.id ?? editing?.part_id ?? '' : ''} />
          <input suppressHydrationWarning type="hidden" name="current_approval" value={editing?.approval ?? ''} />
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{editing ? 'Edit line' : 'Add a line'}</span>
            <Button type="button" variant="ghost" size="sm" onClick={cancel}><X /> Close</Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-6">
            <Field label="Type" htmlFor="type" className="sm:col-span-1">
              <NativeSelect id="type" name="type" value={type} onChange={(e) => { setType(e.target.value as JobLine['type']); setPicked(null); }}>
                <option value="labour">Labour</option>
                <option value="part">Part</option>
                <option value="fee">Fee</option>
              </NativeSelect>
            </Field>
            <Field label="Description" htmlFor="description" error={err('description')} className="sm:col-span-5"
              hint={type === 'part' && !editing ? 'Type a name or part number to pick from stock.' : undefined}>
              <div className="relative">
                <Input id="description" name="description" autoFocus autoComplete="off" key={`d-${picked?.id ?? 'x'}`}
                  defaultValue={picked?.name ?? editing?.description ?? ''}
                  onChange={(e) => { if (type === 'part' && !editing) { setPartQ(e.target.value); if (picked) setPicked(null); } }}
                  placeholder={type === 'labour' ? 'e.g. Replace front brake pads and discs' : type === 'part' ? 'e.g. Front brake pad set' : 'e.g. Waste disposal'}
                  aria-invalid={!!err('description')} />
                {shownHits.length > 0 && (
                  <ul className="absolute inset-x-0 top-full z-20 mt-1 divide-y overflow-hidden rounded-lg border bg-popover shadow-md">
                    {shownHits.map((h) => (
                      <li key={h.id}>
                        <button type="button" onClick={() => { setPicked(h); setHits([]); }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent">
                          <Boxes className="size-4 text-muted-foreground" />
                          <span className="flex-1 truncate">{h.name} <span className="font-mono text-xs text-muted-foreground">{h.part_number}</span></span>
                          <span className={cn('text-xs', h.stock_qty <= 0 ? 'text-destructive' : 'text-muted-foreground')}>{h.stock_qty} in stock</span>
                          {canPrice && <span className="text-xs font-medium tabular-nums">{gbp(h.sell_pence)}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" key={`p-${picked?.id ?? 'x'}`}>
            {type === 'part' && (
              <Field label="Part number" htmlFor="part_number" optional className="col-span-2 sm:col-span-1">
                <Input id="part_number" name="part_number" defaultValue={picked?.part_number ?? editing?.part_number ?? ''} className="font-mono" />
              </Field>
            )}
            <Field label={type === 'labour' ? 'Hours' : 'Quantity'} htmlFor="quantity" error={err('quantity')}>
              <Input id="quantity" name="quantity" type="number" step="0.01" min="0.01" inputMode="decimal"
                defaultValue={editing ? Number(editing.quantity) : 1} aria-invalid={!!err('quantity')} />
            </Field>
            {canPrice && (
              <Field label={type === 'labour' ? 'Rate / hour £' : 'Price each £'} htmlFor="unit_price" error={err('unit_price')}>
                <Input id="unit_price" name="unit_price" inputMode="decimal" key={`${type}-${editing?.id ?? 'new'}-${picked?.id ?? ''}`}
                  defaultValue={picked ? pounds(picked.sell_pence) : editing ? pounds(editing.unit_price_pence) : type === 'labour' ? pounds(labourRate) : ''}
                  placeholder="0.00" aria-invalid={!!err('unit_price')} />
              </Field>
            )}
            {canPrice && type === 'part' && (
              <Field label="Cost each £" htmlFor="cost" error={err('cost')} hint="Trade price, for margin">
                <Input id="cost" name="cost" inputMode="decimal" defaultValue={pounds(picked?.cost_pence ?? editing?.cost_pence)} placeholder="0.00" />
              </Field>
            )}
          </div>
          {canPrice && (
            <div className="flex flex-col gap-2 text-sm sm:flex-row sm:gap-6">
              <label className="flex items-center gap-2">
                <input suppressHydrationWarning type="checkbox" name="needs_approval" defaultChecked={!!editing && editing.approval !== 'not_required'} className="size-4 accent-[var(--primary)]" />
                Needs customer approval
              </label>
              <label className="flex items-center gap-2">
                <input suppressHydrationWarning type="checkbox" name="no_vat" defaultChecked={editing?.no_vat ?? false} className="size-4 accent-[var(--primary)]" />
                No VAT <span className="text-xs text-muted-foreground">(e.g. MOT test fee)</span>
              </label>
            </div>
          )}
          {!canPrice && (
            <p className="text-xs text-muted-foreground">Labour is charged at the garage rate. Reception will price any parts.</p>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />}{editing ? 'Update line' : 'Add line'}</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => { resetForm(); setOpen(true); }}><Plus /> Add labour, part or fee</Button>
          {menu.length > 0 && (
            <form suppressHydrationWarning action={addMenuToJob} className="flex gap-2">
              <input type="hidden" name="job_id" value={jobId} />
              <NativeSelect name="menu_id" aria-label="Service menu" className="w-56" defaultValue="" required>
                <option value="" disabled>From the service menu…</option>
                {menu.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </NativeSelect>
              <Button type="submit" variant="secondary">Add</Button>
            </form>
          )}
        </div>
      ))}

      {/* totals */}
      {canPrice && lines.length > 0 && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span>Labour sold: <b className="text-foreground">{labourHours.toFixed(2)} hrs</b></span>
            {partsCost > 0 && <span>Parts margin: <b className="text-foreground">{gbp(partsSell - partsCost)}</b></span>}
            {waiting > 0 && <span className="text-violet-700 dark:text-violet-400">Awaiting approval: <b>{gbp(waiting)}</b> (not in total)</span>}
          </div>
          <dl className="min-w-56 space-y-1 text-sm">
            <div className="flex justify-between gap-6"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{gbp(t.net)}</dd></div>
            {vatRate != null && (
              <div className="flex justify-between gap-6"><dt className="text-muted-foreground">VAT {vatRate}%</dt><dd className="tabular-nums">{gbp(t.vat)}</dd></div>
            )}
            <div className="flex justify-between gap-6 border-t pt-1 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{gbp(t.gross)}</dd></div>
          </dl>
        </div>
      )}
    </div>
  );
}
