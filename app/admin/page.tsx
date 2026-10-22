import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/server";
import { gbp, ukDate } from "@/lib/format";
import { PLAN_LABEL } from "@/lib/plan";
import { garageLink } from "@/lib/garage-url";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Platform admin", robots: { index: false } };

type G = {
  id: string;
  name: string;
  slug: string;
  custom_domain: string | null;
  plan_status: string;
  trial_ends_at: string | null;
  plan_renews_at: string | null;
  created_at: string;
  has_stripe: boolean;
  owner_email: string | null;
  staff: number;
  customers: number;
  jobs_30d: number;
  invoiced_30d: number;
  last_activity: string | null;
};

async function update(fd: FormData) {
  "use server";
  const sb = await createClient();
  const trial = String(fd.get("trial_ends") ?? "");
  await sb.rpc("admin_update_garage", {
    p_id: String(fd.get("id")),
    p_plan_status: String(fd.get("plan_status")),
    p_trial_ends: /^\d{4}-\d{2}-\d{2}$/.test(trial) ? trial : null,
    p_custom_domain: String(fd.get("custom_domain") ?? ""),
  });
  revalidatePath("/admin");
}

/** An owner lost their phone: remove their authenticator (needs the service key) */
async function resetMfa(fd: FormData) {
  "use server";
  const sb = await createClient();
  const { data: isAdmin } = await sb.rpc("is_platform_admin");
  const email = String(fd.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!isAdmin || !adminConfigured() || !email) redirect("/admin");
  const admin = createAdminClient();
  const { data: m } = await admin
    .from("garage_members")
    .select("user_id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  let done = false;
  if (m) {
    const { data } = await admin.auth.admin.mfa.listFactors({
      userId: m.user_id,
    });
    for (const f of data?.factors ?? [])
      await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: m.user_id });
    done = true;
  }
  redirect(`/admin?mfa=${done ? "reset" : "notfound"}`);
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ mfa?: string }>;
}) {
  const { mfa } = await searchParams;
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  const { data, error } = await sb.rpc("admin_garages");
  if (error) redirect("/");
  const garages = (data ?? []) as G[];
  const paying = garages.filter((g) => g.plan_status === "active").length;
  const trials = garages.filter((g) => g.plan_status === "trial").length;

  return (
    <div className="min-h-svh bg-muted/40 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Platform admin
            </h1>
            <p className="text-sm text-muted-foreground">
              {garages.length} garages · {paying} paying · {trials} on trial
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/">
                {garages.length ? "Back to app" : "Set up a garage"}
              </Link>
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Reset someone’s two-factor login</CardTitle>
            <CardDescription>
              For an owner who has lost their phone. Check who they are first
              (call them on the garage’s number).
              {mfa === "reset" && (
                <b className="text-success">
                  {" "}
                  Done: they can sign in with their password and set it up
                  again.
                </b>
              )}
              {mfa === "notfound" && (
                <b className="text-destructive">
                  {" "}
                  No staff member with that email.
                </b>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {adminConfigured() ? (
              <form
                suppressHydrationWarning
                action={resetMfa}
                className="flex flex-wrap gap-2"
              >
                <Input
                  name="email"
                  type="email"
                  placeholder="owner@garage.co.uk"
                  className="max-w-xs"
                  required
                />
                <Button type="submit" variant="outline">
                  Reset two-factor
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                Needs SUPABASE_SERVICE_ROLE_KEY on the server.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {garages.map((g) => (
            <Card key={g.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {g.name}
                  <Badge
                    variant={
                      g.plan_status === "active" || g.plan_status === "comped"
                        ? "default"
                        : "outline"
                    }
                  >
                    {PLAN_LABEL[g.plan_status] ?? g.plan_status}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  <a
                    href={garageLink(g, "/login")}
                    className="underline-offset-4 hover:underline"
                  >
                    {g.custom_domain ?? g.slug}
                  </a>
                  {" · "}
                  {g.owner_email ?? "no owner email"} · joined{" "}
                  {ukDate(g.created_at)}
                  {g.last_activity
                    ? ` · last job ${ukDate(g.last_activity)}`
                    : " · no jobs yet"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  {[
                    ["Staff", g.staff],
                    ["Customers", g.customers],
                    ["Jobs (30 days)", g.jobs_30d],
                    ["Invoiced (30 days)", gbp(Number(g.invoiced_30d))],
                  ].map(([k, v]) => (
                    <div
                      key={k as string}
                      className="rounded-lg bg-muted/60 p-3"
                    >
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd className="font-semibold tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
                <form
                  suppressHydrationWarning
                  action={update}
                  className="grid gap-3 sm:grid-cols-[10rem_10rem_1fr_auto] sm:items-end"
                >
                  <input
                    suppressHydrationWarning
                    type="hidden"
                    name="id"
                    value={g.id}
                  />
                  <label className="space-y-1 text-xs text-muted-foreground">
                    Plan
                    <NativeSelect
                      name="plan_status"
                      defaultValue={g.plan_status}
                    >
                      {Object.entries(PLAN_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                  <label className="space-y-1 text-xs text-muted-foreground">
                    Trial ends
                    <Input
                      type="date"
                      name="trial_ends"
                      defaultValue={g.trial_ends_at?.slice(0, 10) ?? ""}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-muted-foreground">
                    Custom domain (also add it in Vercel)
                    <Input
                      name="custom_domain"
                      defaultValue={g.custom_domain ?? ""}
                      placeholder="www.smithsgarage.co.uk"
                    />
                  </label>
                  <Button type="submit" variant="secondary">
                    Save
                  </Button>
                </form>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
