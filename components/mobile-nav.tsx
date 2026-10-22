"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarDays, Wrench, Car, Menu } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/* Bottom tab bar on phones: the four most-used pages, plus Menu to open the full sidebar */
const TABS = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/diary", label: "Diary", icon: CalendarDays },
  { href: "/jobs", label: "Jobs", icon: Wrench },
  { href: "/vehicles", label: "Vehicles", icon: Car },
];

export function MobileNav() {
  const pathname = usePathname();
  const { openMobile, setOpenMobile } = useSidebar();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const item =
    "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="Main"
    >
      <div className="grid grid-cols-5">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={isActive(t.href) ? "page" : undefined}
            className={cn(
              item,
              isActive(t.href) ? "text-primary" : "text-muted-foreground",
            )}
          >
            <t.icon className="size-5" />
            {t.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setOpenMobile(!openMobile)}
          className={cn(
            item,
            openMobile ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Menu className="size-5" />
          Menu
        </button>
      </div>
    </nav>
  );
}
