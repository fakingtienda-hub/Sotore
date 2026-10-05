"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSession } from "@/lib/auth/client";
import type { RequiredSiteContent } from "@/types/landing";

export function PublicHeader({
  site,
  storeName,
}: {
  site: RequiredSiteContent;
  storeName: string;
}) {
  const pathname = usePathname();
  const isHeroScreen = pathname === "/";
  const isCheckout = pathname.startsWith("/checkout");
  if (isCheckout) return null;

  return (
    <header
      className={
        isHeroScreen
          ? "fixed inset-x-0 top-0 z-40 border-b border-[var(--sf-line)] bg-[color-mix(in_srgb,var(--sf-ink)_80%,transparent)] backdrop-blur-md shadow-[0_18px_40px_-28px_rgba(0,0,0,0.55)]"
          : "sticky top-0 z-40 border-b border-[var(--sf-line)] bg-[color-mix(in_srgb,var(--sf-ink)_80%,transparent)] backdrop-blur-md shadow-[0_18px_40px_-28px_rgba(0,0,0,0.55)]"
      }
    >
      <div className="sf-wrap flex h-14 items-center justify-between gap-4">
<Link
          href="/"
          className="group flex min-h-11 items-center gap-2 transition-transform hover:scale-[1.02] sm:gap-3"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-mark.png"
            alt=""
            aria-hidden
            className="h-[26px] w-auto object-contain sm:h-[37px]"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-text.png"
            alt={`${storeName} — volver al inicio`}
            className="h-7 w-auto object-contain sm:h-10"
          />
        </Link>

        <div className="flex items-center gap-2">
          {site.trustRows.length > 0 ? (
            <ul className="hidden items-center gap-2 md:flex">
              {site.trustRows.map((t) => (
                <li key={t} className="sf-chip">
                  <span className="text-[var(--sf-gold)]" aria-hidden="true">
                    ✓
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          ) : null}
          <AccountLink />
        </div>
      </div>
    </header>
  );
}

function AccountLink() {
  const { data, isPending } = useSession();
  if (isPending) return null;
  const user = data?.user;

  return user ? (
    <Link href="/library" className="sf-chip" title={user.email ?? "Mi cuenta"}>
      Mi biblioteca
    </Link>
  ) : (
    <Link href="/login" className="sf-chip">
      Iniciar sesión
    </Link>
  );
}

export function PublicFooter({
  site,
  storeName,
}: {
  site: RequiredSiteContent;
  storeName: string;
}) {
  const pathname = usePathname();
  /* Ni en la landing a pantalla completa ni en el checkout: el checkout debe
     caber en una sola pantalla y no distraer ni ofrecer salidas. */
  if (pathname === "/" || pathname.startsWith("/checkout")) return null;

  return (
    <footer className="storefront-footer border-t border-[var(--sf-line)]">
      <div className="sf-wrap flex flex-col items-center justify-between gap-1 py-1 text-center sm:flex-row sm:text-left">
        <span className="sf-label">
          © {new Date().getFullYear()} {storeName}
        </span>
        {site.footerBadges.length > 0 ? (
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
            {site.footerBadges.map((b) => (
              <span key={b} className="sf-label">{b}</span>
            ))}
          </div>
        ) : null}
      </div>
    </footer>
  );
}