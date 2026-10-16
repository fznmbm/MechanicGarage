import 'server-only';
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { gbp, ukDate } from './format';
import { prettyReg } from './reg';
import { jobNo } from './jobs';
import { PAY_METHODS, balance, brandOf, fullyCredited, qty, vatSummary, type InvoiceDoc } from './invoice';

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 9.5, fontFamily: 'Helvetica', color: '#1e293b', lineHeight: 1.4 },
  row: { flexDirection: 'row' },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  muted: { color: '#64748b' },
  bold: { fontFamily: 'Helvetica-Bold' },
  h1: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  label: { fontSize: 7.5, color: '#64748b', fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  th: { color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 8, textTransform: 'uppercase', paddingVertical: 5, paddingHorizontal: 6 },
  td: { paddingVertical: 5, paddingHorizontal: 6 },
  plate: { backgroundColor: '#F7D117', paddingHorizontal: 4, paddingVertical: 1, fontFamily: 'Courier-Bold', fontSize: 9, marginRight: 6 },
});

const col = { desc: '52%', qty: '10%', unit: '14%', vat: '10%', amt: '14%' };

function InvoicePdf({ doc, logo }: { doc: InvoiceDoc; logo: string | null }) {
  const { invoice: i, lines, payments } = doc;
  const sel = i.seller, b = i.buyer, v = i.vehicle;
  const brand = brandOf(sel);
  const vat = i.is_vat_invoice;
  const credit = doc.kind === 'credit';
  const owed = credit ? 0 : balance(i);
  const credited = i.credited_pence ?? 0;
  const label = credit ? 'Credit note' : 'Invoice';
  const summary = vat ? vatSummary(lines) : [];
  const w = vat ? col : { ...col, desc: '62%' };

  return (
    <Document title={`${label} ${i.number}`} author={sel.name}>
      <Page size="A4" style={s.page}>
        {i.status === 'void' && (
          <Text fixed style={{ position: 'absolute', top: 330, left: 150, fontSize: 90, color: '#ef4444', opacity: 0.25, transform: 'rotate(-20deg)', fontFamily: 'Helvetica-Bold' }}>VOID</Text>
        )}

        {/* header */}
        <View style={[s.between, { borderBottomWidth: 3, borderBottomColor: brand, paddingBottom: 14 }]}>
          <View style={s.row}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {logo && <Image src={logo} style={{ width: 52, height: 52, objectFit: 'contain', marginRight: 12 }} />}
            <View>
              <Text style={[s.bold, { fontSize: 13 }]}>{sel.name}</Text>
              {sel.address && <Text style={s.muted}>{sel.address}</Text>}
              {sel.postcode && <Text style={s.muted}>{sel.postcode}</Text>}
              <Text style={s.muted}>{[sel.phone, sel.email].filter(Boolean).join(' · ')}</Text>
              {sel.website && <Text style={s.muted}>{sel.website.replace(/^https?:\/\//, '')}</Text>}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.h1, { color: brand }]}>{credit ? (vat ? 'VAT CREDIT NOTE' : 'CREDIT NOTE') : vat ? 'VAT INVOICE' : 'INVOICE'}</Text>
            <View style={{ marginTop: 6, alignItems: 'flex-end' }}>
              <Text><Text style={s.muted}>{label} no.  </Text><Text style={s.bold}>{i.number}</Text></Text>
              <Text><Text style={s.muted}>Date{vat ? ' / tax point' : ''}  </Text>{ukDate(i.issued_at)}</Text>
              {credit && doc.against && <Text><Text style={s.muted}>Against invoice  </Text>{doc.against.number} of {ukDate(doc.against.issued_at)}</Text>}
              {!credit && i.due_at && <Text><Text style={s.muted}>Due  </Text>{i.due_at === i.issued_at ? 'On receipt' : ukDate(i.due_at)}</Text>}
              {vat && sel.vat_number && <Text><Text style={s.muted}>VAT reg. no.  </Text>{sel.vat_number}</Text>}
            </View>
          </View>
        </View>

        {/* parties */}
        <View style={[s.between, { paddingVertical: 14 }]}>
          <View style={{ width: '50%' }}>
            <Text style={s.label}>{credit ? 'Customer' : 'Bill to'}</Text>
            <Text style={s.bold}>{b.name ?? 'Customer'}</Text>
            {b.address && <Text style={s.muted}>{b.address}</Text>}
            {b.postcode && <Text style={s.muted}>{b.postcode}</Text>}
            {(b.phone || b.email) && <Text style={s.muted}>{[b.phone, b.email].filter(Boolean).join(' · ')}</Text>}
          </View>
          {v.registration && (
            <View style={{ width: '45%', alignItems: 'flex-end' }}>
              <Text style={s.label}>Vehicle</Text>
              <View style={[s.row, { alignItems: 'center' }]}>
                <Text style={s.plate}>{prettyReg(v.registration)}</Text>
                <Text style={s.bold}>{[v.make, v.model].filter(Boolean).join(' ')}</Text>
              </View>
              <Text style={s.muted}>
                {[v.mileage != null ? `Mileage ${v.mileage.toLocaleString('en-GB')}` : null, v.job_number ? `Job ${jobNo(v.job_number)}` : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
          )}
        </View>

        {/* lines */}
        <View style={[s.row, { backgroundColor: brand }]} fixed>
          <Text style={[s.th, { width: w.desc }]}>Description</Text>
          <Text style={[s.th, { width: w.qty, textAlign: 'right' }]}>Qty</Text>
          <Text style={[s.th, { width: w.unit, textAlign: 'right' }]}>Unit{vat ? ' ex VAT' : ''}</Text>
          {vat && <Text style={[s.th, { width: w.vat, textAlign: 'right' }]}>VAT</Text>}
          <Text style={[s.th, { width: w.amt, textAlign: 'right' }]}>Amount</Text>
        </View>
        {lines.map((l, idx) => (
          <View key={l.id} style={[s.row, { backgroundColor: idx % 2 ? '#f8fafc' : '#ffffff' }]} wrap={false}>
            <Text style={[s.td, { width: w.desc }]}>
              {l.description}
              {l.part_number ? <Text style={s.muted}>  {l.part_number}</Text> : null}
              {l.type === 'labour' ? <Text style={s.muted}>  (labour, hrs)</Text> : null}
            </Text>
            <Text style={[s.td, { width: w.qty, textAlign: 'right' }]}>{qty(l.quantity)}</Text>
            <Text style={[s.td, { width: w.unit, textAlign: 'right' }]}>{gbp(l.unit_price_pence)}</Text>
            {vat && <Text style={[s.td, { width: w.vat, textAlign: 'right' }]}>{Number(l.vat_rate) > 0 ? `${Number(l.vat_rate)}%` : 'O/S'}</Text>}
            <Text style={[s.td, s.bold, { width: w.amt, textAlign: 'right' }]}>{gbp(l.line_total_pence)}</Text>
          </View>
        ))}

        {/* totals */}
        <View style={[s.between, { marginTop: 12 }]} wrap={false}>
          <View style={{ width: '50%' }}>
            {vat && summary.length > 1 && summary.map((r) => (
              <Text key={r.rate} style={[s.muted, { fontSize: 8 }]}>
                {r.rate > 0 ? `VAT ${r.rate}%` : 'Outside scope'}: net {gbp(r.net)}, VAT {gbp(Math.round((r.net * r.rate) / 100))}
              </Text>
            ))}
            {vat && lines.some((l) => Number(l.vat_rate) === 0) && (
              <Text style={[s.muted, { fontSize: 8, marginTop: 2 }]}>O/S = outside the scope of VAT (e.g. statutory MOT test fee).</Text>
            )}
          </View>
          <View style={{ width: '38%' }}>
            <View style={s.between}><Text style={s.muted}>{vat ? 'Subtotal (ex VAT)' : 'Subtotal'}</Text><Text>{gbp(i.subtotal_pence)}</Text></View>
            {vat && <View style={s.between}><Text style={s.muted}>VAT</Text><Text>{gbp(i.vat_pence)}</Text></View>}
            <View style={[s.between, { borderTopWidth: 2, borderTopColor: brand, marginTop: 3, paddingTop: 3 }]}>
              <Text style={[s.bold, { fontSize: 12 }]}>{credit ? 'Total credited' : 'Total'}</Text><Text style={[s.bold, { fontSize: 12 }]}>{gbp(i.total_pence)}</Text>
            </View>
            {credit && doc.refund && doc.refund.amount_pence > 0 && (
              <View style={s.between}>
                <Text style={s.muted}>Refunded{doc.refund.method ? ` by ${(PAY_METHODS[doc.refund.method] ?? doc.refund.method).toLowerCase()}` : ''}</Text>
                <Text>{gbp(doc.refund.amount_pence)}</Text>
              </View>
            )}
            {!credit && (i.paid_pence !== 0 || credited > 0) && i.status !== 'void' && (
              <>
                {i.paid_pence !== 0 && <View style={s.between}><Text style={s.muted}>Paid</Text><Text>-{gbp(i.paid_pence)}</Text></View>}
                {credited > 0 && <View style={s.between}><Text style={s.muted}>Credit notes</Text><Text>-{gbp(credited)}</Text></View>}
                <View style={s.between}><Text style={s.bold}>Balance due</Text><Text style={s.bold}>{gbp(owed)}</Text></View>
              </>
            )}
            {!credit && fullyCredited(i) && i.status !== 'void' && (
              <Text style={{ marginTop: 6, backgroundColor: '#f1f5f9', color: '#475569', textAlign: 'center', paddingVertical: 4, fontFamily: 'Helvetica-Bold' }}>
                CANCELLED BY CREDIT NOTE
              </Text>
            )}
            {!credit && !fullyCredited(i) && i.status === 'paid' && owed === 0 && (
              <Text style={{ marginTop: 6, backgroundColor: '#ecfdf5', color: '#047857', textAlign: 'center', paddingVertical: 4, fontFamily: 'Helvetica-Bold' }}>
                PAID IN FULL{payments.length ? ` · ${ukDate(payments[payments.length - 1].paid_at)}` : ''}
              </Text>
            )}
          </View>
        </View>

        {/* footer */}
        <View style={{ marginTop: 22, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 10 }} wrap={false}>
          {i.notes && <Text style={{ marginBottom: 8 }}>{credit ? <Text style={s.bold}>Reason: </Text> : null}{i.notes}</Text>}
          {owed > 0 && sel.bank_details && (
            <View style={{ marginBottom: 8 }}>
              <Text style={s.bold}>How to pay</Text>
              <Text style={s.muted}>{sel.bank_details}</Text>
              <Text style={s.muted}>Please use {i.number} as the payment reference.</Text>
            </View>
          )}
          {owed > 0 && sel.payment_link_url && <Text style={{ marginBottom: 8 }}>Pay online: {sel.payment_link_url}</Text>}
          {sel.terms && <Text style={[s.muted, { fontSize: 8 }]}>{sel.terms}</Text>}
        </View>

        <Text fixed style={{ position: 'absolute', bottom: 22, left: 40, right: 40, textAlign: 'center', fontSize: 7.5, color: '#94a3b8' }}
          render={({ pageNumber, totalPages }) => `${sel.name} · ${label} ${i.number}${totalPages > 1 ? ` · Page ${pageNumber} of ${totalPages}` : ''}`} />
      </Page>
    </Document>
  );
}

/** Fetch the logo as a data URI (skipped if it fails, so the PDF always renders) */
export async function loadLogo(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? 'image/png';
    if (!/image\/(png|jpe?g)/.test(type)) return null; // react-pdf supports PNG/JPG only
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  } catch {
    return null;
  }
}

export async function renderInvoicePdf(doc: InvoiceDoc): Promise<Buffer> {
  const logo = await loadLogo(doc.invoice.seller.logo_url);
  return renderToBuffer(<InvoicePdf doc={doc} logo={logo} />);
}

export const pdfFilename = (doc: InvoiceDoc) =>
  `${doc.kind === 'credit' ? 'CreditNote' : 'Invoice'}-${doc.invoice.number}${doc.invoice.vehicle.registration ? `-${doc.invoice.vehicle.registration}` : ''}.pdf`.replace(/[^\w.-]/g, '');
