"use client";
import { PRODUCT_NAME } from "@/lib/brand";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Wrench,
  Users,
  Car,
  Receipt,
  Settings,
  LogOut,
  ChevronsUpDown,
  BellRing,
  Boxes,
  BarChart3,
  ShieldCheck,
  MonitorSmartphone,
  CarFront,
  FileSignature,
  UserCog,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { GarageLogo } from "@/components/garage-logo";

type Role = "owner" | "reception" | "mechanic";
type Feature = "courtesy";
type Item = {
  href: string;
  label: string;
  icon: React.ElementType;
  roles?: Role[];
  feature?: Feature;
};

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Workshop",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/diary", label: "Diary", icon: CalendarDays },
      { href: "/jobs", label: "Job cards", icon: Wrench },
      { href: "/workshop", label: "Workshop board", icon: MonitorSmartphone },
      {
        href: "/courtesy-cars",
        label: "Courtesy cars",
        icon: CarFront,
        feature: "courtesy",
      },
      {
        href: "/reminders",
        label: "Reminders",
        icon: BellRing,
        roles: ["owner", "reception"],
      },
    ],
  },
  {
    label: "Records",
    items: [
      { href: "/customers", label: "Customers", icon: Users },
      { href: "/vehicles", label: "Vehicles", icon: Car },
      { href: "/parts", label: "Parts & stock", icon: Boxes },
      {
        href: "/estimates",
        label: "Estimates",
        icon: FileSignature,
        roles: ["owner", "reception"],
      },
      {
        href: "/invoices",
        label: "Invoices",
        icon: Receipt,
        roles: ["owner", "reception"],
      },
    ],
  },
  {
    label: "Admin",
    items: [
      {
        href: "/reports",
        label: "Reports",
        icon: BarChart3,
        roles: ["owner", "reception"],
      },
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        roles: ["owner"],
      },
    ],
  },
];

export function AppSidebar({
  garage,
  user,
  signOut,
  isAdmin = false,
  features = [],
}: {
  features?: Feature[];
  garage: { name: string; logo_url: string | null };
  user: { name: string; email: string; role: Role };
  signOut: () => Promise<void>;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  // on phones the menu slides over the page, so close it once a link is tapped
  const close = () => {
    if (isMobile) setOpenMobile(false);
  };
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const initials = user.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/" onClick={close}>
                <GarageLogo name={garage.name} logoUrl={garage.logo_url} />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">{garage.name}</span>
                  <span className="truncate text-xs opacity-60">
                    {PRODUCT_NAME}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {GROUPS.map((group) => {
          const items = group.items.filter(
            (i) =>
              (!i.roles || i.roles.includes(user.role)) &&
              (!i.feature || features.includes(i.feature)),
          );
          if (!items.length) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
                      tooltip={item.label}
                      className="data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground"
                    >
                      <Link href={item.href} onClick={close}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <Avatar className="size-8 rounded-md">
                    <AvatarFallback className="rounded-md bg-sidebar-accent text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-medium">
                      {user.name}
                    </span>
                    <span className="truncate text-xs capitalize opacity-60">
                      {user.role}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 opacity-60" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="text-sm font-medium">{user.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/account" onClick={close}>
                    <UserCog /> Account and security
                  </Link>
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin" onClick={close}>
                      <ShieldCheck /> Platform admin
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => signOut()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
