export type Garage = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_colour: string | null;
  address: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  labour_rate_pence: number;
  vat_registered: boolean;
  vat_number: string | null;
  vat_effective_from: string | null;
  default_vat_rate: number;
  invoice_prefix: string;
  next_invoice_number: number;
  payment_terms_days: number;
  invoice_terms: string | null;
  opening_time: string;
  bank_details: string | null;
  open_days: number[];
  online_booking_enabled: boolean;
  booking_lead_hours: number;
  booking_days_ahead: number;
  booking_message: string | null;
  payment_link_url: string | null;
  reminders_enabled: boolean;
  mot_reminder_days: number[];
  service_reminder_days: number;
  plan_status: string;
  trial_ends_at: string | null;
  plan_renews_at: string | null;
  stripe_customer_id: string | null;
  custom_domain: string | null;
  closing_time: string;
};

export type Bay = { id: string; name: string; sort_order: number | null };

export type ActionState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  ts?: number;
};
