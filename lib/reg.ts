// UK registration helpers

/** Uppercase and strip everything except letters and numbers */
export const normaliseReg = (r: string) => r.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Loose check: 2–8 letters/numbers containing at least one of each (covers current, prefix, suffix and dateless plates) */
export const isPlausibleReg = (r: string) =>
  /^[A-Z0-9]{2,8}$/.test(r) && /[A-Z]/.test(r) && /\d/.test(r);

/** Display format: AB12 CDE for current-style plates, otherwise as-is */
export const prettyReg = (r: string) => {
  const n = normaliseReg(r);
  return /^[A-Z]{2}\d{2}[A-Z]{3}$/.test(n) ? `${n.slice(0, 4)} ${n.slice(4)}` : n;
};
