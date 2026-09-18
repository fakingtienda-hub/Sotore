"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

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
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).max(3),
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
    currency: data.currency,
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