export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
export const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME ?? "Fakingstore";

export const USER_ROLES = ["customer", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["active", "disabled"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const PRODUCT_STATUSES = ["draft", "published", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const FILE_TYPES = ["video", "pdf", "zip", "image", "audio", "other"] as const;
export type FileType = (typeof FILE_TYPES)[number];

export const LANDING_THEMES = [
  {
    value: "costura",
    label: "Taller de costura",
    description: "Tinta café, papel crema e hilo rojo (actual).",
  },
  {
    value: "amigurumi",
    label: "Amigurumi pastel",
    description: "Algodón cálido: crema, coral y verde salvia.",
  },
  {
    value: "crochet",
    label: "Crochet de lino",
    description: "Blanco hueso con acento azul glaciar.",
  },
  {
    value: "premium",
    label: "Premium digital",
    description: "Fondo oscuro grafito con acento dorado y textura de puntos.",
  },
] as const;
export type LandingTheme = (typeof LANDING_THEMES)[number]["value"];
export const DEFAULT_LANDING_THEME: LandingTheme = "costura";

export function isLandingTheme(value: string | null | undefined): value is LandingTheme {
  return LANDING_THEMES.some((t) => t.value === value);
}

export const ORDER_STATUSES = ["pending", "approved", "declined", "voided", "error"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const COUPON_TYPES = ["percentage", "fixed"] as const;
export type CouponType = (typeof COUPON_TYPES)[number];