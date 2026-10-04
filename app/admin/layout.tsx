import type { ReactNode } from "react";

import { requireAdmin } from "@/lib/auth/session";
import { AdminShell } from "./_components/admin-shell";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return <AdminShell>{children}</AdminShell>;
}
