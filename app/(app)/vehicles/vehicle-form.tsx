'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import {
  Search, Loader2, PencilLine, CheckCircle2, AlertTriangle, Info, ArrowRight, ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/field';
import { CustomerPicker } from '@/components/customer-picker';
import { MotBadge } from '@/components/mot-badge';
import { useActionToast } from '@/components/use-action-toast';
import { miles } from '@/lib/format';
import { normaliseReg, prettyReg } from '@/lib/reg';
import type { VehicleLookup } from '@/lib/vehicle-lookup';
import { createVehicle, lookupRegistration, updateVehicle } from './actions';

export type VehicleDefaults = {
  id?: string;
  registration?: string | null;
  make?: string | null; model?: string | null; colour?: string | null; fuel_type?: string | null;
  engine_size?: number | null; year_of_manufacture?: number | null; first_registered?: string | null;
  mot_due?: string | null; service_due?: string | null; tax_status?: string | null; tax_due?: string | null;
  last_mileage?: number | null; vin?: string | null; notes?: string | null;
};

type Owner = { id: string; name: string; sub?: string | null } | null;

type LookupState =
  | { kind: 'idle' }
  | { kind: 'found'; v: VehicleLookup }
  | { kind: 'existing'; id: string; v?: VehicleLookup }
  | { kind: 'manual'; reason?: string; tone?: 'info' | 'warn' };

const FUELS = ['Petrol', 'Diesel', 'Hybrid Electric (Clean)', 'Electric', 'Electricity', 'Gas', 'Other'];

function fromLookup(v: VehicleLookup): VehicleDefaults {
  return {
    registration: v.registration, make: v.make, model: v.model, colour: v.colour, fuel_type: v.fuelType,
    engine_size: v.engineSize, year_of_manufacture: v.yearOfManufacture, first_registered: v.firstRegistered,
    mot_due: v.motDue, tax_status: v.taxStatus, tax_due: v.taxDue, last_mileage: v.lastMileage,
  };
}

export function VehicleForm({
  vehicle, owner, initialReg, lookupEnabled,
}: { vehicle?: VehicleDefaults; owner?: Owner; initialReg?: string; lookupEnabled: boolean }) {
  const editing = !!vehicle?.id;
  const { formAction, pending, err } = useActionToast(editing ? updateVehicle : createVehicle);

  const [reg, setReg] = useState(prettyReg(initialReg ?? vehicle?.registration ?? ''));
  // Arriving with ?reg= but lookup not set up: go straight to manual entry
  const manualStart = !editing && !!initialReg && !lookupEnabled;
  const [lookup, setLookup] = useState<LookupState>(
    editing ? { kind: 'manual' }
      : manualStart ? { kind: 'manual', reason: 'Registration lookup is not set up yet. Enter the details manually.', tone: 'info' }
      : { kind: 'idle' }
  );
  const [defaults, setDefaults] = useState<VehicleDefaults>(
    vehicle ?? (manualStart ? { registration: normaliseReg(initialReg!) } : {})
  );
  const [formKey, setFormKey] = useState(0);
  const [searching, startSearch] = useTransition();
  const autoRan = useRef(false);

  const runLookup = (value = reg) => {
    const r = normaliseReg(value);
    if (!r) return;
    startSearch(async () => {
      const { result, existingId } = await lookupRegistration(r);
      if (existingId) {
        setLookup({ kind: 'existing', id: existingId, v: result.ok ? result.vehicle : undefined });
        return;
      }
      if (result.ok) {
        setDefaults(fromLookup(result.vehicle));
        setLookup({ kind: 'found', v: result.vehicle });
      } else {
        setDefaults({ registration: r });
        setLookup({ kind: 'manual', reason: result.message, tone: result.code === 'not_configured' ? 'info' : 'warn' });
      }
      setFormKey((k) => k + 1);
    });
  };

  // Auto-lookup when arriving with ?reg=
  useEffect(() => {
    if (!editing && initialReg && lookupEnabled && !autoRan.current) {
      autoRan.current = true;
      runLookup(initialReg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showDetails = lookup.kind === 'found' || lookup.kind === 'manual';
  const found = lookup.kind === 'found' ? lookup.v : null;

  return (
    <div className="space-y-6">
      {/* ---------- Step 1: registration ---------- */}
      {!editing && (
        <Card>
          <CardHeader>
            <CardTitle>Registration</CardTitle>
            <CardDescription>
              {lookupEnabled
                ? 'Enter the number plate and we’ll fetch the make, model, MOT date and MOT history.'
                : 'Enter the number plate. Automatic lookup switches on once your DVSA API key is added.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form suppressHydrationWarning
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (lookupEnabled) runLookup();
                else {
                  setDefaults({ registration: normaliseReg(reg) });
                  setLookup({ kind: 'manual' });
                  setFormKey((k) => k + 1);
                }
              }}
            >
              <div className="flex h-14 overflow-hidden rounded-lg border-2 border-black/80 shadow-sm sm:w-80">
                <span className="flex w-10 flex-col items-center justify-end bg-[#00309A] pb-1.5 text-[10px] font-bold text-white">UK</span>
                <input suppressHydrationWarning
                  value={reg}
                  onChange={(e) => setReg(e.target.value.toUpperCase())}
                  placeholder="AB12 CDE"
                  aria-label="Registration"
                  autoFocus
                  maxLength={10}
                  className="w-full bg-[#F7D117] px-3 text-center font-mono text-2xl font-bold tracking-[0.15em] text-black uppercase outline-none placeholder:text-black/30"
                />
              </div>
              <Button type="submit" size="lg" className="h-14 px-6" disabled={searching || normaliseReg(reg).length < 2}>
                {searching ? <Loader2 className="animate-spin" /> : <Search />}
                {lookupEnabled ? 'Find vehicle' : 'Continue'}
              </Button>
              {lookupEnabled && lookup.kind === 'idle' && (
                <Button type="button" variant="ghost" className="h-14" onClick={() => {
                  setDefaults({ registration: normaliseReg(reg) });
                  setLookup({ kind: 'manual' });
                  setFormKey((k) => k + 1);
                }}>
                  <PencilLine /> Enter manually
                </Button>
              )}
            </form>

            {lookup.kind === 'existing' && (
              <Alert className="mt-4">
                <Info />
                <AlertTitle>{prettyReg(reg)} is already on file</AlertTitle>
                <AlertDescription>
                  <Button size="sm" className="mt-2" asChild>
                    <Link href={`/vehicles/${lookup.id}`}>Open vehicle <ArrowRight /></Link>
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {lookup.kind === 'manual' && lookup.reason && (
              <Alert className="mt-4">
                {lookup.tone === 'warn' ? <AlertTriangle /> : <Info />}
                <AlertDescription>{lookup.reason}</AlertDescription>
              </Alert>
            )}

            {found && (
              <div className="mt-4 rounded-lg border border-success/30 bg-success/5 p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 text-success" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">
                      {[found.make, found.model].filter(Boolean).join(' ') || 'Vehicle found'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {[found.colour, found.fuelType, found.yearOfManufacture, found.engineSize ? `${found.engineSize}cc` : null]
                        .filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <MotBadge due={found.motDue} />
                </div>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                  <div><span className="text-muted-foreground">Last MOT mileage</span><div className="font-medium">{miles(found.lastMileage)}</div></div>
                  <div><span className="text-muted-foreground">MOT tests on record</span><div className="font-medium">{found.motTests.length}</div></div>
                  <div>
                    <span className="text-muted-foreground">Advisories at last MOT</span>
                    <div className="font-medium">
                      {found.motTests[0]?.defects.filter((d) => d.type === 'ADVISORY').length ?? 0}
                    </div>
                  </div>
                </div>
                {found.hasOutstandingRecall && (
                  <Alert variant="destructive" className="mt-3">
                    <ShieldAlert />
                    <AlertTitle>Outstanding safety recall</AlertTitle>
                    <AlertDescription>Tell the customer to contact the manufacturer or a franchised dealer.</AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---------- Step 2: details + owner ---------- */}
      {showDetails && (
        <form suppressHydrationWarning action={formAction} key={formKey} className="space-y-6">
          {editing && <input suppressHydrationWarning type="hidden" name="id" value={vehicle!.id} />}
          {found && (
            <>
              <input suppressHydrationWarning type="hidden" name="mot_history" value={JSON.stringify(found.motTests)} />
              <input suppressHydrationWarning type="hidden" name="recall" value={found.hasOutstandingRecall == null ? '' : found.hasOutstandingRecall ? '1' : '0'} />
              <input suppressHydrationWarning type="hidden" name="looked_up" value="1" />
            </>
          )}

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Vehicle details</CardTitle>
              <CardDescription>
                {found ? 'Filled in from DVSA records. Check them and add anything missing.' : 'Fill in what you know. Everything except the registration is optional.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Registration" htmlFor="registration" error={err('registration')}>
                <Input id="registration" name="registration" defaultValue={prettyReg(defaults.registration ?? '')}
                  readOnly={!editing && !!found} aria-invalid={!!err('registration')}
                  className="bg-[#F7D117] font-mono font-bold tracking-wider text-black uppercase read-only:opacity-90 dark:bg-[#F7D117]" />
              </Field>
              <Field label="Make" htmlFor="make">
                <Input id="make" name="make" defaultValue={defaults.make ?? ''} placeholder="Ford" />
              </Field>
              <Field label="Model" htmlFor="model">
                <Input id="model" name="model" defaultValue={defaults.model ?? ''} placeholder="Focus" />
              </Field>
              <Field label="Colour" htmlFor="colour">
                <Input id="colour" name="colour" defaultValue={defaults.colour ?? ''} />
              </Field>
              <Field label="Fuel" htmlFor="fuel_type">
                <Input id="fuel_type" name="fuel_type" list="fuels" defaultValue={defaults.fuel_type ?? ''} />
                <datalist id="fuels">{FUELS.map((f) => <option key={f} value={f} />)}</datalist>
              </Field>
              <Field label="Engine size (cc)" htmlFor="engine_size" error={err('engine_size')}>
                <Input id="engine_size" name="engine_size" type="number" inputMode="numeric" defaultValue={defaults.engine_size ?? ''} />
              </Field>
              <Field label="Year of manufacture" htmlFor="year_of_manufacture" error={err('year_of_manufacture')}>
                <Input id="year_of_manufacture" name="year_of_manufacture" type="number" inputMode="numeric"
                  defaultValue={defaults.year_of_manufacture ?? ''} />
              </Field>
              <Field label="First registered" htmlFor="first_registered" error={err('first_registered')}>
                <Input id="first_registered" name="first_registered" type="date" defaultValue={defaults.first_registered ?? ''} />
              </Field>
              <Field label="MOT due" htmlFor="mot_due" error={err('mot_due')}>
                <Input id="mot_due" name="mot_due" type="date" defaultValue={defaults.mot_due ?? ''} />
              </Field>
              <Field label="Service due" htmlFor="service_due" error={err('service_due')}>
                <Input id="service_due" name="service_due" type="date" defaultValue={defaults.service_due ?? ''} />
              </Field>
              <Field label="Current mileage" htmlFor="last_mileage" error={err('last_mileage')}>
                <Input id="last_mileage" name="last_mileage" type="number" inputMode="numeric" defaultValue={defaults.last_mileage ?? ''} />
              </Field>
              <Field label="VIN / chassis number" htmlFor="vin" error={err('vin')}>
                <Input id="vin" name="vin" defaultValue={defaults.vin ?? ''} className="font-mono uppercase" maxLength={17} />
              </Field>
              {(defaults.tax_status || defaults.tax_due) && (
                <>
                  <Field label="Tax status" htmlFor="tax_status">
                    <Input id="tax_status" name="tax_status" defaultValue={defaults.tax_status ?? ''} />
                  </Field>
                  <Field label="Tax due" htmlFor="tax_due" error={err('tax_due')}>
                    <Input id="tax_due" name="tax_due" type="date" defaultValue={defaults.tax_due ?? ''} />
                  </Field>
                </>
              )}
              <Field label="Notes" htmlFor="notes" optional className="sm:col-span-2 lg:col-span-3"
                hint="For example: locking wheel nut in glovebox, aftermarket alarm.">
                <Textarea id="notes" name="notes" rows={2} defaultValue={defaults.notes ?? ''} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Owner</CardTitle>
              <CardDescription>Link the vehicle to a customer so it shows on their record and reminders.</CardDescription>
            </CardHeader>
            <CardContent>
              <CustomerPicker initial={owner} err={err} />
            </CardContent>
            <CardFooter className="justify-end gap-2 border-t">
              <Button type="button" variant="ghost" asChild>
                <Link href={editing ? `/vehicles/${vehicle!.id}` : '/vehicles'}>Cancel</Link>
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                {editing ? 'Save changes' : 'Save vehicle'}
              </Button>
            </CardFooter>
          </Card>
        </form>
      )}
    </div>
  );
}
