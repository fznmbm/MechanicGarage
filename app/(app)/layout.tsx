import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandStyle } from "@/components/brand-style";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/tenant";
import { planState } from "@/lib/plan";
import { hasVerifiedFactor } from "@/lib/mfa";
import { cn } from "@/lib/utils";
import Link from "next/link";

const nowMs = () => Date.now();

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const m = await getMembership();
  if (!m) redirect("/onboarding");
  const sb = await createClient();
  const [
    { data: isAdmin },
    { data: flags },
    {
      data: { user },
    },
  ] = await Promise.all([
    sb.rpc("is_platform_admin"),
    // optional features (errors, e.g. before migrations 15–16 are run, just leave them off)
    sb
      .from("garages")
      .select("feature_courtesy_cars, mfa_required_roles")
      .eq("id", m.garage_id)
      .maybeSingle(),
    sb.auth.getUser(),
  ]);
  // the garage requires two-factor for this role and it isn't set up yet
  if (
    (flags?.mfa_required_roles as string[] | undefined)?.includes(m.role) &&
    !hasVerifiedFactor(user)
  )
    redirect("/account?setup=1");
  const plan = planState(m.garage, nowMs());
  const banner =
    plan.kind === "trial" && plan.daysLeft <= 5
      ? `Your free trial ends in ${plan.daysLeft} day${plan.daysLeft === 1 ? "" : "s"}.`
      : plan.kind === "trial_ended"
        ? "Your free trial has ended."
        : plan.kind === "past_due"
          ? "Your subscription payment is overdue."
          : plan.kind === "cancelled"
            ? "Your subscription has been cancelled."
            : null;

  return (
    <SidebarProvider>
      <BrandStyle colour={m.garage.brand_colour} />
      <AppSidebar
        garage={m.garage}
        user={{ name: m.display_name, email: m.email, role: m.role }}
        isAdmin={!!isAdmin}
        features={flags?.feature_courtesy_cars ? ["courtesy"] : []}
        signOut={signOut}
      />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1 size-9 md:size-7" />
          <Separator orientation="vertical" className="mr-1 h-4!" />
          <form
            action="/vehicles"
            className="relative w-full max-w-sm"
            suppressHydrationWarning
          >
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              placeholder="Search reg or customer…"
              className="pl-8 uppercase placeholder:normal-case"
              suppressHydrationWarning
            />
          </form>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        {banner && (
          <div
            className={cn(
              "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm",
              plan.kind === "trial"
                ? "bg-primary/10"
                : "bg-destructive/10 text-destructive",
            )}
          >
            <span>{banner}</span>
            {m.role === "owner" ? (
              <Link
                href="/settings?tab=plan"
                className="font-medium underline underline-offset-4"
              >
                {plan.kind === "past_due" ? "Update payment" : "Subscribe"}
              </Link>
            ) : (
              <span className="opacity-80">
                Ask the owner to sort the subscription.
              </span>
            )}
          </div>
        )}
        <div className="flex-1 p-4 pb-24 md:p-6">{children}</div>
        <MobileNav />
      </SidebarInset>
    </SidebarProvider>
  );
}
