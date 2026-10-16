'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { gbp } from '@/lib/format';
import { respondToEstimate } from '../actions';

type Line = { id: string; description: string; line_total_pence: number; optional?: boolean; no_vat?: boolean };

export function RespondForm({ token, lines, vatRate, brand }: { token: string; lines: Line[]; vatRate: number; brand: string }) {
  const extras = lines.filter((l) => l.optional);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const chosen = lines.filter((l) => !l.optional || picked.includes(l.id));
  const net = chosen.reduce((s, l) => s + l.line_total_pence, 0);
  const vatable = chosen.reduce((s, l) => s + (l.no_vat ? 0 : l.line_total_pence), 0);
  const total = net + Math.round((vatable * vatRate) / 100);

  const send = (accept: boolean) => start(async () => {
    setError('');
    const r = await respondToEstimate(token, accept, picked, name, note);
    if (!r.ok) setError(r.error ?? 'Something went wrong');
  });

  return (
    <div className="space-y-4">
      {extras.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-900">Optional extras: tick any you’d like done too</p>
          {extras.map((l) => (
            <label key={l.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm has-checked:border-slate-400 has-checked:bg-slate-50">
              <input type="checkbox" className="size-4" style={{ accentColor: brand }} checked={picked.includes(l.id)}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, l.id] : p.filter((x) => x !== l.id)))} />
              <span className="flex-1">{l.description}</span>
              <span className="tabular-nums text-slate-600">+{gbp(Math.round(l.line_total_pence * (l.no_vat ? 1 : 1 + vatRate / 100)))}</span>
            </label>
          ))}
        </div>
      )}
      <div className="flex items-baseline justify-between border-t border-slate-200 pt-3">
        <span className="text-sm text-slate-600">Total{vatRate ? ' including VAT' : ''}</span>
        <span className="text-2xl font-semibold tabular-nums text-slate-900">{gbp(total)}</span>
      </div>

      {!declining ? (
        <>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-900">Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
              className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base outline-none focus:border-slate-500" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-900">Anything we should know? <span className="font-normal text-slate-500">(optional)</span></span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-slate-500" placeholder="e.g. Best days for me are Tuesday or Wednesday" />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="button" disabled={pending} onClick={() => send(true)}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md text-base font-medium text-white disabled:opacity-60" style={{ background: brand }}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-5" />} Accept estimate
          </button>
          <p className="text-center text-xs text-slate-500">By accepting you agree to the work and prices above. We’ll be in touch to book it in.</p>
          <button type="button" onClick={() => setDeclining(true)} className="w-full text-sm text-slate-500 underline-offset-4 hover:underline">No thanks, decline</button>
        </>
      ) : (
        <>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-900">Can you tell us why? <span className="font-normal text-slate-500">(optional)</span></span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-slate-500" />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setDeclining(false)} className="h-11 flex-1 rounded-md border border-slate-300 text-sm font-medium text-slate-700">Back</button>
            <button type="button" disabled={pending} onClick={() => send(false)}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-slate-800 text-sm font-medium text-white disabled:opacity-60">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />} Decline
            </button>
          </div>
        </>
      )}
    </div>
  );
}
