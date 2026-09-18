import { Suspense } from "react";
import type { ReactNode } from "react";

import { requireAdmin } from "@/lib/auth/session";
import { AdminNav } from "./_components/admin-nav";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-48 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-14 items-center border-b border-border px-5">
          <span className="font-display text-lg font-semibold">Fakingstore</span>
        </div>
        <Suspense fallback={<div className="flex-1" />}>
          <AdminNav />
        </Suspense>
      </aside>
      <main className="flex-1 px-6 py-8 md:px-10">{children}</main>
    </div>
  );
}