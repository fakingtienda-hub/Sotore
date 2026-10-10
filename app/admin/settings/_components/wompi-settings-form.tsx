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

export function WompiSettingsForm({ initial }: { initial: WompiSettingsAdmin }) {
  const [state, setState] = useState(initial);
  const [env, setEnv] = useState(initial.env);
  const [publicKey, setPublicKey] = useState(initial.publicKey);
  const [integritySecret, setIntegritySecret] = useState("");
  const [eventsSecret, setEventsSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await saveWompiSettings({
      env,
      publicKey,
      integritySecret: integritySecret || undefined,
      eventsSecret: eventsSecret || undefined,
    });
    setSaving(false);
    if (res.ok) {
      setState(await getWompiSettings());
      setIntegritySecret("");
      setEventsSecret("");
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
    <div className="mt-6 max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="font-display text-lg font-semibold">Credenciales de Wompi</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Se cifran en reposo (AES-256-GCM). Si dejas un secreto vacío se conserva el valor guardado
        anteriormente; los secretos nunca se muestran completos.
      </p>

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
        </label>

        {secretField("Llave de integridad (integrity secret)", integritySecret, setIntegritySecret, state.integritySecretLast4, state.integritySecretSet)}
        {secretField("Secreto de eventos (events secret)", eventsSecret, setEventsSecret, state.eventsSecretLast4, state.eventsSecretSet)}
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
