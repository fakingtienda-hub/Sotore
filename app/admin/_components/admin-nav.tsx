"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { ComponentType, SVGProps } from "react";

import { LANDING_SECTION_LABELS, LANDING_WIZARD_SECTIONS } from "@/types/landing";
import {
  IconCoupons,
  IconCustomers,
  IconDashboard,
  IconDownloads,
  IconLanding,
  IconProducts,
  IconSales,
  IconSettings,
} from "./admin-icons";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
type NavItem = { href: string; label: string; icon: IconComponent };

const topItems: NavItem[] = [{ href: "/admin", label: "Dashboard", icon: IconDashboard }];

const bottomItems: NavItem[] = [
  { href: "/admin/sales", label: "Ventas", icon: IconSales },
  { href: "/admin/customers", label: "Clientes", icon: IconCustomers },
  { href: "/admin/products", label: "Productos", icon: IconProducts },
  { href: "/admin/coupons", label: "Cupones", icon: IconCoupons },
  { href: "/admin/downloads", label: "Descargas", icon: IconDownloads },
  { href: "/admin/settings", label: "Configuración", icon: IconSettings },
];

/** `compact` = riel de iconos (menú retraído): sin texto, con tooltip nativo. */
function itemClass(active: boolean, compact: boolean) {
  return [
    "flex items-center rounded-md text-sm transition-colors",
    compact ? "justify-center px-0 py-2.5" : "gap-2.5 px-2.5 py-2",
    active
      ? "bg-accent font-medium text-accent-foreground"
      : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground",
  ].join(" ");
}

export function AdminNav({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
} = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isLanding = pathname?.startsWith("/admin/landing");
  const [open, setOpen] = useState<boolean>(() => Boolean(isLanding));
  const activeStep = isLanding ? searchParams.get("step") : null;
  const showSubmenu = open && isLanding;

  const handleLandingClick = () => {
    if (isLanding) {
      setOpen((o) => !o);
    } else {
      setOpen(true);
      router.push("/admin/landing");
      // En móvil el cajón debe cerrarse tras navegar.
      onNavigate?.();
    }
  };

  const renderItem = (item: NavItem, active: boolean) => {
    const ItemIcon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        title={compact ? item.label : undefined}
        aria-label={compact ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={itemClass(active, compact)}
      >
        <ItemIcon className="h-[18px] w-[18px] shrink-0" />
        {compact ? null : <span className="truncate">{item.label}</span>}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Navegación principal"
      className={`flex flex-1 flex-col gap-1 overflow-y-auto ${compact ? "px-2 py-3" : "p-3"}`}
    >
      {topItems.map((item) => renderItem(item, pathname === item.href))}

      {compact ? (
        renderItem({ href: "/admin/landing", label: "Landing", icon: IconLanding }, isLanding ?? false)
      ) : (
        <>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleLandingClick}
              aria-expanded={showSubmenu}
              title="Landing"
              className={`flex w-full items-center justify-between gap-1 ${itemClass(isLanding ?? false, compact)}`}
            >
              <span className="flex items-center gap-2.5">
                <IconLanding className="h-[18px] w-[18px] shrink-0" />
                <span>Landing</span>
              </span>
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
                className={`h-4 w-4 shrink-0 transition-transform ${showSubmenu ? "rotate-180" : ""}`}
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          {showSubmenu ? (
            <div className="ml-1.5 flex flex-col gap-0.5 border-l border-border pl-1.5 pb-1">
              {LANDING_WIZARD_SECTIONS.map((section) => {
                const href = `/admin/landing?step=${section}`;
                const active = activeStep === section || (activeStep === null && section === "site");
                return (
                  <Link
                    key={section}
                    href={href}
                    className={`rounded-sm px-2 py-1.5 text-xs whitespace-nowrap transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
                    }`}
                  >
                    {LANDING_SECTION_LABELS[section]}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </>
      )}

      {bottomItems.map((item) => renderItem(item, pathname === item.href))}
    </nav>
  );
}
