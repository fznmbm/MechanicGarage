export const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
export const orNull = (v: string) => (v === '' ? null : v);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/;

export function formatPostcode(p: string) {
  const u = p.toUpperCase().replace(/\s+/g, '');
  return u.length > 3 ? `${u.slice(0, -3)} ${u.slice(-3)}` : u;
}

/** Validates customer fields from a form, using an optional prefix (e.g. "new_") */
export function readCustomer(fd: FormData, prefix = '') {
  const name = str(fd, `${prefix}name`);
  const phone = str(fd, `${prefix}phone`);
  const email = str(fd, `${prefix}email`).toLowerCase();
  const postcode = str(fd, `${prefix}postcode`).toUpperCase();
  const errors: Record<string, string> = {};

  if (!name) errors[`${prefix}name`] = 'Name is required';
  else if (name.length > 100) errors[`${prefix}name`] = 'Keep it under 100 characters';
  if (phone && !/^\+?[\d\s()-]{7,20}$/.test(phone)) errors[`${prefix}phone`] = 'Enter a valid phone number';
  if (email && !EMAIL.test(email)) errors[`${prefix}email`] = 'Enter a valid email address';
  if (postcode && !POSTCODE.test(postcode)) errors[`${prefix}postcode`] = 'Enter a valid UK postcode';
  if (!phone && !email) errors[`${prefix}phone`] = 'Add a phone number or email so you can contact them';

  const consent = fd.get(`${prefix}reminder_consent`) === 'on';
  return {
    errors,
    row: {
      name,
      phone: orNull(phone),
      email: orNull(email),
      address: orNull(str(fd, `${prefix}address`)),
      postcode: postcode ? formatPostcode(postcode) : null,
      notes: orNull(str(fd, `${prefix}notes`)),
      reminder_consent: consent,
    },
  };
}
