"use client";

import { useState } from "react";

import { signIn } from "@/lib/auth/client";

export default function SetupAccessPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    try {
      const { error: apiError } = await signIn.magicLink({ email, callbackURL: "/library" });
      if (apiError) {
        setStatus("error");
        setError(apiError.message ?? "No se pudo enviar el enlace.");
        return;
      }
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "No se pudo enviar el enlace.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-sm border border-border bg-card p-6">
        <h1 className="font-display text-xl font-semibold">Configurar acceso</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deja tu email: te enviamos un enlace para entrar a tu biblioteca sin necesidad de contraseña.
          La primera vez creamos tu acceso automáticamente.
        </p>

        {status === "sent" ? (
          <div className="mt-6 rounded-sm border border-border bg-secondary/40 p-4 text-sm">
            Revisa tu bandeja de entrada: {email}. El enlace expira en 10 minutos.
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              />
            </div>
            {status === "error" && <p className="text-sm text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full rounded-sm bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {status === "loading" ? "Enviando…" : "Enviar link de acceso"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}