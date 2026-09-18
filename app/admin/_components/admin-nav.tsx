"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { LANDING_SECTION_LABELS, LANDING_WIZARD_SECTIONS } from "@/types/landing";

const topItems = [{ href: "/admin", label: "Dashboard" }];

const bottomItems = [
  { href: "/admin/sales", label: "Ventas" },
  { href: "/admin/customers", label: "Clientes" },
  { href: "/admin/products", label: "Productos" },
  { href: "/admin/coupons", label: "Cupones" },
  { href: "/admin/downloads", label: "Descargas" },
  { href: "/admin/settings", label: "Configuración" },
];

function itemClass(active: boolean) {
  return `rounded-sm px-2.5 py-2 text-sm transition-colors ${
    active
      ? "bg-secondary text-secondary-foreground"
      : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
  }`;
}

export function AdminNav() {
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
    }
  };

  return (
    <nav aria-label="Navegación principal" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
      {topItems.map((item) => (
        <Link key={item.href} href={item.href} className={itemClass(pathname === item.href)}>
          {item.label}
        </Link>
      ))}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleLandingClick}
          aria-expanded={showSubmenu}
          className={`flex w-full items-center justify-between gap-1 ${itemClass(isLanding ?? false)}`}
        >
          <span>Landing</span>
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

      {bottomItems.map((item) => (
        <Link key={item.href} href={item.href} className={`${itemClass(pathname === item.href)} whitespace-nowrap`}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}