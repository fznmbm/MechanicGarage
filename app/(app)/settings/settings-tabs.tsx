'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Building2, Palette, Wrench, Receipt, Percent, Upload, Trash2, Plus, Loader2, Info, GripVertical,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { GarageLogo } from '@/components/garage-logo';
import { readableOn } from '@/lib/brand';
import { cn } from '@/lib/utils';
import type { ActionState, Bay, Garage } from '@/lib/types';
import { saveBranding, saveBusiness, saveInvoicing, saveVat, saveWorkshop } from './actions';

type Action = (s: ActionState, fd: FormData) => Promise<ActionState>;

/* ---------- shared bits ---------- */

function useSave(action: Action) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  useEffect(() => {
    if (!state.ts) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message ?? 'Something went wrong');
  }, [state]);
  return { state, formAction, pending, err: (k: string) => state.errors?.[k] };
}

function Field({
  label, htmlFor, error, hint, className, children,
}: {
  label: string; htmlFor: string; error?: string; hint?: React.ReactNode; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function SectionCard({
  title, description, pending, children,
}: { title: string; description: string; pending: boolean; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
      <CardFooter className="justify-end border-t">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
      </CardFooter>
    </Card>
  );
}

/* ---------- Business ---------- */

function BusinessForm({ g, rootDomain }: { g: Garage; rootDomain: string }) {
  const { formAction, pending, err } = useSave(saveBusiness);
  return (
    <form suppressHydrationWarning action={formAction}>
      <SectionCard title="Business details" description="Shown on invoices, emails and your booking page." pending={pending}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Garage name" htmlFor="name" error={err('name')} className="sm:col-span-2">
            <Input id="name" name="name" defaultValue={g.name} required aria-invalid={!!err('name')} />
          </Field>
          <Field label="Address" htmlFor="address" error={err('address')} className="sm:col-span-2">
            <Textarea id="address" name="address" rows={3} defaultValue={g.address ?? ''}
              placeholder={'Unit 4, Example Industrial Estate\nCrawley'} />
          </Field>
          <Field label="Postcode" htmlFor="postcode" error={err('postcode')}>
            <Input id="postcode" name="postcode" defaultValue={g.postcode ?? ''} className="uppercase"
              aria-invalid={!!err('postcode')} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={err('phone')}>
            <Input id="phone" name="phone" type="tel" defaultValue={g.phone ?? ''} />
          </Field>
          <Field label="Email" htmlFor="email" error={err('email')}>
            <Input id="email" name="email" type="email" defaultValue={g.email ?? ''} aria-invalid={!!err('email')} />
          </Field>
          <Field label="Website" htmlFor="website" error={err('website')}>
            <Input id="website" name="website" defaultValue={g.website ?? ''} placeholder="www.yourgarage.co.uk" />
          </Field>
        </div>
        <div className="rounded-lg bg-muted/60 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Your RampDesk address: </span>
          <span className="font-medium">{g.slug}.{rootDomain}</span>
        </div>
      </SectionCard>
    </form>
  );
}

/* ---------- Branding ---------- */

const SWATCHES = ['#1F4E79', '#2563EB', '#0F766E', '#15803D', '#B91C1C', '#C2410C', '#7C3AED', '#111827'];

function BrandingForm({ g }: { g: Garage }) {
  const { formAction, pending, err, state } = useSave(saveBranding);
  const [colour, setColour] = useState<string>(g.brand_colour ?? '');
  const [preview, setPreview] = useState<string | null>(g.logo_url);
  const [removeLogo, setRemoveLogo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // After a successful save, clear the file input so it isn't re-uploaded
  useEffect(() => {
    if (state.ok && fileRef.current) fileRef.current.value = '';
  }, [state]);

  // With no custom colour, preview the app's default theme colour
  const shown = colour || 'var(--primary)';
  const fg = colour ? readableOn(colour) : 'var(--primary-foreground)';

  return (
    <form suppressHydrationWarning action={formAction}>
      <SectionCard title="Branding" description="Your logo and colour appear across the app, invoices and the booking page." pending={pending}>
        <Field label="Logo" htmlFor="logo" error={err('logo')} hint="PNG, JPG or WebP, up to 1 MB. A square logo works best.">
          <div className="flex items-center gap-4">
            <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg border bg-white">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Logo preview" className="size-full object-contain" />
              ) : (
                <GarageLogo name={g.name} className="size-full rounded-none text-lg" />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload /> Upload logo
              </Button>
              {preview && (
                <Button type="button" variant="ghost" size="sm" className="text-destructive"
                  onClick={() => {
                    setPreview(null);
                    setRemoveLogo(true);
                    if (fileRef.current) fileRef.current.value = '';
                  }}>
                  <Trash2 /> Remove
                </Button>
              )}
            </div>
            <input suppressHydrationWarning ref={fileRef} id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setPreview(URL.createObjectURL(f));
                  setRemoveLogo(false);
                }
              }} />
            <input suppressHydrationWarning type="hidden" name="remove_logo" value={removeLogo ? '1' : '0'} />
          </div>
        </Field>

        <Field label="Brand colour" htmlFor="brand_colour_picker" error={err('brand_colour')}
          hint="Used for buttons, highlights and your invoice header. Text colour adjusts automatically.">
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((s) => (
              <button key={s} type="button" aria-label={`Use ${s}`} onClick={() => setColour(s)}
                className={cn(
                  'size-8 rounded-full border-2 border-transparent ring-offset-2 ring-offset-background transition',
                  colour.toUpperCase() === s && 'ring-2 ring-foreground'
                )}
                style={{ background: s }} />
            ))}
            <label className="relative flex h-8 items-center gap-2 rounded-md border px-2 text-sm">
              <input suppressHydrationWarning id="brand_colour_picker" type="color" value={colour || '#1A5BA6'}
                onChange={(e) => setColour(e.target.value.toUpperCase())}
                className="size-5 cursor-pointer appearance-none rounded border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0" />
              <span className="font-mono text-xs">{colour ? colour.toUpperCase() : 'Default'}</span>
            </label>
            {colour && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setColour('')}>Reset</Button>
            )}
          </div>
          <input suppressHydrationWarning type="hidden" name="brand_colour" value={colour} />
        </Field>

        <div className="space-y-2">
          <Label>Preview</Label>
          <div className="overflow-hidden rounded-lg border">
            <div className="flex items-center gap-3 bg-sidebar px-4 py-3 text-sidebar-foreground">
              <div className="flex size-8 items-center justify-center overflow-hidden rounded-md bg-white">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="size-full object-contain" />
                ) : (
                  <span className="flex size-full items-center justify-center text-sm font-semibold" style={{ background: shown, color: fg }}>
                    {g.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <span className="text-sm font-semibold">{g.name}</span>
              <span className="ml-auto rounded-md px-2.5 py-1 text-xs font-medium" style={{ background: shown, color: fg }}>
                Dashboard
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 bg-background p-4">
              <span className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium" style={{ background: shown, color: fg }}>
                New job
              </span>
              <span className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium">Cancel</span>
              <span className="text-sm font-medium" style={{ color: shown }}>View invoice →</span>
            </div>
          </div>
        </div>
      </SectionCard>
    </form>
  );
}

/* ---------- Workshop ---------- */

function WorkshopForm({ g, bays: initialBays }: { g: Garage; bays: Bay[] }) {
  const { formAction, pending, err } = useSave(saveWorkshop);
  const [bays, setBays] = useState(initialBays.map((b) => ({ key: b.id, id: b.id, name: b.name })));
  const nextKey = useRef(0);

  return (
    <form suppressHydrationWarning action={formAction}>
      <SectionCard title="Workshop" description="Labour rate, opening hours and the bays or ramps in your diary." pending={pending}>
        <Field label="Labour rate (per hour)" htmlFor="labour_rate" error={err('labour_rate')}
          hint={g.vat_registered ? 'Enter the rate before VAT.' : 'Used as the default price for labour lines.'}>
          <div className="relative max-w-48">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">£</span>
            <Input id="labour_rate" name="labour_rate" type="number" min={0} max={1000} step="0.01" className="pl-7"
              defaultValue={(g.labour_rate_pence / 100).toFixed(2)} aria-invalid={!!err('labour_rate')} />
          </div>
        </Field>

        <div className="grid max-w-md grid-cols-2 gap-5">
          <Field label="Opens" htmlFor="opening_time" error={err('opening_time')}>
            <Input id="opening_time" name="opening_time" type="time" step={900}
              defaultValue={(g.opening_time ?? '08:00').slice(0, 5)} aria-invalid={!!err('opening_time')} />
          </Field>
          <Field label="Closes" htmlFor="closing_time" error={err('closing_time')}>
            <Input id="closing_time" name="closing_time" type="time" step={900}
              defaultValue={(g.closing_time ?? '18:00').slice(0, 5)} aria-invalid={!!err('closing_time')} />
          </Field>
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">Sets the hours shown in the diary.</p>

        <div className="space-y-2">
          <Label>Open days</Label>
          <div className="flex flex-wrap gap-1.5">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
              <label key={d} className="cursor-pointer">
                <input suppressHydrationWarning type="checkbox" name="open_days" value={i + 1} defaultChecked={(g.open_days ?? [1, 2, 3, 4, 5, 6]).includes(i + 1)} className="peer sr-only" />
                <span className="inline-flex h-9 w-12 items-center justify-center rounded-md border text-sm font-medium transition peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50">
                  {d}
                </span>
              </label>
            ))}
          </div>
          {err('open_days') ? <p className="text-xs text-destructive">{err('open_days')}</p> : <p className="text-xs text-muted-foreground">Online booking only offers slots on these days.</p>}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label>Bays and ramps</Label>
              <p className="mt-1 text-xs text-muted-foreground">Each bay gets its own column in the diary.</p>
            </div>
            <Button type="button" variant="outline" size="sm"
              onClick={() => setBays((b) => [...b, { key: `new-${nextKey.current++}`, id: '', name: `Bay ${b.length + 1}` }])}>
              <Plus /> Add bay
            </Button>
          </div>
          <ul className="divide-y rounded-lg border">
            {bays.map((b, i) => (
              <li key={b.key} className="flex items-center gap-2 px-3 py-2">
                <GripVertical className="size-4 text-muted-foreground/50" />
                <span className="w-6 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                <input suppressHydrationWarning type="hidden" name="bay_id" value={b.id} />
                <Input name="bay_name" value={b.name} aria-label={`Bay ${i + 1} name`} className="h-8"
                  onChange={(e) => setBays((all) => all.map((x) => (x.key === b.key ? { ...x, name: e.target.value } : x)))} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove bay" disabled={bays.length === 1}
                  onClick={() => setBays((all) => all.filter((x) => x.key !== b.key))}>
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </li>
            ))}
          </ul>
          {err('bays') && <p className="text-xs text-destructive">{err('bays')}</p>}
        </div>
      </SectionCard>
    </form>
  );
}

/* ---------- Invoicing ---------- */

function InvoicingForm({ g }: { g: Garage }) {
  const { formAction, pending, err } = useSave(saveInvoicing);
  const [prefix, setPrefix] = useState(g.invoice_prefix);
  const [next, setNext] = useState(String(g.next_invoice_number));
  const sample = `${prefix.toUpperCase()}${String(Number(next) || 1).padStart(5, '0')}`;

  return (
    <form suppressHydrationWarning action={formAction}>
      <SectionCard title="Invoicing" description="Invoice numbering, payment terms and the small print." pending={pending}>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Number prefix" htmlFor="invoice_prefix" error={err('invoice_prefix')}>
            <Input id="invoice_prefix" name="invoice_prefix" value={prefix} maxLength={10} className="uppercase"
              onChange={(e) => setPrefix(e.target.value)} aria-invalid={!!err('invoice_prefix')} />
          </Field>
          <Field label="Next invoice number" htmlFor="next_invoice_number" error={err('next_invoice_number')}
            hint="Continuing from paper invoices? Set your next number here.">
            <Input id="next_invoice_number" name="next_invoice_number" type="number" min={g.next_invoice_number}
              value={next} onChange={(e) => setNext(e.target.value)} aria-invalid={!!err('next_invoice_number')} />
          </Field>
          <Field label="Payment terms" htmlFor="payment_terms_days" error={err('payment_terms_days')}
            hint="0 means due on collection.">
            <div className="relative">
              <Input id="payment_terms_days" name="payment_terms_days" type="number" min={0} max={120}
                defaultValue={g.payment_terms_days} className="pr-12" />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">days</span>
            </div>
          </Field>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Next invoice will be</span>
          <Badge variant="secondary" className="font-mono">{sample}</Badge>
        </div>
        <Field label="How customers can pay" htmlFor="bank_details" error={err('bank_details')}
          hint="Shown on unpaid invoices. For example your bank details for transfers.">
          <Textarea id="bank_details" name="bank_details" rows={3} defaultValue={g.bank_details ?? ''}
            placeholder={'Smith’s Garage Ltd\nSort code 12-34-56 · Account 12345678'} />
        </Field>
        <Field label="Pay online link (optional)" htmlFor="payment_link_url" error={err('payment_link_url')}
          hint="Your own SumUp, Stripe, PayPal or bank payment link. Customers see a “Pay online” button on their invoice.">
          <Input id="payment_link_url" name="payment_link_url" defaultValue={g.payment_link_url ?? ''} placeholder="https://pay.sumup.com/…" />
        </Field>
        <Field label="Terms and conditions" htmlFor="invoice_terms" error={err('invoice_terms')}
          hint="Printed at the bottom of every invoice. For example warranty, payment methods, or storage charges.">
          <Textarea id="invoice_terms" name="invoice_terms" rows={5} defaultValue={g.invoice_terms ?? ''}
            placeholder="Parts carry a 12-month manufacturer's warranty. Vehicles left more than 7 days after completion may incur storage charges." />
        </Field>
      </SectionCard>
    </form>
  );
}

/* ---------- VAT ---------- */

function VatForm({ g }: { g: Garage }) {
  const { formAction, pending, err } = useSave(saveVat);
  const [on, setOn] = useState(g.vat_registered);

  return (
    <form suppressHydrationWarning action={formAction}>
      <SectionCard title="VAT" description="Turn this on when the garage becomes VAT registered." pending={pending}>
        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-1">
            <Label htmlFor="vat_registered" className="text-base">VAT registered</Label>
            <p className="text-sm text-muted-foreground">
              {on ? 'Invoices dated on or after the start date will be VAT invoices.' : 'Invoices are issued without VAT.'}
            </p>
          </div>
          <Switch id="vat_registered" name="vat_registered" checked={on} onCheckedChange={setOn} />
        </div>

        {on && (
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="VAT number" htmlFor="vat_number" error={err('vat_number')}>
              <Input id="vat_number" name="vat_number" defaultValue={g.vat_number ?? ''} placeholder="GB123456789"
                className="uppercase" aria-invalid={!!err('vat_number')} />
            </Field>
            <Field label="Registered from" htmlFor="vat_effective_from" error={err('vat_effective_from')}>
              <Input id="vat_effective_from" name="vat_effective_from" type="date" defaultValue={g.vat_effective_from ?? ''}
                aria-invalid={!!err('vat_effective_from')} />
            </Field>
            <Field label="Standard rate" htmlFor="default_vat_rate" error={err('default_vat_rate')}>
              <div className="relative">
                <Input id="default_vat_rate" name="default_vat_rate" type="number" min={0} max={100} step="0.01"
                  defaultValue={g.default_vat_rate ?? 20} className="pr-8" />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
            </Field>
          </div>
        )}

        <Alert>
          <Info />
          <AlertDescription>
            Invoices already issued never change. Each invoice keeps the VAT status and rates it was issued with,
            so switching VAT on or off only affects new invoices.
          </AlertDescription>
        </Alert>
      </SectionCard>
    </form>
  );
}

/* ---------- Tabs ---------- */

const TAB_LIST = [
  { value: 'business', label: 'Business', icon: Building2 },
  { value: 'branding', label: 'Branding', icon: Palette },
  { value: 'workshop', label: 'Workshop', icon: Wrench },
  { value: 'invoicing', label: 'Invoicing', icon: Receipt },
  { value: 'vat', label: 'VAT', icon: Percent },
];

export type ExtraTab = { value: string; label: string; icon: React.ReactNode; content: React.ReactNode };

export function SettingsTabs({
  garage, bays, initialTab, rootDomain, extra = [],
}: { garage: Garage; bays: Bay[]; initialTab: string; rootDomain: string; extra?: ExtraTab[] }) {
  return (
    <Tabs
      defaultValue={initialTab}
      onValueChange={(v) => window.history.replaceState(null, '', `?tab=${v}`)}
      className="gap-4"
    >
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <TabsList>
          {TAB_LIST.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="px-3">
              <t.icon /> {t.label}
            </TabsTrigger>
          ))}
          {extra.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="px-3">{t.icon} {t.label}</TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value="business"><BusinessForm g={garage} rootDomain={rootDomain} /></TabsContent>
      <TabsContent value="branding"><BrandingForm g={garage} /></TabsContent>
      <TabsContent value="workshop"><WorkshopForm g={garage} bays={bays} /></TabsContent>
      <TabsContent value="invoicing"><InvoicingForm g={garage} /></TabsContent>
      <TabsContent value="vat"><VatForm g={garage} /></TabsContent>
      {extra.map((t) => <TabsContent key={t.value} value={t.value}>{t.content}</TabsContent>)}
    </Tabs>
  );
}
