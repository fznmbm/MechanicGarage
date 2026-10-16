import 'server-only';
import { normaliseReg } from './reg';

/* =====================================================================
   Vehicle lookup
   - DVSA MOT History API (primary, free): make, model, colour, fuel,
     engine size, dates, MOT expiry, full MOT history with advisories.
   - DVLA Vehicle Enquiry Service (optional): adds tax status / tax due.
   Each source is used only if its env vars are set.
   ===================================================================== */

export type MotDefect = { text: string; type: string; dangerous?: boolean };

export type MotTest = {
  completedDate: string;          // ISO
  result: 'PASSED' | 'FAILED' | string;
  expiryDate?: string | null;     // YYYY-MM-DD
  odometer?: number | null;
  odometerUnit?: 'mi' | 'km' | null;
  testNumber?: string | null;
  defects: MotDefect[];
};

export type VehicleLookup = {
  registration: string;
  make: string | null;
  model: string | null;
  colour: string | null;
  fuelType: string | null;
  engineSize: number | null;
  yearOfManufacture: number | null;
  firstRegistered: string | null;
  motDue: string | null;
  taxStatus: string | null;
  taxDue: string | null;
  lastMileage: number | null;
  hasOutstandingRecall: boolean | null;
  motTests: MotTest[];
  sources: ('dvsa' | 'dvla')[];
};

export type LookupResult =
  | { ok: true; vehicle: VehicleLookup }
  | { ok: false; code: 'not_configured' | 'not_found' | 'invalid' | 'rate_limited' | 'error'; message: string };

const env = (k: string) => process.env[k]?.trim() || '';

export const dvsaConfigured = () =>
  !!(env('DVSA_CLIENT_ID') && env('DVSA_CLIENT_SECRET') && env('DVSA_API_KEY') && env('DVSA_TOKEN_URL'));
export const dvlaConfigured = () => !!env('DVLA_API_KEY');
export const lookupConfigured = () => dvsaConfigured() || dvlaConfigured();

const title = (s?: string | null) =>
  s ? s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\bBmw\b|\bVw\b|\bMg\b|\bDs\b/g, (m) => m.toUpperCase()) : null;

/* ---------------- DVSA (OAuth2 client credentials) ---------------- */

let tokenCache: { token: string; expires: number } | null = null;

async function dvsaToken(): Promise<string> {
  if (tokenCache && tokenCache.expires > Date.now() + 60_000) return tokenCache.token;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env('DVSA_CLIENT_ID'),
    client_secret: env('DVSA_CLIENT_SECRET'),
    scope: env('DVSA_SCOPE') || 'https://tapi.dvsa.gov.uk/.default',
  });
  const res = await fetch(env('DVSA_TOKEN_URL'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`DVSA token request failed (${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

type DvsaVehicle = {
  registration?: string;
  make?: string;
  model?: string;
  primaryColour?: string;
  fuelType?: string;
  engineSize?: string | number;
  firstUsedDate?: string;
  registrationDate?: string;
  manufactureDate?: string;
  manufactureYear?: string | number;
  motTestDueDate?: string;
  hasOutstandingRecall?: string | boolean;
  motTests?: {
    completedDate: string;
    testResult: string;
    expiryDate?: string;
    odometerValue?: string | number;
    odometerUnit?: string;
    odometerResultType?: string;
    motTestNumber?: string;
    defects?: { text: string; type: string; dangerous?: boolean }[];
  }[];
};

async function fromDvsa(reg: string): Promise<{ status: number; data?: DvsaVehicle }> {
  const call = async () =>
    fetch(`${env('DVSA_API_BASE') || 'https://history.mot.api.gov.uk'}/v1/trade/vehicles/registration/${encodeURIComponent(reg)}`, {
      headers: { Authorization: `Bearer ${await dvsaToken()}`, 'X-API-Key': env('DVSA_API_KEY'), Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
  let res = await call();
  if (res.status === 401) {
    tokenCache = null; // token expired or revoked: retry once with a fresh one
    res = await call();
  }
  if (!res.ok) return { status: res.status };
  return { status: 200, data: (await res.json()) as DvsaVehicle };
}

/* ---------------- DVLA VES (API key) ---------------- */

type DvlaVehicle = {
  make?: string;
  colour?: string;
  fuelType?: string;
  engineCapacity?: number;
  yearOfManufacture?: number;
  monthOfFirstRegistration?: string; // YYYY-MM
  motExpiryDate?: string;
  taxStatus?: string;
  taxDueDate?: string;
};

async function fromDvla(reg: string): Promise<{ status: number; data?: DvlaVehicle }> {
  const res = await fetch('https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles', {
    method: 'POST',
    headers: { 'x-api-key': env('DVLA_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ registrationNumber: reg }),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return { status: res.status };
  return { status: 200, data: (await res.json()) as DvlaVehicle };
}

/* ---------------- Normalise + merge ---------------- */

const dateOnly = (s?: string | null) => (s ? s.slice(0, 10).replace(/\./g, '-') : null);

function mapTests(v?: DvsaVehicle): MotTest[] {
  return (v?.motTests ?? [])
    .map((t) => {
      const odo = t.odometerResultType && t.odometerResultType !== 'READ' ? null : Number(t.odometerValue);
      return {
        completedDate: t.completedDate,
        result: t.testResult,
        expiryDate: dateOnly(t.expiryDate),
        odometer: Number.isFinite(odo) ? (odo as number) : null,
        odometerUnit: t.odometerUnit?.toUpperCase() === 'KM' ? 'km' : t.odometerUnit ? 'mi' : null,
        testNumber: t.motTestNumber ?? null,
        defects: (t.defects ?? []).map((d) => ({ text: d.text, type: d.type, dangerous: !!d.dangerous })),
      } satisfies MotTest;
    })
    .sort((a, b) => b.completedDate.localeCompare(a.completedDate));
}

export async function lookupVehicle(input: string): Promise<LookupResult> {
  const reg = normaliseReg(input);
  if (!reg) return { ok: false, code: 'invalid', message: 'Enter a registration' };
  if (!lookupConfigured()) {
    return { ok: false, code: 'not_configured', message: 'Registration lookup is not set up yet. Enter the details manually.' };
  }

  const [dvsa, dvla] = await Promise.all([
    dvsaConfigured() ? fromDvsa(reg).catch(() => ({ status: 500 })) : Promise.resolve(null),
    dvlaConfigured() ? fromDvla(reg).catch(() => ({ status: 500 })) : Promise.resolve(null),
  ]);

  const a = dvsa && 'data' in dvsa ? dvsa.data : undefined;
  const b = dvla && 'data' in dvla ? dvla.data : undefined;

  if (!a && !b) {
    const statuses = [dvsa?.status, dvla?.status].filter(Boolean) as number[];
    if (statuses.includes(429)) return { ok: false, code: 'rate_limited', message: 'Too many lookups right now. Try again in a minute.' };
    if (statuses.length && statuses.every((s) => s === 404 || s === 400)) {
      return { ok: false, code: 'not_found', message: `No vehicle found for ${reg}. Check the registration or enter details manually.` };
    }
    return { ok: false, code: 'error', message: 'The vehicle lookup service is not responding. Enter the details manually.' };
  }

  const tests = mapTests(a);
  const latestExpiry = tests.map((t) => t.expiryDate).filter(Boolean).sort().at(-1) ?? null;
  const lastReading = tests.find((t) => t.odometer != null);
  const year =
    Number(a?.manufactureYear) ||
    Number(a?.manufactureDate?.slice(0, 4)) ||
    b?.yearOfManufacture ||
    null;
  const recall = a?.hasOutstandingRecall;

  return {
    ok: true,
    vehicle: {
      registration: reg,
      make: title(a?.make ?? b?.make),
      model: title(a?.model) ?? null,
      colour: title(a?.primaryColour ?? b?.colour),
      fuelType: title(a?.fuelType ?? b?.fuelType),
      engineSize: Number(a?.engineSize) || b?.engineCapacity || null,
      yearOfManufacture: year,
      firstRegistered:
        dateOnly(a?.registrationDate ?? a?.firstUsedDate) ??
        (b?.monthOfFirstRegistration ? `${b.monthOfFirstRegistration}-01` : null),
      motDue: latestExpiry ?? dateOnly(a?.motTestDueDate) ?? dateOnly(b?.motExpiryDate),
      taxStatus: b?.taxStatus ?? null,
      taxDue: dateOnly(b?.taxDueDate),
      lastMileage: lastReading?.odometerUnit === 'mi' ? lastReading.odometer ?? null : null,
      hasOutstandingRecall: recall === undefined ? null : recall === true || String(recall).toLowerCase() === 'yes',
      motTests: tests,
      sources: [a ? 'dvsa' : null, b ? 'dvla' : null].filter(Boolean) as ('dvsa' | 'dvla')[],
    },
  };
}
