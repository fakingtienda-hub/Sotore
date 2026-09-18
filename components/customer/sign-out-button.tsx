"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth/client";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await signOut();
        router.push("/");
        router.refresh();
      }}
    >
      Salir
    </button>
  );
}
