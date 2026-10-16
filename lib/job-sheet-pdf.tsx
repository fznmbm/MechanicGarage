import 'server-only';
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { gbp, ukDate } from './format';
import { prettyReg } from './reg';
import { jobNo } from './jobs';
import { qty } from './invoice';
import { ukTime } from './time';

export type JobSheetData = {
  garage: { name: string; address: string | null; postcode: string | null; phone: string | null; email: string | null; brand_colour: string | null; logo: string | null };
  job: {
    job_number: number; created_at: string; promised_at: string | null; mileage_in: number | null;
    customer_complaint: string | null; mechanic_notes: string | null; mechanic: string | null; bay: string | null;
  };
  vehicle: { registration: string; make: string | null; model: string | null; colour: string | null; vin: string | null; mot_due: string | null; fuel_type: string | null } | null;
  customer: { name: string; phone: string | null; email: string | null } | null;
  lines: { type: string; description: string; quantity: number | string; unit_price_pence: number; part_number: string | null; done: boolean; approval: string }[];
  checks: { item: string; status: string; note: string | null }[];
  signatures: { kind: string; signer_name: string; signed_at: string; statement: string; image: string | null }[];
  showPrices: boolean;
  authorisation: string;
};

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: 'Helvetica', color: '#1e293b', lineHeight: 1.35 },
  row: { flexDirection: 'row' },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  muted: { color: '#64748b' },
  bold: { fontFamily: 'Helvetica-Bold' },
  label: { fontSize: 7, color: '#64748b', fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  box: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 3, padding: 7 },
  th: { color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 7.5, textTransform: 'uppercase', paddingVertical: 4, paddingHorizontal: 5 },
  td: { paddingVertical: 4, paddingHorizontal: 5, borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0' },
  tick: { width: 10, height: 10, borderWidth: 1, borderColor: '#475569', marginRight: 4, alignItems: 'center', justifyContent: 'center' },
  plate: { backgroundColor: '#F7D117', paddingHorizontal: 5, paddingVertical: 1.5, fontFamily: 'Courier-Bold', fontSize: 13, marginRight: 8 },
  writeLine: { borderBottomWidth: 0.75, borderBottomColor: '#94a3b8', height: 16 },
});

const TYPE: Record<string, string> = { labour: 'Labour', part: 'Part', fee: 'Fee' };

function Tick({ on }: { on?: boolean }) {
  return <View style={s.tick}>{on ? <View style={{ width: 6, height: 6, backgroundColor: '#1e293b' }} /> : null}</View>;
}

function Lines({ n }: { n: number }) {
  return <View>{Array.from({ length: n }, (_, i) => <View key={i} style={s.writeLine} />)}</View>;
}

function Field({ label, value, width }: { label: string; value?: string | null; width: string }) {
  return (
    <View style={{ width, marginBottom: 4 }}>
      <Text style={s.label}>{label}</Text>
      <Text>{value || ' '}</Text>
    </View>
  );
}

function JobSheet({ d }: { d: JobSheetData }) {
  const brand = d.garage.brand_colour && /^#[0-9a-fA-F]{6}$/.test(d.garage.brand_colour) ? d.garage.brand_colour : '#1A5BA6';
  const v = d.vehicle;
  const lines = d.lines.filter((l) => l.approval !== 'declined');
  const priced = d.showPrices;
  const w = priced
    ? { done: '7%', type: '10%', desc: '45%', part: '14%', qty: '8%', price: '16%' }
    : { done: '7%', type: '11%', desc: '58%', part: '15%', qty: '9%', price: '0%' };
  const flagged = d.checks.filter((c) => c.status === 'red' || c.status === 'amber');
  const checkIn = d.signatures.find((x) => x.kind === 'check_in');
  const collection = d.signatures.find((x) => x.kind === 'collection');

  return (
    <Document title={`Job sheet ${jobNo(d.job.job_number)}`} author={d.garage.name}>
      <Page size="A4" style={s.page}>
        {/* header */}
        <View style={[s.between, { borderBottomWidth: 3, borderBottomColor: brand, paddingBottom: 10, marginBottom: 10 }]}>
          <View style={s.row}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {d.garage.logo && <Image src={d.garage.logo} style={{ width: 42, height: 42, objectFit: 'contain', marginRight: 10 }} />}
            <View>
              <Text style={[s.bold, { fontSize: 12 }]}>{d.garage.name}</Text>
              <Text style={s.muted}>{[d.garage.address?.replace(/\n/g, ', '), d.garage.postcode].filter(Boolean).join(', ')}</Text>
              <Text style={s.muted}>{[d.garage.phone, d.garage.email].filter(Boolean).join(' · ')}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.bold, { fontSize: 18, color: brand, lineHeight: 1.1, marginBottom: 3 }]}>JOB SHEET</Text>
            <Text style={[s.bold, { fontSize: 13, lineHeight: 1.1 }]}>{jobNo(d.job.job_number)}</Text>
            <Text style={s.muted}>Booked in {ukDate(d.job.created_at)} {ukTime(d.job.created_at)}</Text>
          </View>
        </View>

        {/* vehicle + customer */}
        <View style={[s.row, { gap: 8, marginBottom: 8 }]}>
          <View style={[s.box, { flex: 1.3 }]}>
            <Text style={s.label}>Vehicle</Text>
            <View style={[s.row, { alignItems: 'center', marginBottom: 5 }]}>
              {v && <Text style={s.plate}>{prettyReg(v.registration)}</Text>}
              <Text style={[s.bold, { fontSize: 11 }]}>{v ? [v.make, v.model].filter(Boolean).join(' ') : 'No vehicle'}</Text>
            </View>
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              <Field label="Colour" value={v?.colour} width="33%" />
              <Field label="Fuel" value={v?.fuel_type} width="33%" />
              <Field label="MOT due" value={v?.mot_due ? ukDate(v.mot_due) : null} width="33%" />
              <Field label="VIN" value={v?.vin} width="66%" />
              <Field label="Mileage in" value={d.job.mileage_in != null ? d.job.mileage_in.toLocaleString('en-GB') : null} width="33%" />
            </View>
          </View>
          <View style={[s.box, { flex: 1 }]}>
            <Text style={s.label}>Customer</Text>
            <Text style={[s.bold, { fontSize: 11, marginBottom: 5 }]}>{d.customer?.name ?? '—'}</Text>
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              <Field label="Phone" value={d.customer?.phone} width="100%" />
              <Field label="Promised" value={d.job.promised_at ? `${ukDate(d.job.promised_at)} ${ukTime(d.job.promised_at)}` : null} width="50%" />
              <Field label="Mechanic" value={d.job.mechanic} width="50%" />
              {d.job.bay && <Field label="Bay" value={d.job.bay} width="50%" />}
            </View>
          </View>
        </View>

        {/* request */}
        <View style={[s.box, { marginBottom: 8 }]}>
          <Text style={s.label}>Work requested / customer’s description</Text>
          <Text>{d.job.customer_complaint || ' '}</Text>
        </View>

        {/* work */}
        <View style={[s.row, { backgroundColor: brand }]} fixed>
          <Text style={[s.th, { width: w.done }]}>Done</Text>
          <Text style={[s.th, { width: w.type }]}>Type</Text>
          <Text style={[s.th, { width: w.desc }]}>Work / part</Text>
          <Text style={[s.th, { width: w.part }]}>Part no.</Text>
          <Text style={[s.th, { width: w.qty, textAlign: 'right' }]}>Qty</Text>
          {priced && <Text style={[s.th, { width: w.price, textAlign: 'right' }]}>Price</Text>}
        </View>
        {lines.map((l, i) => (
          <View key={i} style={s.row} wrap={false}>
            <View style={[s.td, { width: w.done }]}><Tick on={l.done} /></View>
            <Text style={[s.td, { width: w.type }]}>{TYPE[l.type] ?? l.type}</Text>
            <Text style={[s.td, { width: w.desc }]}>
              {l.description}
              {l.approval === 'pending' ? <Text style={[s.bold, { color: '#b45309' }]}>  (waiting for customer OK)</Text> : null}
            </Text>
            <Text style={[s.td, { width: w.part }]}>{l.part_number ?? ''}</Text>
            <Text style={[s.td, { width: w.qty, textAlign: 'right' }]}>{qty(l.quantity)}{l.type === 'labour' ? 'h' : ''}</Text>
            {priced && <Text style={[s.td, { width: w.price, textAlign: 'right' }]}>{gbp(Math.round(Number(l.quantity) * l.unit_price_pence))}</Text>}
          </View>
        ))}
        {/* blank rows for extra work written on the floor */}
        {Array.from({ length: Math.max(3, 8 - lines.length) }, (_, i) => (
          <View key={`b${i}`} style={s.row} wrap={false}>
            <View style={[s.td, { width: w.done, height: 18 }]}><Tick /></View>
            <Text style={[s.td, { width: priced ? '93%' : '93%', height: 18 }]}> </Text>
          </View>
        ))}

        {/* health check + notes */}
        <View style={[s.row, { gap: 8, marginTop: 10 }]} wrap={false}>
          <View style={[s.box, { flex: 1 }]}>
            <Text style={s.label}>Health check: needs attention</Text>
            {flagged.length ? flagged.map((c, i) => (
              <Text key={i}>
                <Text style={[s.bold, { color: c.status === 'red' ? '#dc2626' : '#d97706' }]}>{c.status === 'red' ? 'RED' : 'AMBER'}  </Text>
                {c.item}{c.note ? ` – ${c.note}` : ''}
              </Text>
            )) : <Text style={s.muted}>{d.checks.length ? 'Nothing flagged.' : 'Not done yet.'}</Text>}
          </View>
          <View style={[s.box, { flex: 1 }]}>
            <Text style={s.label}>Technician notes / extra work found</Text>
            {d.job.mechanic_notes ? <Text style={{ marginBottom: 3 }}>{d.job.mechanic_notes}</Text> : null}
            <Lines n={d.job.mechanic_notes ? 3 : 5} />
          </View>
        </View>

        {/* sign-off */}
        <View style={[s.box, { marginTop: 8 }]} wrap={false}>
          <View style={[s.row, { flexWrap: 'wrap', alignItems: 'center' }]}>
            <View style={[s.row, { width: '25%', alignItems: 'center' }]}><Tick /><Text>Road test done</Text></View>
            <View style={[s.row, { width: '25%', alignItems: 'center' }]}><Tick /><Text>Wheel nuts torqued</Text></View>
            <View style={[s.row, { width: '25%', alignItems: 'center' }]}><Tick /><Text>Levels checked</Text></View>
            <View style={[s.row, { width: '25%', alignItems: 'center' }]}><Tick /><Text>Car clean / covers off</Text></View>
          </View>
          <View style={[s.row, { marginTop: 10, gap: 12 }]}>
            <View style={{ flex: 1 }}><Text style={s.label}>Mileage out</Text><View style={s.writeLine} /></View>
            <View style={{ flex: 2 }}><Text style={s.label}>Technician signature</Text><View style={s.writeLine} /></View>
            <View style={{ flex: 1 }}><Text style={s.label}>Date</Text><View style={s.writeLine} /></View>
          </View>
        </View>

        <View style={[s.row, { gap: 8, marginTop: 8 }]} wrap={false}>
          <Signature title="Customer authorisation" statement={checkIn?.statement ?? d.authorisation} sig={checkIn} />
          <Signature title="Collected by customer" statement="I have collected the vehicle and been told about the work carried out." sig={collection} />
        </View>

        <Text fixed style={{ position: 'absolute', bottom: 18, left: 32, right: 32, textAlign: 'center', fontSize: 7, color: '#94a3b8' }}
          render={({ pageNumber, totalPages }) => `${d.garage.name} · Job ${jobNo(d.job.job_number)}${v ? ` · ${prettyReg(v.registration)}` : ''}${totalPages > 1 ? ` · Page ${pageNumber} of ${totalPages}` : ''}`} />
      </Page>
    </Document>
  );
}

function Signature({ title, statement, sig }: { title: string; statement: string; sig?: JobSheetData['signatures'][number] }) {
  return (
    <View style={[s.box, { flex: 1 }]}>
      <Text style={s.label}>{title}</Text>
      <Text style={[s.muted, { fontSize: 7.5, marginBottom: 4 }]}>{statement}</Text>
      {sig?.image ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image src={sig.image} style={{ height: 34, objectFit: 'contain', alignSelf: 'flex-start' }} />
      ) : <View style={[s.writeLine, { height: 26 }]} />}
      <View style={[s.between, { marginTop: 3 }]}>
        <Text>{sig ? sig.signer_name : 'Name:'}</Text>
        <Text>{sig ? `${ukDate(sig.signed_at)} ${ukTime(sig.signed_at)}` : 'Date:'}</Text>
      </View>
    </View>
  );
}

export const renderJobSheet = (d: JobSheetData) => renderToBuffer(<JobSheet d={d} />);
