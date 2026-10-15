"use client";

import { useState } from "react";

import {
  getWompiSettings,
  saveWompiSettings,
  type WompiSettingsAdmin,
} from "@/lib/server/actions/settings";

const inputClass =
  "mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const fieldClass = "block text-xs font-medium text-muted-foreground";
const btnClass =
  "mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50";

/**
 * El prefijo de la llave es lo que decide si Wompi cobra dinero real
 * (`pub_prod_`) o de pruebas (`pub_test_`): el selector de entorno no lo cambia.
 * Este detector local avisa en cuanto se pega una llave que no cuadra.
 */
function detectKeyEnv(key: string): "sandbox" | "production" | null {
  const k = key.trim().toLowerCase();
  if (k.startsWith("pub_test")) return "sandbox";
  if (k.startsWith("pub_prod")) return "production";
  return null;
}

function envLabel(e: "sandbox" | "production"): string {
  return e === "production" ? "producción" : "pruebas";
}

/**
 * Secreto de Wompi (integridad o eventos): `test_…` es de pruebas y `prod_…` de
 * producción. Mezclar entornos hace que la firma del checkout falle o que los
 * webhooks no se puedan verificar.
 */
function detectSecretEnv(secret: string): "sandbox" | "production" | null {
  const s = secret.trim().toLowerCase();
  if (s.startsWith("test_")) return "sandbox";
  if (s.startsWith("prod_")) return "production";
  return null;
}

/** La llave privada (`prv_test_` / `prv_prod_`) también está atada a un entorno. */
function detectPrivateKeyEnv(key: string): "sandbox" | "production" | null {
  const k = key.trim().toLowerCase();
  if (k.startsWith("prv_test")) return "sandbox";
  if (k.startsWith("prv_prod")) return "production";
  return null;
}

export function WompiSettingsForm({ initial }: { initial: WompiSettingsAdmin }) {
  const [state, setState] = useState(initial);
  const [env, setEnv] = useState(initial.env);
  const [publicKey, setPublicKey] = useState(initial.publicKey);
  const [integritySecret, setIntegritySecret] = useState("");
  const [eventsSecret, setEventsSecret] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const detectedKeyEnv = detectKeyEnv(publicKey);
  const keyMismatch = detectedKeyEnv !== null && detectedKeyEnv !== env;

  const referenceEnv = detectedKeyEnv ?? env;
  const secretWarnings: string[] = [];
  const integrityEnvTyped = detectSecretEnv(integritySecret);
  if (integrityEnvTyped && integrityEnvTyped !== referenceEnv) {
    secretWarnings.push(
      `El secreto de integridad es de ${envLabel(integrityEnvTyped)} pero el resto de credenciales son de ${envLabel(referenceEnv)}.`,
    );
  }
  const eventsEnvTyped = detectSecretEnv(eventsSecret);
  if (eventsEnvTyped && eventsEnvTyped !== referenceEnv) {
    secretWarnings.push(
      `El secreto de eventos es de ${envLabel(eventsEnvTyped)} pero el resto de credenciales son de ${envLabel(referenceEnv)}.`,
    );
  }
  const privateKeyEnvTyped = detectPrivateKeyEnv(privateKey);
  if (privateKeyEnvTyped && privateKeyEnvTyped !== referenceEnv) {
    secretWarnings.push(
      `La llave privada es de ${envLabel(privateKeyEnvTyped)} pero el resto de credenciales son de ${envLabel(referenceEnv)}.`,
    );
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await saveWompiSettings({
      env,
      publicKey,
      integritySecret: integritySecret || undefined,
      eventsSecret: eventsSecret || undefined,
      privateKey: privateKey || undefined,
    });
    setSaving(false);
    if (res.ok) {
      setState(await getWompiSettings());
      setIntegritySecret("");
      setEventsSecret("");
      setPrivateKey("");
      setMessage({ ok: true, text: "Credenciales guardadas y cifradas." });
    } else {
      setMessage({ ok: false, text: res.error ?? "No se pudo guardar." });
    }
  }

  const secretField = (
    label: string,
    value: string,
    setter: (v: string) => void,
    last4: string,
    isSet: boolean,
  ) => (
    <label className="block">
      <span className={fieldClass}>{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => setter(e.target.value)}
        placeholder={isSet ? `••••••${last4} (vacío = conservar)` : "Nuevo secreto"}
        autoComplete="new-password"
        className={inputClass}
      />
    </label>
  );

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="font-display text-lg font-semibold">Credenciales de Wompi</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Se cifran en reposo (AES-256-GCM). Si dejas un secreto vacío se conserva el valor guardado
        anteriormente; los secretos nunca se muestran completos.
      </p>

      {state.credentialWarning && (
        <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.credentialWarning}
        </p>
      )}

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className={fieldClass}>Entorno</span>
          <select value={env} onChange={(e) => setEnv(e.target.value as "sandbox" | "production")} className={inputClass}>
            <option value="sandbox">Sandbox (pruebas)</option>
            <option value="production">Producción</option>
          </select>
        </label>

        <label className="block">
          <span className={fieldClass}>Public key</span>
          <input
            type="text"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder={state.publicKey ? state.publicKey : "pub_test_…"}
            className={inputClass}
          />
          {detectedKeyEnv && (
            <span className={`mt-1 block text-xs ${keyMismatch ? "text-red-600" : "text-muted-foreground"}`}>
              {keyMismatch
                ? `Esta llave es de ${envLabel(detectedKeyEnv)}; no coincide con el entorno seleccionado (${envLabel(env)}).`
                : `Llave de ${envLabel(detectedKeyEnv)} detectada.`}
            </span>
          )}
        </label>

        {secretWarnings.length > 0 && (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            {secretWarnings.join(" ")} Wompi no mezcla credenciales entre ambientes.
          </p>
        )}

        {secretField("Llave de integridad (integrity secret)", integritySecret, setIntegritySecret, state.integritySecretLast4, state.integritySecretSet)}
        {secretField("Secreto de eventos (events secret)", eventsSecret, setEventsSecret, state.eventsSecretLast4, state.eventsSecretSet)}
        {secretField("Llave privada (private key, opcional)", privateKey, setPrivateKey, state.privateKeyLast4, state.privateKeySet)}
        <p className="text-xs text-muted-foreground">
          La llave privada (<code>prv_…</code>) solo la usa la reconciliación para <em>listar</em>{" "}
          transacciones y recuperar pagos cuyo webhook se perdió por completo. Sin ella, esas órdenes
          solo se pueden recuperar si ya se conoce el id de la transacción. No se usa para el checkout
          ni se expone al navegador.
        </p>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className={btnClass}>
          {saving ? "Guardando…" : "Guardar credenciales"}
        </button>
        {message && (
          <span className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`}>{message.text}</span>
        )}
      </div>
    </div>
  );
}
