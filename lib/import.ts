// Turning a spreadsheet export from another garage system into customer and vehicle rows.

import { isPlausibleReg, normaliseReg } from './reg';
import { formatPostcode } from './validate';

export type FieldKey =
  | 'name' | 'title' | 'first_name' | 'last_name' | 'mobile' | 'phone' | 'email'
  | 'address' | 'address2' | 'town' | 'county' | 'postcode' | 'customer_notes' | 'consent'
  | 'registration' | 'make' | 'model' | 'colour' | 'fuel_type' | 'year' | 'vin'
  | 'mot_due' | 'service_due' | 'mileage' | 'vehicle_notes';

export const FIELD_GROUPS: { label: string; fields: { key: FieldKey; label: string; aliases: string[] }[] }[] = [
  {
    label: 'Customer',
    fields: [
      { key: 'name', label: 'Full name', aliases: ['name', 'fullname', 'customer', 'customername', 'contact', 'contactname', 'client', 'clientname', 'owner', 'ownername', 'accountname'] },
      { key: 'title', label: 'Title', aliases: ['title', 'salutation'] },
      { key: 'first_name', label: 'First name', aliases: ['firstname', 'forename', 'forenames', 'givenname', 'first'] },
      { key: 'last_name', label: 'Last name', aliases: ['lastname', 'surname', 'familyname', 'last'] },
      { key: 'mobile', label: 'Mobile', aliases: ['mobile', 'mobilephone', 'mobileno', 'mobilenumber', 'mob', 'cell', 'cellphone'] },
      { key: 'phone', label: 'Phone', aliases: ['phone', 'telephone', 'tel', 'phonenumber', 'telno', 'telephonenumber', 'homephone', 'workphone', 'landline', 'contactnumber'] },
      { key: 'email', label: 'Email', aliases: ['email', 'emailaddress', 'e-mail', 'mail'] },
      { key: 'address', label: 'Address (line 1)', aliases: ['address', 'address1', 'addressline1', 'street', 'streetaddress', 'line1', 'add1'] },
      { key: 'address2', label: 'Address line 2', aliases: ['address2', 'addressline2', 'line2', 'add2', 'locality'] },
      { key: 'town', label: 'Town / city', aliases: ['town', 'city', 'towncity', 'posttown', 'address3', 'addressline3'] },
      { key: 'county', label: 'County', aliases: ['county', 'region', 'address4', 'addressline4'] },
      { key: 'postcode', label: 'Postcode', aliases: ['postcode', 'postalcode', 'zip', 'zipcode', 'pcode'] },
      { key: 'customer_notes', label: 'Customer notes', aliases: ['customernotes', 'customercomments', 'accountnotes'] },
      { key: 'consent', label: 'Reminder consent (yes/no)', aliases: ['consent', 'reminderconsent', 'marketingconsent', 'optin', 'remindersoptin', 'gdprconsent', 'contactconsent'] },
    ],
  },
  {
    label: 'Vehicle',
    fields: [
      { key: 'registration', label: 'Registration', aliases: ['registration', 'reg', 'regno', 'regnumber', 'registrationnumber', 'registrationno', 'vrm', 'vehiclereg', 'numberplate', 'plate'] },
      { key: 'make', label: 'Make', aliases: ['make', 'manufacturer', 'vehiclemake'] },
      { key: 'model', label: 'Model', aliases: ['model', 'vehiclemodel', 'derivative'] },
      { key: 'colour', label: 'Colour', aliases: ['colour', 'color', 'vehiclecolour'] },
      { key: 'fuel_type', label: 'Fuel', aliases: ['fuel', 'fueltype'] },
      { key: 'year', label: 'Year', aliases: ['year', 'yearofmanufacture', 'yom', 'modelyear', 'manufactureyear'] },
      { key: 'vin', label: 'VIN', aliases: ['vin', 'chassis', 'chassisno', 'chassisnumber', 'vinnumber'] },
      { key: 'mot_due', label: 'MOT due date', aliases: ['motdue', 'motduedate', 'motexpiry', 'motexpirydate', 'motexpires', 'motdate', 'mot', 'nextmot', 'motrenewal'] },
      { key: 'service_due', label: 'Service due date', aliases: ['servicedue', 'serviceduedate', 'nextservice', 'nextservicedue', 'servicedate'] },
      { key: 'mileage', label: 'Mileage', aliases: ['mileage', 'miles', 'odometer', 'lastmileage', 'currentmileage', 'odo'] },
      { key: 'vehicle_notes', label: 'Vehicle notes', aliases: ['notes', 'vehiclenotes', 'comments', 'note'] },
    ],
  },
];

export const ALL_FIELDS = FIELD_GROUPS.flatMap((g) => g.fields);
export type Mapping = Partial<Record<FieldKey, number>>;

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-/g, '');

/** Match column headings to fields by name. Each column is used once. */
export function autoMap(headers: string[]): Mapping {
  const map: Mapping = {};
  const used = new Set<number>();
  const keys = headers.map(norm);
  for (const f of ALL_FIELDS) {
    const aliases = f.aliases.map((a) => a.replace(/-/g, ''));
    const i = keys.findIndex((k, idx) => !used.has(idx) && aliases.includes(k));
    if (i >= 0) { map[f.key] = i; used.add(i); }
  }
  return map;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');

function makeDate(y: number, m: number, d: number) {
  if (y < 100) y += y < 70 ? 2000 : 1900;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (y < 1950 || y > 2100) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** UK-style dates: 31/12/2026, 31-12-26, 31.12.2026, 2026-12-31, 31 Dec 2026, 31-Dec-26, Excel serial numbers. Returns yyyy-mm-dd or null. */
export function parseUkDate(raw: string): string | null {
  const s = raw.trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?$/, '');
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(T.*)?$/);
  if (m) return makeDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) return makeDate(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-/]+([a-z]{3})[a-z]*\.?[\s-/,]+(\d{2}|\d{4})$/i);
  if (m) {
    const mon = MONTHS.indexOf(m[2].toLowerCase());
    return mon < 0 ? null : makeDate(+m[3], mon + 1, +m[1]);
  }
  m = s.match(/^\d{5}$/);
  if (m) {
    const serial = +s;
    if (serial < 18264 || serial > 73051) return null; // 1950–2100
    const dt = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }
  return null;
}

export function parseYesNo(raw: string): boolean {
  return /^(y|yes|true|1|opt[\s-]?in|opted[\s-]?in|agreed|x)$/i.test(raw.trim());
}

export type ImportRow = {
  line: number;
  name?: string; phone?: string; email?: string; address?: string; postcode?: string; customer_notes?: string; consent?: boolean;
  registration?: string; make?: string; model?: string; colour?: string; fuel_type?: string;
  year?: number; vin?: string; mot_due?: string; service_due?: string; mileage?: number; vehicle_notes?: string;
};

export type RowIssue = { line: number; message: string };

/** "JOHN SMITH" / "john smith" → "John Smith"; words already in mixed case are left alone */
const titleCase = (s: string) =>
  s.split(' ').map((w) =>
    w === w.toUpperCase() || w === w.toLowerCase()
      ? w.toLowerCase().replace(/(^|['-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
      : w).join(' ');

/** Build import rows from parsed CSV data rows (header removed). firstLine is the spreadsheet row number of rows[0]. */
export function buildRows(rows: string[][], map: Mapping, firstLine = 2) {
  const out: ImportRow[] = [];
  const issues: RowIssue[] = [];
  const thisYear = new Date().getFullYear();

  rows.forEach((cells, idx) => {
    const line = firstLine + idx;
    const get = (k: FieldKey) => (map[k] == null ? '' : (cells[map[k]!] ?? '').trim());
    const r: ImportRow = { line };

    const name = get('name') || [get('title'), get('first_name'), get('last_name')].filter(Boolean).join(' ');
    if (name) r.name = titleCase(name.replace(/\s+/g, ' '));

    const phone = get('mobile') || get('phone');
    if (phone) r.phone = phone;
    const email = get('email').toLowerCase();
    if (email) {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) r.email = email;
      else issues.push({ line, message: `Email "${email}" not valid, left blank` });
    }
    const address = [get('address'), get('address2'), get('town'), get('county')].filter(Boolean).join(', ');
    if (address) r.address = address;
    const pc = get('postcode');
    if (pc) r.postcode = formatPostcode(pc);
    if (get('customer_notes')) r.customer_notes = get('customer_notes');
    if (map.consent != null) r.consent = parseYesNo(get('consent'));

    const regRaw = get('registration');
    if (regRaw) {
      const reg = normaliseReg(regRaw);
      if (isPlausibleReg(reg)) r.registration = reg;
      else issues.push({ line, message: `Registration "${regRaw}" not recognised, vehicle skipped` });
    }
    for (const k of ['make', 'model', 'colour', 'fuel_type', 'vehicle_notes'] as const) {
      const v = get(k);
      if (v) r[k] = k === 'colour' ? titleCase(v) : v;
    }
    const vin = get('vin').replace(/\s/g, '').toUpperCase();
    if (vin) r.vin = vin;
    const year = parseInt(get('year').slice(0, 4), 10);
    if (year >= 1900 && year <= thisYear + 1) r.year = year;

    for (const k of ['mot_due', 'service_due'] as const) {
      const raw = get(k);
      if (!raw) continue;
      const d = parseUkDate(raw);
      if (d) r[k] = d;
      else issues.push({ line, message: `${k === 'mot_due' ? 'MOT' : 'Service'} date "${raw}" not recognised, left blank` });
    }
    const miles = parseInt(get('mileage').replace(/[,\s]|miles?|mi/gi, ''), 10);
    if (Number.isFinite(miles) && miles > 0 && miles < 2_000_000) r.mileage = miles;

    if (r.name || r.phone || r.email || r.registration) out.push(r);
  });

  return { rows: out, issues };
}
