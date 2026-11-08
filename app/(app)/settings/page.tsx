import { redirect } from 'next/navigation';
import { Users, CalendarCheck, BellRing, CreditCard, ToggleRight, ListChecks, ShieldCheck, History } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { emailConfigured } from '@/lib/email';
import { adminConfigured } from '@/lib/supabase/admin';
import { stripeConfigured } from '@/lib/stripe';
import { garageLink } from '@/lib/garage-url';
import { siteOrigin } from '@/lib/url';
import { planState } from '@/lib/plan';
import type { Bay, Garage, MenuItem } from '@/lib/types';
import { FeaturesTab } from './features';
import { ServiceMenuTab } from './service-menu';
import { SecurityTab, type MemberMfa } from './security';
import { ActivityLog } from './activity';
import { SettingsTabs, type ExtraTab } from './settings-tabs';
import { StaffTab, type Invite, type Member } from './staff';
import { BookingTab, type OnlineService } from './booking';
import { RemindersTab } from './reminders';
import { PlanTab } from './plan';

export const metadata = { title: 'Settings' };

const TABS = ['business', 'branding', 'workshop', 'invoicing', 'vat', 'staff', 'menu', 'booking', 'reminders', 'features', 'security', 'activity', 'plan'];
const nowMs = () => Date.now();

export default async function SettingsPage({
  searchParams,
}: { searchParams: Promise<{ tab?: string; billing?: string; area?: string }> }) {
  const m = await getMembership();
  if (!m || m.role !== 'owner') redirect('/');

  const sb = await createClient();
  const [{ data: garage }, { data: bays }, { data: members }, { data: invites }, { data: services }, { data: { user } }, { data: menu }] = await Promise.all([
    sb.from('garages').select('*').eq('id', m.garage_id).single(),
    sb.from('bays').select('id, name, sort_order').eq('garage_id', m.garage_id).order('sort_order'),
    sb.from('garage_members').select('user_id, display_name, email, role, active').eq('garage_id', m.garage_id).order('created_at'),
    sb.from('invites').select('id, display_name, email, role, token, expires_at').eq('garage_id', m.garage_id).is('accepted_at', null)
      .gt('expires_at', new Date(nowMs()).toISOString()).order('created_at', { ascending: false }),
    sb.from('online_services').select('id, name, duration_minutes, price_from_pence, description').eq('garage_id', m.garage_id).order('sort_order'),
    sb.auth.getUser(),
    sb.from('service_menu').select('id, name, lines, active, sort_order').eq('garage_id', m.garage_id).order('sort_order'),
  ]);
  if (!garage) redirect('/');
  const g = garage as Garage;

  const { tab, billing, area } = await searchParams;
  const { data: mfa } = await sb.rpc('member_mfa', { p_garage: m.garage_id });
  const mfaOn = new Map(((mfa ?? []) as { user_id: string; enabled: boolean }[]).map((x) => [x.user_id, x.enabled]));
  const memberMfa: MemberMfa[] = ((members ?? []) as Member[]).filter((x) => x.active)
    .map((x) => ({ user_id: x.user_id, display_name: x.display_name, role: x.role, enabled: !!mfaOn.get(x.user_id) }));
  const initialTab = tab && TABS.includes(tab) ? tab : 'business';

  const extra: ExtraTab[] = [
    {
      value: 'staff', label: 'Staff', icon: <Users />,
      content: <StaffTab members={(members ?? []) as Member[]} invites={(invites ?? []) as Invite[]} selfId={user?.id ?? ''}
        origin={await siteOrigin()} garage={g.name} emailOn={emailConfigured()} />,
    },
    {
      value: 'menu', label: 'Service menu', icon: <ListChecks />,
      content: <ServiceMenuTab items={(menu ?? []) as MenuItem[]} labourRate={g.labour_rate_pence} />,
    },
    {
      value: 'booking', label: 'Online booking', icon: <CalendarCheck />,
      content: <BookingTab g={g} services={(services ?? []) as OnlineService[]} link={garageLink(g, '/book')} />,
    },
    {
      value: 'reminders', label: 'Reminders', icon: <BellRing />,
      content: <RemindersTab g={g} emailOn={emailConfigured()} cronOn={adminConfigured() && !!process.env.CRON_SECRET}
        bookUrl={g.online_booking_enabled ? garageLink(g, '/book') : null} />,
    },
    {
      value: 'features', label: 'Features', icon: <ToggleRight />,
      content: <FeaturesTab g={g} emailOn={emailConfigured()} />,
    },
    {
      value: 'security', label: 'Security', icon: <ShieldCheck />,
      content: <SecurityTab required={g.mfa_required_roles ?? []} members={memberMfa} selfId={user?.id ?? ''} canReset={adminConfigured()} />,
    },
    {
      value: 'activity', label: 'Activity', icon: <History />,
      content: <ActivityLog garageId={m.garage_id} area={area ?? ''} />,
    },
    {
      value: 'plan', label: 'Plan', icon: <CreditCard />,
      content: <PlanTab g={g} state={planState(g, nowMs())} stripeOn={stripeConfigured()} flash={billing} />,
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Your garage, staff, service menu, online booking, reminders, features and plan.</p>
      </div>
      <SettingsTabs
        garage={g}
        bays={(bays ?? []) as Bay[]}
        initialTab={initialTab}
        rootDomain={process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? ''}
        extra={extra}
      />
    </div>
  );
}
