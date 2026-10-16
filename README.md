# RampDesk

White-label garage management system for UK repair and MOT garages.
Next.js 16 · Tailwind 4 · shadcn/ui (Radix) · Supabase · Vercel

## First-time setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase URL and publishable (anon) key.
3. In Supabase → SQL editor, run every file in `supabase/` in number order (01 to 13).
   Each is run once; skip any you have already run.
4. Supabase → Authentication → Providers → Email: turn off "Confirm email" for development.
5. `npm run dev` and open http://localhost:3000 → "Create an account" → set up your garage.

## Deploy (Vercel Hobby)

Push to GitHub → Import in Vercel → add the three env vars from `.env.example`.
Set `NEXT_PUBLIC_ROOT_DOMAIN` to your `*.vercel.app` address until the real domain is bought.
On a vercel.app address, open `/?garage=yourslug` once and the app remembers the garage.

## Registration lookup (DVSA MOT History API)

Free, and fills in make, model, colour, fuel, engine size, MOT due date and full MOT history.

1. Apply at https://documentation.history.mot.api.gov.uk/mot-history-api/register (approval takes up to 5 working days).
2. DVSA emails a client ID, client secret, API key, token URL and scope.
3. Add them to `.env.local` (and to Vercel → Settings → Environment Variables):
   `DVSA_CLIENT_ID`, `DVSA_CLIENT_SECRET`, `DVSA_API_KEY`, `DVSA_TOKEN_URL`, `DVSA_SCOPE`.
4. Restart `npm run dev`. The "Find vehicle" button and "Refresh from DVSA" switch on automatically.

Until then, vehicles can be added manually.
The DVLA Vehicle Enquiry API (`DVLA_API_KEY`) is optional and only adds tax status. Its registration is currently closed.

## Emailing invoices (optional, Resend)

Free tier: 3,000 emails a month. Without it, "Email" opens your own mail app with the invoice link.

1. Sign up at https://resend.com and verify your domain (adds a few DNS records).
2. Create an API key.
3. Add to `.env.local` and Vercel: `RESEND_API_KEY=...` and `EMAIL_FROM=invoices@yourdomain.co.uk`.

Emails are sent with the garage's name as the sender name, the garage's email as reply-to,
and the invoice PDF attached.

## Staff logins

Settings → Staff → Invite. Each person gets a link to create their own login.
Roles: Owner (everything), Reception (diary, pricing, invoices), Mechanic (their jobs, no prices).

## Online booking

Settings → Online booking: add the services customers can book, then switch it on.
The booking page is `https://<garage>.<your-domain>/book` (locally: `/book?garage=<slug>`).
Slots come from the opening hours, open days and bays in Settings → Workshop.

## Automatic reminder emails

Needs three things on the server (Vercel → Settings → Environment Variables):

1. `RESEND_API_KEY` + `EMAIL_FROM` (see "Emailing invoices" above)
2. `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API). Keep it secret.
3. `CRON_SECRET` (any long random string)

`vercel.json` runs the job once a day at 08:00 UTC, which the free Hobby plan allows.
Each garage switches reminders on in Settings → Reminders. Only customers who agreed are emailed,
and every email has an unsubscribe link. Without this setup, the Reminders page still gives
one-tap WhatsApp reminders.

## Importing customers

Customers → Import takes a CSV export from a spreadsheet or another garage system (one row per vehicle).
Columns are matched by name and can be changed before importing. Customers are matched by phone or email
and vehicles by registration, so a file can be imported again without creating duplicates.
`public/import-template.csv` is a sample file.

## Backups

A GitHub Actions workflow takes an encrypted daily database backup and keeps the free Supabase project awake.
Setup and restore steps: [docs/BACKUP.md](docs/BACKUP.md).

## Platform admin (you)

Run once in the Supabase SQL editor, with the email you log in with:

    insert into platform_admins (user_id) select id from auth.users where email = 'you@example.com';

Then open `/admin` (also in the menu under your name). From there you can see every garage,
set a garage to "Free plan" (for example your first garage), extend trials and set custom domains.

## Charging garages (Stripe, optional)

New garages get a 14-day trial. To take subscriptions:

1. In Stripe, create a Product with a monthly Price. Copy the price ID (`price_...`).
2. Set `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID`.
3. Add a webhook endpoint `https://<your-domain>/api/stripe/webhook` for the events
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
   Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Turn on the Customer Portal in Stripe (Settings → Billing → Customer portal).

Owners then see Subscribe / Manage billing in Settings → Plan. Until Stripe is set up,
change plans by hand in `/admin`.

## Custom domains

1. Add the domain to the Vercel project (Settings → Domains) and point its DNS as Vercel shows.
2. In `/admin`, enter the same domain for that garage.
For `<garage>.<your-domain>` subdomains, add a wildcard domain `*.your-domain` in Vercel.
