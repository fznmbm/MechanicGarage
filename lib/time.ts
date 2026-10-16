const TZ = 'Europe/London';

export const ukToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

export function ukDayRange(d = new Date()) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
  const utcMidnight = new Date(`${ymd}T00:00:00Z`);
  const london = new Date(utcMidnight.toLocaleString('en-US', { timeZone: TZ }));
  const utc = new Date(utcMidnight.toLocaleString('en-US', { timeZone: 'UTC' }));
  const start = new Date(utcMidnight.getTime() - (london.getTime() - utc.getTime()));
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export const ukTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export const ukHour = () =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date()));

// UK date (YYYY-MM-DD) n days from today
export const ukDatePlus = (days: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(Date.now() + days * 86_400_000));

/* ---------- Local (Europe/London) date/time helpers for the diary ---------- */

/** Minutes London is ahead of UTC on a given date (0 in winter, 60 in summer) */
export function londonOffsetMinutes(ymd: string) {
  const d = new Date(`${ymd}T12:00:00Z`);
  const tz = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, timeZoneName: 'shortOffset' })
    .formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = tz.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const mins = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === '-' ? -mins : mins;
}

/** "2026-10-01" + "09:30" (London time) → UTC ISO string */
export function ukLocalToUtcISO(ymd: string, hhmm: string) {
  const [y, mo, d] = ymd.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - londonOffsetMinutes(ymd) * 60_000).toISOString();
}

/** UTC ISO → London date "YYYY-MM-DD" */
export const ukDateOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));

/** UTC ISO → minutes since London midnight */
export function ukMinutesOf(iso: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

export const addDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

export const isYmd = (s?: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** UTC range covering a London calendar day */
export const ukDayBounds = (ymd: string) => ({
  start: ukLocalToUtcISO(ymd, '00:00'),
  end: ukLocalToUtcISO(addDays(ymd, 1), '00:00'),
});

export const hhmm = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

export const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

export const ukLongDate = (ymd: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${ymd}T00:00:00Z`));

/** Current minutes since London midnight */
export const nowUkMinutes = () => ukMinutesOf(new Date().toISOString());

export const isPast = (iso: string) => new Date(iso).getTime() < Date.now();
