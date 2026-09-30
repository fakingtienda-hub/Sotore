"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { signIn } from "@/lib/auth/client";
import { safeNextPath } from "@/lib/client/safe-redirect";

/**
 * better-auth devuelve mensajes en inglés y, si la petición ni siquiera llega
 * al servidor, un `TypeError: Failed to fetch` que no dice nada. Traducimos los
 * casos conocidos para que el mensaje apunte a la causa real.
 */
function friendlyAuthError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");

  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return "No pudimos conectarnos con el servidor. Revisá tu conexión o recargá la página.";
  }
  if (/invalid email or password|invalid credentials|user not found/i.test(raw)) {
    return "Correo o contraseña incorrectos.";
  }
  if (/too many requests|rate limit/i.test(raw)) {
    return "Demasiados intentos. Esperá un minuto e intentá de nuevo.";
  }
  if (/user not allowed|sign up disabled/i.test(raw)) {
    return "Esta cuenta no puede acceder. Contactá a soporte.";
  }
  if (/email not verified/i.test(raw)) {
    return "Tu correo no está verificado. Revisá tu bandeja de entrada.";
  }
  if (raw && raw !== "Failed to fetch") return raw;
  return fallback;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const next = safeNextPath(nextParam);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"magic" | "password">("password");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    try {
      const { error: apiError } = await signIn.magicLink({ email, callbackURL: next ?? "/library" });
      if (apiError) {
        setStatus("error");
        setError(friendlyAuthError(apiError, "No se pudo enviar el enlace."));
        return;
      }
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(friendlyAuthError(err, "No se pudo enviar el enlace."));
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    try {
      const { data, error: apiError } = await signIn.email({ email, password });
      if (apiError) {
        setStatus("error");
        setError(friendlyAuthError(apiError, "Credenciales inválidas."));
        return;
      }
      const role = (data?.user as { role?: string } | undefined)?.role ?? "customer";
      const defaultRedirect = role === "admin" ? "/admin" : "/library";
      router.push(next ?? defaultRedirect);
    } catch (err) {
      setStatus("error");
      setError(friendlyAuthError(err, "Credenciales inválidas."));
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-sm border border-border bg-card p-6">
        <h1 className="font-display text-xl font-semibold">Acceso a Fakingstore</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "magic" ? "Te enviamos un enlace mágico por email." : "Solo para administradores."}
        </p>

        <div className="mt-4 flex gap-1 rounded-sm bg-secondary p-1 text-sm">
          {(["magic", "password"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-sm px-3 py-1.5 transition-colors ${
                mode === m ? "bg-card shadow-sm" : "text-muted-foreground"
              }`}
            >
              {m === "magic" ? "Magic link" : "Contraseña"}
            </button>
          ))}
        </div>

        {status === "sent" ? (
          <div className="mt-6 rounded-sm border border-border bg-secondary/40 p-4 text-sm">
            Revisa tu bandeja de entrada: {email}. El enlace expira en 10 minutos.
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={mode === "magic" ? handleMagicLink : handlePassword}>
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
            {mode === "password" && (
              <div>
                <label htmlFor="password" className="text-sm font-medium">
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
                />
              </div>
            )}
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full rounded-sm bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {status === "loading" ? "Enviando…" : mode === "magic" ? "Enviar enlace" : "Entrar"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}