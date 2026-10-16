// Money helpers. All amounts are integer pence.

export type PricedLine = { quantity: number; unit_price_pence: number; no_vat?: boolean | null; approval?: string | null };

/** Work that will be charged: not waiting on, or declined by, the customer */
export const billable = <T extends PricedLine>(lines: T[]) => lines.filter((l) => !l.approval || l.approval === 'not_required' || l.approval === 'approved');

export const lineTotal = (l: PricedLine) => Math.round(Number(l.quantity) * l.unit_price_pence);

/** Net, VAT and gross for a set of lines. vatRate = null when the garage isn't charging VAT */
export function totals(lines: PricedLine[], vatRate: number | null) {
  const net = lines.reduce((s, l) => s + lineTotal(l), 0);
  const vatable = lines.reduce((s, l) => s + (l.no_vat ? 0 : lineTotal(l)), 0);
  const vat = vatRate ? Math.round((vatable * vatRate) / 100) : 0;
  return { net, vat, gross: net + vat };
}

/** VAT rate to apply on a given date, or null if not VAT registered then */
export function vatRateOn(
  g: { vat_registered: boolean; vat_effective_from: string | null; default_vat_rate: number | string | null },
  ymd: string
) {
  if (!g.vat_registered || !g.vat_effective_from || ymd < g.vat_effective_from) return null;
  return Number(g.default_vat_rate ?? 20);
}

/** "£12.50" / "12.5" / "12" → 1250 pence; null if invalid */
export function parsePounds(input: string): number | null {
  const v = input.replace(/[£,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}
