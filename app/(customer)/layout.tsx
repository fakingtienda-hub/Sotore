import Link from "next/link";
import type { ReactNode } from "react";

import { requireUser } from "@/lib/auth/session";
import { SignOutButton } from "@/components/customer/sign-out-button";

const nav = [
  { href: "/library", label: "Mi biblioteca" },
  { href: "/", label: "Tienda" },
];

export default async function CustomerLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="customer-scope flex min-h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center border-b border-border bg-card px-4 md:px-8">
        <Link href="/" className="mr-6 font-display text-lg font-semibold">
          Fakingstore
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="hidden text-muted-foreground sm:inline">{user.name || user.email}</span>
          <SignOutButton className="text-muted-foreground transition-colors hover:text-foreground" />
        </div>
      </header>
      <main className="flex-1 w-full">{children}</main>
    </div>
  );
}
