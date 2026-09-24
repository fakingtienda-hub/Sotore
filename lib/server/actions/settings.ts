"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/server/vault";
import { WOMPI_SETTINGS_KEY } from "@/lib/server/wompi-settings";
const SETTINGS_KEY = "general";

export type StoreSettings = {
  storeName: string;
  currency: string;
  contactEmail: string;
  wompiPublicKey: string;
  socials: {
    instagram: string;
    tiktok: string;
    facebook: string;
  };
};

const DEFAULT_SETTINGS: StoreSettings = {
  storeName: "Fakingstore",
  currency: "COP",
  contactEmail: "",
  wompiPublicKey: "",
  socials: { instagram: "", tiktok: "", facebook: "" },
};

const settingsSchema = z.object({
  storeName: z.string().trim().min(2).max(80),
  // Opcional por compatibilidad: la tienda es COP-only y saveStoreSettings siempre escribe "COP".
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .max(3)
    .optional()
    .default("COP"),
  contactEmail: z.string().trim().email().max(255).optional().or(z.literal("")),
  wompiPublicKey: z.string().trim().max(255).optional(),
  socials: z
    .object({
      instagram: z.string().trim().max(255).optional(),
      tiktok: z.string().trim().max(255).optional(),
      facebook: z.string().trim().max(255).optional(),
    })
    .default({}),
});

function defaultStoreSettings(): StoreSettings {
  return { ...DEFAULT_SETTINGS, socials: { ...DEFAULT_SETTINGS.socials } };
}

export async function getStoreSettings(): Promise<StoreSettings> {
  const [row] = await db
    .select()
    .from(schema.storeSettings)
    .where(eq(schema.storeSettings.key, SETTINGS_KEY))
    .limit(1);

  if (!row) return defaultStoreSettings();

  const parsed = settingsSchema.safeParse(row.value ?? {});
  if (!parsed.success) return defaultStoreSettings();

  return { ...defaultStoreSettings(), ...parsed.data, socials: { ...defaultStoreSettings().socials, ...parsed.data.socials } };
}

export async function saveStoreSettings(input: unknown): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((e) => e.message).join("; ") };
  }

  const data = parsed.data;
  const value = {
    storeName: data.storeName,
    // La tienda vende solo en pesos colombianos (Wompi Colombia solo procesa COP).
    currency: "COP",
    contactEmail: data.contactEmail ?? "",
    wompiPublicKey: data.wompiPublicKey ?? "",
    socials: {
      instagram: data.socials?.instagram ?? "",
      tiktok: data.socials?.tiktok ?? "",
      facebook: data.socials?.facebook ?? "",
    },
  };

  const [existing] = await db
    .select({ id: schema.storeSettings.id })
    .from(schema.storeSettings)
    .where(eq(schema.storeSettings.key, SETTINGS_KEY))
    .limit(1);

  if (existing) {
    await db
      .update(schema.storeSettings)
      .set({ value: value as object, updatedAt: new Date() })
      .where(eq(schema.storeSettings.id, existing.id));
  } else {
    await db.insert(schema.storeSettings).values({ key: SETTINGS_KEY, value: value as object });
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}

const wompiSettingsSchema = z.object({
  env: z.enum(["sandbox", "production"]),
  publicKey: z.string().trim().max(255),
  integritySecret: z.string().max(512).optional(),
  eventsSecret: z.string().max(512).optional(),
});

export type WompiSettingsAdmin = {
  env: "sandbox" | "production";
  publicKey: string;
  publicKeyLast4: string;
  configured: boolean;
  integritySecretSet: boolean;
  integritySecretLast4: string;
  eventsSecretSet: boolean;
  eventsSecretLast4: string;
};

export async function getWompiSettings(): Promise<WompiSettingsAdmin> {
  await requireAdmin();

  const [row] = await db
    .select()
    .from(schema.storeSettings)
    .where(eq(schema.storeSettings.key, WOMPI_SETTINGS_KEY))
    .limit(1);

  const stored = (row?.value ?? {}) as Record<string, unknown>;
  const env = stored.env === "production" ? "production" : "sandbox";
  const publicKey = typeof stored.publicKey === "string" ? stored.publicKey : "";
  const integrityEnc = typeof stored.integritySecret === "string" ? stored.integritySecret : "";
  const eventsEnc = typeof stored.eventsSecret === "string" ? stored.eventsSecret : "";
  const integritySecret = integrityEnc ? decryptSecret(integrityEnc) : null;
  const eventsSecret = eventsEnc ? decryptSecret(eventsEnc) : null;

  return {
    env,
    publicKey,
    publicKeyLast4: publicKey.slice(-4),
    configured: !!(publicKey && integritySecret),
    integritySecretSet: !!integritySecret,
    integritySecretLast4: integritySecret?.slice(-4) ?? "",
    eventsSecretSet: !!eventsSecret,
    eventsSecretLast4: eventsSecret?.slice(-4) ?? "",
  };
}

export async function saveWompiSettings(input: unknown): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();

  const parsed = wompiSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((e) => e.message).join("; ") };
  }

  const { env, publicKey, integritySecret, eventsSecret } = parsed.data;

  const [row] = await db
    .select()
    .from(schema.storeSettings)
    .where(eq(schema.storeSettings.key, WOMPI_SETTINGS_KEY))
    .limit(1);

  const stored = (row?.value ?? {}) as Record<string, unknown>;

  const nextIntegrity = integritySecret
    ? encryptSecret(integritySecret)
    : typeof stored.integritySecret === "string"
      ? stored.integritySecret
      : "";
  const nextEvents = eventsSecret
    ? encryptSecret(eventsSecret)
    : typeof stored.eventsSecret === "string"
      ? stored.eventsSecret
      : "";

  const value = { env, publicKey, integritySecret: nextIntegrity, eventsSecret: nextEvents };

  if (row) {
    await db
      .update(schema.storeSettings)
      .set({ value: value as object, updatedAt: new Date() })
      .where(eq(schema.storeSettings.id, row.id));
  } else {
    await db.insert(schema.storeSettings).values({ key: WOMPI_SETTINGS_KEY, value: value as object });
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}