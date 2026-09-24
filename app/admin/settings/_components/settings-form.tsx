"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { saveStoreSettings, type StoreSettings } from "@/lib/server/actions/settings";
import { AutosaveField } from "@/app/admin/_components/autosave-field";

function toForm(s: StoreSettings) {
  return {
    storeName: s.storeName,
    contactEmail: s.contactEmail,
    wompiPublicKey: s.wompiPublicKey,
    socials: {
      instagram: s.socials.instagram,
      tiktok: s.socials.tiktok,
      facebook: s.socials.facebook,
    },
  };
}

const inputClass =
  "mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export function SettingsForm({ initial }: { initial: StoreSettings }) {
  const router = useRouter();
  const [committed, setCommitted] = useState(() => toForm(initial));
  const committedRef = useRef(committed);

  async function doSave(patch: Partial<typeof committedRef.current>) {
    const payload = {
      ...committedRef.current,
      ...patch,
      socials: {
        ...committedRef.current.socials,
        ...(patch.socials ?? {}),
      },
    };
    const res = await saveStoreSettings(payload);
    if (res.ok) {
      committedRef.current = payload;
      setCommitted(payload);
      router.refresh();
    }
    return res;
  }

  const field = (key: keyof typeof committed, label: string, type = "text") => (
    <div>
      <label className="block text-xs font-medium text-muted-foreground">{label}</label>
      <AutosaveField
        value={String(committed[key] ?? "")}
        type={type}
        onSave={async (v) => doSave({ [key]: v } as Partial<typeof committedRef.current>)}
        className={inputClass}
      />
    </div>
  );

  const socialField = (key: "instagram" | "tiktok" | "facebook", label: string) => (
    <div>
      <label className="block text-xs font-medium text-muted-foreground">{label}</label>
      <AutosaveField
        value={committed.socials[key]}
        type="url"
        onSave={async (v) => doSave({ socials: Object.assign({}, committedRef.current.socials, { [key]: v }) })}
        className={inputClass}
      />
    </div>
  );

  return (
    <div className="mt-6 max-w-2xl rounded-2xl border border-border bg-card p-6">
      <p className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400">
        ✎ Los cambios se guardan automáticamente al salir de cada campo.
      </p>

      <div className="space-y-6">
        <fieldset className="space-y-4">
          <legend className="font-display text-lg font-semibold">Datos de la tienda</legend>
          {field("storeName", "Nombre de la tienda")}
          {field("contactEmail", "Email de contacto", "email")}
          <p className="text-xs text-muted-foreground">
            Moneda: COP (peso colombiano) — Wompi solo procesa COP.
          </p>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="font-display text-lg font-semibold">Redes sociales</legend>
          {socialField("instagram", "Instagram")}
          {socialField("tiktok", "TikTok")}
          {socialField("facebook", "Facebook")}
        </fieldset>
      </div>
    </div>
  );
}