"use client";

import { useState } from "react";

import {
  getStorageSettings,
  saveStorageSettings,
  testStorageConnection,
  type StorageSettingsAdmin,
} from "@/lib/server/actions/settings";

const inputClass =
  "mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const fieldClass = "block text-xs font-medium text-muted-foreground";
const btnClass =
  "inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50";
const btnSecondaryClass =
  "inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50";

function driverLabel(d: "local" | "r2"): string {
  return d === "r2" ? "Cloudflare R2 (S3 compatible)" : "Local (disco del servidor)";
}

export function StorageSettingsForm({ initial }: { initial: StorageSettingsAdmin }) {
  const [state, setState] = useState(initial);
  const [driver, setDriver] = useState(initial.driver);
  const [endpoint, setEndpoint] = useState(initial.endpoint);
  const [bucket, setBucket] = useState(initial.bucket);
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const typedEndpoint = endpoint.trim();
  const endpointLooksInvalid = typedEndpoint !== "" && !/^https?:\/\//i.test(typedEndpoint);
  const r2Incomplete =
    driver === "r2" &&
    (!typedEndpoint ||
      !bucket.trim() ||
      (!state.accessKeyIdSet && !accessKeyId) ||
      (!state.secretAccessKeySet && !secretAccessKey));
  const testDisabled = testing || driver !== "r2" || r2Incomplete;

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await saveStorageSettings({
      driver,
      endpoint,
      bucket,
      accessKeyId: accessKeyId || undefined,
      secretAccessKey: secretAccessKey || undefined,
    });
    setSaving(false);
    if (res.ok) {
      setState(await getStorageSettings());
      setAccessKeyId("");
      setSecretAccessKey("");
      setMessage({ ok: true, text: "Configuración guardada y cifrada." });
    } else {
      setMessage({ ok: false, text: res.error ?? "No se pudo guardar." });
    }
  }

  async function test() {
    setTesting(true);
    setMessage(null);
    const res = await testStorageConnection({
      endpoint,
      bucket,
      accessKeyId: accessKeyId || undefined,
      secretAccessKey: secretAccessKey || undefined,
    });
    setTesting(false);
    setMessage(
      res.ok
        ? { ok: true, text: "Conexión correcta: se escribió y borró un objeto de prueba." }
        : { ok: false, text: res.error ?? "No se pudo conectar." },
    );
  }

  const secretField = (
    label: string,
    hint: string,
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
        placeholder={isSet ? `••••••${last4} (vacío = conservar)` : hint}
        autoComplete="new-password"
        className={inputClass}
      />
    </label>
  );

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="font-display text-lg font-semibold">Almacenamiento de archivos</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Dónde viven los archivos de los productos (PDF, video, packs). Las llaves se cifran en reposo
        (AES-256-GCM); si dejas una vacía se conserva la guardada y nunca se muestran completas.
      </p>

      <p className="mt-3 text-xs text-muted-foreground">
        Activo ahora: <strong>{driverLabel(state.activeDriver)}</strong>
        {state.source === "db" ? " (configurado aquí)" : " (tomado del entorno)"}.
      </p>

      {driver === "r2" && !state.configured && (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          R2 está elegido pero le faltan datos (endpoint, bucket o llaves). Hasta completarlos se
          seguirá usando el disco local.
        </p>
      )}

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className={fieldClass}>Proveedor</span>
          <select
            value={driver}
            onChange={(e) => setDriver(e.target.value as "local" | "r2")}
            className={inputClass}
          >
            <option value="local">Local (disco del servidor)</option>
            <option value="r2">Cloudflare R2 (S3 compatible)</option>
          </select>
        </label>

        <label className="block">
          <span className={fieldClass}>Endpoint (S3-compatible)</span>
          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://<CUENTA>.r2.cloudflarestorage.com"
            className={inputClass}
          />
          {endpointLooksInvalid && (
            <span className="mt-1 block text-xs text-red-600">
              Debe empezar por http:// o https://.
            </span>
          )}
        </label>

        <label className="block">
          <span className={fieldClass}>Bucket</span>
          <input
            type="text"
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
            placeholder="product-files"
            className={inputClass}
          />
        </label>

        <p className="text-xs text-muted-foreground">
          Las credenciales salen de un token de R2 (<em>Manage R2 API Tokens</em>) con permiso
          <strong> Object Read &amp; Write</strong>. R2 no usa regiones (el driver fija <code>auto</code>).
        </p>

        {secretField(
          "Access Key ID",
          "Access Key ID del token",
          accessKeyId,
          setAccessKeyId,
          state.accessKeyIdLast4,
          state.accessKeyIdSet,
        )}
        {secretField(
          "Secret Access Key",
          "Secret Access Key del token",
          secretAccessKey,
          setSecretAccessKey,
          state.secretAccessKeyLast4,
          state.secretAccessKeySet,
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className={btnClass}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={test}
          disabled={testDisabled}
          className={btnSecondaryClass}
          title={
            driver !== "r2"
              ? "Elige Cloudflare R2 para probar la conexión."
              : r2Incomplete
                ? "Completa endpoint, bucket y llaves para probar."
                : undefined
          }
        >
          {testing ? "Probando…" : "Probar conexión"}
        </button>
        {message && (
          <span className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
