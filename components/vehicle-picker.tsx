'use client';
import { useEffect, useState, useTransition } from 'react';
import { Search, Loader2, Plus, X, Car, CheckCircle2, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field } from '@/components/field';
import { RegPlate } from '@/components/reg-plate';
import { MotBadge } from '@/components/mot-badge';
import { CustomerFields } from '@/components/customer-fields';
import { normaliseReg } from '@/lib/reg';
import type { VehicleLookup } from '@/lib/vehicle-lookup';
import { searchVehicles, type VehicleHit } from '@/app/(app)/diary/actions';
import { lookupRegistration } from '@/app/(app)/vehicles/actions';

export type PickedVehicle = {
  id: string; registration: string; make: string | null; model: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
};

/**
 * Choose the vehicle for a booking: search existing vehicles (reg / owner),
 * or quick-add a new vehicle + customer. Posts vehicle_mode, vehicle_id, nv_*, nc_*.
 */
export function VehiclePicker({
  initial, lookupEnabled, err,
}: { initial?: PickedVehicle | null; lookupEnabled: boolean; err: (k: string) => string | undefined }) {
  const [mode, setMode] = useState<'existing' | 'new' | 'search'>(initial ? 'existing' : 'search');
  const [picked, setPicked] = useState<PickedVehicle | null>(initial ?? null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<VehicleHit[]>([]);
  const [searching, startSearch] = useTransition();

  // quick-add state
  const [reg, setReg] = useState('');
  const [found, setFound] = useState<VehicleLookup | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [looking, startLookup] = useTransition();

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => startSearch(async () => setHits(await searchVehicles(q))), 250);
    return () => clearTimeout(t);
  }, [q]);

  const shownHits = q.trim().length < 2 ? [] : hits;
  const choose = (v: PickedVehicle) => { setPicked(v); setMode('existing'); setQ(''); };

  const startNew = (prefill?: string) => {
    setReg(prefill ? normaliseReg(prefill) : '');
    setFound(null);
    setNote(null);
    setMode('new');
  };

  const runLookup = () => startLookup(async () => {
    const r = normaliseReg(reg);
    const { result, existingId } = await lookupRegistration(r);
    if (existingId) {
      const [hit] = await searchVehicles(r);
      if (hit && hit.id === existingId) { choose(hit); return; }
    }
    if (result.ok) { setFound(result.vehicle); setNote(null); }
    else { setFound(null); setNote(result.message); }
  });

  return (
    <div className="space-y-3">
      <input suppressHydrationWarning type="hidden" name="vehicle_mode" value={mode === 'search' ? '' : mode} />
      <input suppressHydrationWarning type="hidden" name="vehicle_id" value={mode === 'existing' ? picked?.id ?? '' : ''} />

      {mode === 'existing' && picked ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
          <RegPlate reg={picked.registration} className="text-sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{[picked.make, picked.model].filter(Boolean).join(' ') || 'Vehicle'}</div>
            <div className="truncate text-xs text-muted-foreground">
              {picked.customer ? `${picked.customer.name}${picked.customer.phone ? ` · ${picked.customer.phone}` : ''}` : 'No owner on file'}
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setPicked(null); setMode('search'); }}>
            <X /> Change
          </Button>
        </div>
      ) : mode === 'new' ? (
        <div className="space-y-5 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">New vehicle and customer</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode('search')}><X /> Cancel</Button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Field label="Registration" htmlFor="nv_registration" error={err('nv_registration')}>
              <Input id="nv_registration" name="nv_registration" value={reg}
                onChange={(e) => { setReg(e.target.value.toUpperCase()); setFound(null); }}
                placeholder="AB12 CDE" aria-invalid={!!err('nv_registration')}
                className="w-40 bg-[#F7D117] font-mono font-bold tracking-wider text-black uppercase placeholder:text-black/40 dark:bg-[#F7D117]" />
            </Field>
            {lookupEnabled && (
              <Button type="button" variant="outline" onClick={runLookup} disabled={looking || normaliseReg(reg).length < 2}>
                {looking ? <Loader2 className="animate-spin" /> : <Search />} Look up
              </Button>
            )}
          </div>

          {found ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-3">
              <CheckCircle2 className="size-5 text-success" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{[found.make, found.model].filter(Boolean).join(' ')}</div>
                <div className="text-xs text-muted-foreground">
                  {[found.colour, found.fuelType, found.yearOfManufacture].filter(Boolean).join(' · ')}
                </div>
              </div>
              <MotBadge due={found.motDue} />
              {[
                ['nv_make', found.make], ['nv_model', found.model], ['nv_colour', found.colour], ['nv_fuel_type', found.fuelType],
                ['nv_engine_size', found.engineSize], ['nv_year', found.yearOfManufacture], ['nv_mot_due', found.motDue],
                ['nv_last_mileage', found.lastMileage], ['nv_mot_history', JSON.stringify(found.motTests)],
              ].map(([k, v]) => <input suppressHydrationWarning key={k as string} type="hidden" name={k as string} value={v == null ? '' : String(v)} />)}
            </div>
          ) : (
            <>
              {note && (
                <Alert><Info /><AlertDescription>{note}</AlertDescription></Alert>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Make" htmlFor="nv_make"><Input id="nv_make" name="nv_make" placeholder="Ford" /></Field>
                <Field label="Model" htmlFor="nv_model"><Input id="nv_model" name="nv_model" placeholder="Focus" /></Field>
              </div>
            </>
          )}

          <div className="border-t pt-4">
            <p className="mb-3 text-sm font-medium">Customer</p>
            <CustomerFields prefix="nc_" err={err} compact />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by registration, customer name or phone"
              className="pl-8" aria-label="Search vehicles" aria-invalid={!!err('vehicle')} />
            {searching && <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
          {shownHits.length > 0 && (
            <ul className="divide-y overflow-hidden rounded-lg border">
              {shownHits.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => choose(h)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent">
                    <RegPlate reg={h.registration} />
                    <span className="flex-1 truncate text-sm">{[h.make, h.model].filter(Boolean).join(' ') || '—'}</span>
                    <span className="truncate text-xs text-muted-foreground">{h.customer?.name ?? 'No owner'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim().length >= 2 && !searching && shownHits.length === 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              <Car className="size-4" /> Nothing on file matches &ldquo;{q}&rdquo;.
              {normaliseReg(q).length >= 2 && /\d/.test(q) && (
                <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => startNew(q)}>
                  <Plus /> Add {normaliseReg(q)}
                </Button>
              )}
            </div>
          )}
          {err('vehicle') && <p className="text-xs text-destructive">{err('vehicle')}</p>}
          <Button type="button" variant="outline" size="sm" onClick={() => startNew()}>
            <Plus /> New vehicle and customer
          </Button>
        </div>
      )}
    </div>
  );
}
