"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/tenant";
import type { ActionState } from "@/lib/types";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const orNull = (v: string) => (v === "" ? null : v);
const done = (message: string): ActionState => ({
  ok: true,
  message,
  ts: Date.now(),
});
const fail = (
  errors: Record<string, string>,
  message = "Please fix the highlighted fields",
): ActionState => ({ ok: false, message, errors, ts: Date.now() });

const DENIED: ActionState = {
  ok: false,
  message: "Only the garage owner can change settings",
};

async function ownerContext() {
  const m = await getMembership();
  if (!m || m.role !== "owner") return null;
  return { m, sb: await createClient() };
}

async function save(
  patch: Record<string, unknown>,
  message: string,
): Promise<ActionState> {
  const ctx = await ownerContext();
  if (!ctx) return { ...DENIED, ts: Date.now() };
  const { m, sb } = ctx;
  const { error } = await sb
    .from("garages")
    .update(patch)
    .eq("id", m.garage_id);
  if (error) return { ok: false, message: error.message, ts: Date.now() };
  revalidatePath("/", "layout");
  return done(message);
}

/* ---------------- Business details ---------------- */
export async function saveBusiness(
  _: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const name = str(fd, "name");
  const email = str(fd, "email");
  const postcode = str(fd, "postcode").toUpperCase();
  let website = str(fd, "website");
  const errors: Record<string, string> = {};

  if (!name) errors.name = "Garage name is required";
  else if (name.length > 80) errors.name = "Keep it under 80 characters";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = "Enter a valid email address";
  if (postcode && !/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/.test(postcode))
    errors.postcode = "Enter a valid UK postcode";
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  if (Object.keys(errors).length) return fail(errors);

  return save(
    {
      name,
      address: orNull(str(fd, "address")),
      postcode: orNull(postcode.replace(/^(.+?)\s*(\d[A-Z]{2})$/, "$1 $2")),
      phone: orNull(str(fd, "phone")),
      email: orNull(email.toLowerCase()),
      website: orNull(website),
    },
    "Business details saved",
  );
}

/* ---------------- Branding ---------------- */
const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function saveBranding(
  _: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await ownerContext();
  if (!ctx) return { ...DENIED, ts: Date.now() };
  const { m, sb } = ctx;
  const colour = str(fd, "brand_colour");
  const removeLogo = fd.get("remove_logo") === "1";
  const file = fd.get("logo");
  const errors: Record<string, string> = {};

  if (colour && !/^#[0-9a-fA-F]{6}$/.test(colour))
    errors.brand_colour = "Pick a valid colour";

  const hasFile = file instanceof File && file.size > 0;
  if (hasFile) {
    if (!LOGO_TYPES[file.type])
      errors.logo = "Logo must be a PNG, JPG or WebP image";
    else if (file.size > 1024 * 1024)
      errors.logo = "Logo must be 1 MB or smaller";
  }
  if (Object.keys(errors).length) return fail(errors);

  const patch: Record<string, unknown> = {
    brand_colour: colour ? colour.toUpperCase() : null,
  };
  const bucket = sb.storage.from("garage-logos");

  // Clear out any previous logo files for this garage
  const clearOld = async () => {
    const { data } = await bucket.list(m.garage_id);
    if (data?.length)
      await bucket.remove(data.map((f) => `${m.garage_id}/${f.name}`));
  };

  if (hasFile) {
    await clearOld();
    const path = `${m.garage_id}/logo-${Date.now()}.${LOGO_TYPES[file.type]}`;
    const { error } = await bucket.upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
    });
    if (error)
      return {
        ok: false,
        message: `Logo upload failed: ${error.message}`,
        ts: Date.now(),
      };
    patch.logo_url = bucket.getPublicUrl(path).data.publicUrl;
  } else if (removeLogo) {
    await clearOld();
    patch.logo_url = null;
  }

  const { error } = await sb
    .from("garages")
    .update(patch)
    .eq("id", m.garage_id);
  if (error) return { ok: false, message: error.message, ts: Date.now() };
  revalidatePath("/", "layout");
  return done("Branding saved");
}

/* ---------------- Workshop (labour rate + bays) ---------------- */
export async function saveWorkshop(
  _: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await ownerContext();
  if (!ctx) return { ...DENIED, ts: Date.now() };
  const { m, sb } = ctx;
  const rate = Number(str(fd, "labour_rate"));
  const open = str(fd, "opening_time");
  const close = str(fd, "closing_time");
  const ids = fd.getAll("bay_id").map(String);
  const names = fd.getAll("bay_name").map((n) => String(n).trim());
  const errors: Record<string, string> = {};

  if (!Number.isFinite(rate) || rate < 0 || rate > 1000)
    errors.labour_rate = "Enter an hourly rate between £0 and £1,000";
  if (!/^\d{2}:\d{2}$/.test(open)) errors.opening_time = "Pick an opening time";
  if (!/^\d{2}:\d{2}$/.test(close)) errors.closing_time = "Pick a closing time";
  else if (open && close <= open)
    errors.closing_time = "Closing time must be after opening time";
  const openDays = fd
    .getAll("open_days")
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  if (openDays.length === 0) errors.open_days = "Choose at least one open day";
  if (names.length === 0) errors.bays = "Add at least one bay";
  else if (names.some((n) => !n)) errors.bays = "Every bay needs a name";
  else if (new Set(names.map((n) => n.toLowerCase())).size !== names.length)
    errors.bays = "Bay names must be different";
  if (Object.keys(errors).length) return fail(errors);

  const { error: rateErr } = await sb
    .from("garages")
    .update({
      labour_rate_pence: Math.round(rate * 100),
      opening_time: open,
      closing_time: close,
      open_days: openDays,
    })
    .eq("id", m.garage_id);
  if (rateErr) return { ok: false, message: rateErr.message, ts: Date.now() };

  // Sync bays: delete removed, update existing, insert new
  const { data: existing } = await sb
    .from("bays")
    .select("id")
    .eq("garage_id", m.garage_id);
  const keep = new Set(ids.filter(Boolean));
  const toDelete = (existing ?? [])
    .map((b) => b.id)
    .filter((id) => !keep.has(id));
  if (toDelete.length) {
    const { error } = await sb
      .from("bays")
      .delete()
      .in("id", toDelete)
      .eq("garage_id", m.garage_id);
    if (error) return { ok: false, message: error.message, ts: Date.now() };
  }
  for (let i = 0; i < names.length; i++) {
    const row = { garage_id: m.garage_id, name: names[i], sort_order: i + 1 };
    const { error } = ids[i]
      ? await sb
          .from("bays")
          .update(row)
          .eq("id", ids[i])
          .eq("garage_id", m.garage_id)
      : await sb.from("bays").insert(row);
    if (error) return { ok: false, message: error.message, ts: Date.now() };
  }

  revalidatePath("/settings");
  return done("Workshop settings saved");
}

/* ---------------- Invoicing ---------------- */
export async function saveInvoicing(
  _: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await ownerContext();
  if (!ctx) return { ...DENIED, ts: Date.now() };
  const { m, sb } = ctx;
  const prefix = str(fd, "invoice_prefix").toUpperCase();
  const next = Number(str(fd, "next_invoice_number"));
  const terms = Number(str(fd, "payment_terms_days"));
  const text = str(fd, "invoice_terms");
  const errors: Record<string, string> = {};

  const { data: g } = await sb
    .from("garages")
    .select("next_invoice_number")
    .eq("id", m.garage_id)
    .single();

  if (!/^[A-Z0-9\-/]{0,10}$/.test(prefix))
    errors.invoice_prefix = "Up to 10 letters, numbers, - or /";
  if (!Number.isInteger(next) || next < 1)
    errors.next_invoice_number = "Must be a whole number of 1 or more";
  else if (g && next < g.next_invoice_number)
    errors.next_invoice_number = `Can't go lower than ${g.next_invoice_number}, or invoice numbers would repeat`;
  if (!Number.isInteger(terms) || terms < 0 || terms > 120)
    errors.payment_terms_days = "Between 0 and 120 days";
  if (text.length > 2000)
    errors.invoice_terms = "Keep it under 2,000 characters";
  const bank = str(fd, "bank_details");
  if (bank.length > 500) errors.bank_details = "Keep it under 500 characters";
  let payLink = str(fd, "payment_link_url");
  if (payLink && !/^https?:\/\//i.test(payLink)) payLink = `https://${payLink}`;
  if (payLink && !/^https:\/\/[^\s]+\.[^\s]+$/i.test(payLink))
    errors.payment_link_url = "Enter a secure link starting with https://";
  if (Object.keys(errors).length) return fail(errors);

  return save(
    {
      invoice_prefix: prefix,
      next_invoice_number: next,
      payment_terms_days: terms,
      invoice_terms: orNull(text),
      bank_details: orNull(bank),
      payment_link_url: orNull(payLink),
    },
    "Invoice settings saved",
  );
}

/* ---------------- VAT ---------------- */
export async function saveVat(
  _: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const on = fd.get("vat_registered") === "on";
  const errors: Record<string, string> = {};

  if (!on)
    return save(
      { vat_registered: false },
      "VAT turned off. New invoices will not include VAT",
    );

  const raw = str(fd, "vat_number")
    .toUpperCase()
    .replace(/[\s.-]/g, "")
    .replace(/^GB/, "");
  const from = str(fd, "vat_effective_from");
  const rate = Number(str(fd, "default_vat_rate"));

  if (!/^(\d{9}|\d{12})$/.test(raw))
    errors.vat_number = "UK VAT numbers are GB followed by 9 digits";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || Number.isNaN(Date.parse(from)))
    errors.vat_effective_from = "Pick the date your VAT registration starts";
  if (!Number.isFinite(rate) || rate < 0 || rate > 100)
    errors.default_vat_rate = "Enter a rate between 0 and 100";
  if (Object.keys(errors).length) return fail(errors);

  return save(
    {
      vat_registered: true,
      vat_number: `GB${raw}`,
      vat_effective_from: from,
      default_vat_rate: rate,
    },
    "VAT settings saved",
  );
}
