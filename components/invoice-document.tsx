import { gbp, ukDate } from '@/lib/format';
import { prettyReg } from '@/lib/reg';
import { balance, brandOf, qty, vatSummary, type InvoiceDoc } from '@/lib/invoice';
import { jobNo } from '@/lib/jobs';
import { cn } from '@/lib/utils';

/** The invoice as a printable A4-style page. Always light (it's a document). */
export function InvoiceDocument({ doc, className }: { doc: InvoiceDoc; className?: string }) {
  const { invoice: i, lines, payments } = doc;
  const s = i.seller;
  const b = i.buyer;
  const v = i.vehicle;
  const brand = brandOf(s);
  const owed = balance(i);
  const vat = i.is_vat_invoice;
  const summary = vat ? vatSummary(lines) : [];

  return (
    <article className={cn('relative mx-auto w-full max-w-[210mm] bg-white p-6 text-[13px] leading-relaxed text-slate-800 shadow-sm sm:p-10 print:max-w-none print:p-0 print:shadow-none', className)}
      style={{ colorScheme: 'light' }}>
      {i.status === 'void' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-12 rounded-lg border-4 border-red-500/60 px-6 py-2 text-6xl font-black tracking-widest text-red-500/60">VOID</span>
        </div>
      )}

      {/* header */}
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-4 pb-6" style={{ borderColor: brand }}>
        <div className="flex items-start gap-4">
          {s.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.logo_url} alt="" className="size-16 object-contain" />
          )}
          <div>
            <div className="text-lg font-bold text-slate-900">{s.name}</div>
            {s.address && <div className="whitespace-pre-line text-slate-600">{s.address}</div>}
            {s.postcode && <div className="text-slate-600">{s.postcode}</div>}
            <div className="text-slate-600">{[s.phone, s.email].filter(Boolean).join(' · ')}</div>
            {s.website && <div className="text-slate-600">{s.website.replace(/^https?:\/\//, '')}</div>}
          </div>
        </div>
        <div className="sm:text-right">
          <div className="text-2xl font-bold tracking-tight" style={{ color: brand }}>{vat ? 'VAT INVOICE' : 'INVOICE'}</div>
          <dl className="mt-2 grid grid-cols-[auto_auto] justify-start gap-x-4 gap-y-0.5 text-slate-600 sm:justify-end">
            <dt>Invoice no.</dt><dd className="font-semibold text-slate-900">{i.number}</dd>
            <dt>Date{vat ? ' / tax point' : ''}</dt><dd>{ukDate(i.issued_at)}</dd>
            {i.due_at && <><dt>Due</dt><dd>{i.due_at === i.issued_at ? 'On receipt' : ukDate(i.due_at)}</dd></>}
            {vat && s.vat_number && <><dt>VAT reg. no.</dt><dd>{s.vat_number}</dd></>}
          </dl>
        </div>
      </header>

      {/* parties */}
      <section className="grid gap-6 py-6 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Bill to</div>
          <div className="font-semibold text-slate-900">{b.name ?? 'Customer'}</div>
          {b.address && <div className="whitespace-pre-line text-slate-600">{b.address}</div>}
          {b.postcode && <div className="text-slate-600">{b.postcode}</div>}
          {(b.phone || b.email) && <div className="text-slate-600">{[b.phone, b.email].filter(Boolean).join(' · ')}</div>}
        </div>
        {v.registration && (
          <div className="sm:text-right">
            <div className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Vehicle</div>
            <div className="flex items-center gap-2 sm:justify-end">
              <span className="rounded-[3px] border border-black/25 bg-[#F7D117] px-1.5 py-0.5 font-mono text-xs font-bold tracking-wider text-black">
                {prettyReg(v.registration)}
              </span>
              <span className="font-semibold text-slate-900">{[v.make, v.model].filter(Boolean).join(' ')}</span>
            </div>
            <div className="text-slate-600">
              {[v.mileage != null ? `Mileage ${v.mileage.toLocaleString('en-GB')}` : null, v.job_number ? `Job ${jobNo(v.job_number)}` : null].filter(Boolean).join(' · ')}
            </div>
          </div>
        )}
      </section>

      {/* lines: stacked on phones */}
      <ul className="divide-y border-y sm:hidden">
        {lines.map((l) => (
          <li key={l.id} className="py-2.5">
            <div className="flex justify-between gap-3">
              <span className="text-slate-900">{l.description}</span>
              <span className="font-medium tabular-nums">{gbp(l.line_total_pence)}</span>
            </div>
            <div className="text-xs text-slate-500">
              {qty(l.quantity)}{l.type === 'labour' ? ' hrs' : ''} × {gbp(l.unit_price_pence)}
              {vat && ` · VAT ${Number(l.vat_rate) > 0 ? `${Number(l.vat_rate)}%` : 'O/S'}`}
              {l.part_number && ` · ${l.part_number}`}
            </div>
          </li>
        ))}
      </ul>

      {/* lines: table */}
      <table className="hidden w-full border-collapse sm:table">
        <thead>
          <tr className="text-left text-xs tracking-wide text-white uppercase" style={{ background: brand }}>
            <th className="px-3 py-2 font-semibold">Description</th>
            <th className="px-3 py-2 text-right font-semibold">Qty</th>
            <th className="px-3 py-2 text-right font-semibold">Unit{vat ? ' (ex VAT)' : ''}</th>
            {vat && <th className="px-3 py-2 text-right font-semibold">VAT</th>}
            <th className="px-3 py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => (
            <tr key={l.id} className={cn('align-top', idx % 2 === 1 && 'bg-slate-50')}>
              <td className="px-3 py-2">
                <span className="text-slate-900">{l.description}</span>
                {l.part_number && <span className="ml-2 font-mono text-xs text-slate-500">{l.part_number}</span>}
                {l.type === 'labour' && <span className="ml-2 text-xs text-slate-500">(labour, hrs)</span>}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{qty(l.quantity)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{gbp(l.unit_price_pence)}</td>
              {vat && <td className="px-3 py-2 text-right tabular-nums">{Number(l.vat_rate) > 0 ? `${Number(l.vat_rate)}%` : 'O/S'}</td>}
              <td className="px-3 py-2 text-right font-medium tabular-nums">{gbp(l.line_total_pence)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* totals */}
      <section className="mt-4 flex flex-col-reverse gap-6 sm:flex-row sm:justify-between">
        <div className="max-w-sm space-y-3 text-slate-600">
          {vat && summary.length > 1 && (
            <table className="text-xs">
              <thead><tr className="text-slate-500"><th className="pr-4 text-left font-medium">VAT rate</th><th className="pr-4 text-right font-medium">Net</th><th className="text-right font-medium">VAT</th></tr></thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={r.rate}>
                    <td className="pr-4">{r.rate > 0 ? `${r.rate}%` : 'Outside scope'}</td>
                    <td className="pr-4 text-right tabular-nums">{gbp(r.net)}</td>
                    <td className="text-right tabular-nums">{gbp(Math.round((r.net * r.rate) / 100))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {vat && lines.some((l) => Number(l.vat_rate) === 0) && (
            <p className="text-xs">O/S = outside the scope of VAT (e.g. statutory MOT test fee).</p>
          )}
        </div>
        <dl className="w-full space-y-1 sm:w-64">
          <div className="flex justify-between"><dt className="text-slate-600">{vat ? 'Subtotal (ex VAT)' : 'Subtotal'}</dt><dd className="tabular-nums">{gbp(i.subtotal_pence)}</dd></div>
          {vat && <div className="flex justify-between"><dt className="text-slate-600">VAT</dt><dd className="tabular-nums">{gbp(i.vat_pence)}</dd></div>}
          <div className="flex justify-between border-t-2 pt-1 text-base font-bold text-slate-900" style={{ borderColor: brand }}>
            <dt>Total</dt><dd className="tabular-nums">{gbp(i.total_pence)}</dd>
          </div>
          {i.paid_pence > 0 && i.status !== 'void' && (
            <>
              <div className="flex justify-between text-slate-600"><dt>Paid</dt><dd className="tabular-nums">−{gbp(i.paid_pence)}</dd></div>
              <div className="flex justify-between font-semibold text-slate-900"><dt>Balance due</dt><dd className="tabular-nums">{gbp(owed)}</dd></div>
            </>
          )}
          {i.status === 'paid' && (
            <div className="mt-2 rounded-md bg-emerald-50 px-3 py-1.5 text-center text-sm font-semibold text-emerald-700">
              Paid in full{payments.length ? ` · ${ukDate(payments[payments.length - 1].paid_at)}` : ''}
            </div>
          )}
        </dl>
      </section>

      {/* footer */}
      <footer className="mt-8 space-y-4 border-t pt-4 text-xs text-slate-600">
        {i.notes && <p className="whitespace-pre-line text-sm text-slate-800">{i.notes}</p>}
        {owed > 0 && s.bank_details && (
          <div>
            <div className="mb-0.5 font-semibold text-slate-800">How to pay</div>
            <p className="whitespace-pre-line">{s.bank_details}</p>
            <p>Please use <b>{i.number}</b> as the payment reference.</p>
          </div>
        )}
        {owed > 0 && s.payment_link_url && (
          <p>Pay online: <a href={s.payment_link_url} className="font-medium underline" style={{ color: brand }}>{s.payment_link_url.replace(/^https?:\/\//, '')}</a></p>
        )}
        {s.terms && <p className="whitespace-pre-line">{s.terms}</p>}
        <p className="text-center text-slate-400">Thank you for your business.</p>
      </footer>
    </article>
  );
}
