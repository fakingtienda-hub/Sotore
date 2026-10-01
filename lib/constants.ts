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
    description: "Tinta café, papel crema e hilo rojo.",
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
    description: "Fondo oscuro grafito con acento dorado y textura de puntos (por defecto).",
  },
] as const;
export type LandingTheme = (typeof LANDING_THEMES)[number]["value"];
/** Tema por defecto. Vive acá y en ningun otro lado: el resto del codigo
 *  (formulario de producto, default de la columna, fallback de la landing)
 *  referencia esta constante para que no vuelvan a divergir. */
export const DEFAULT_LANDING_THEME: LandingTheme = "premium";

export function isLandingTheme(value: string | null | undefined): value is LandingTheme {
  return LANDING_THEMES.some((t) => t.value === value);
}

// `expired` lo escribe `expireStalePendingOrders`. Antes faltaba aquí, y como
// `parseStatus` (crm) valida contra esta lista, esas órdenes no se podían ni
// filtrar ni etiquetar en el panel (salían como "expired" en inglés).
export const ORDER_STATUSES = [
  "pending",
  "approved",
  "declined",
  "voided",
  "error",
  "expired",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  declined: "Rechazada",
  voided: "Anulada",
  error: "Error",
  expired: "Vencida",
};

export function isOrderStatus(value: string | undefined | null): value is OrderStatus {
  return !!value && (ORDER_STATUSES as readonly string[]).includes(value);
}

/**
 * Anomalías de una orden: requieren intervención humana, no son progreso
 * normal. Las definiciones viven aquí (no en el módulo de servidor) para que las
 * puedan consumir también los componentes cliente del panel.
 *
 *   - `undelivered`: pago aprobado sin acceso activo entregado.
 *   - `amount_mismatch`: el cobro no cuadra con el importe de la orden, así que
 *     no se aprobó. Dinero en disputa: nunca se repara solo.
 */
export const ORDER_FLAGS = ["undelivered", "amount_mismatch"] as const;
export type OrderFlag = (typeof ORDER_FLAGS)[number];

export const ORDER_FLAG_LABEL: Record<OrderFlag, string> = {
  undelivered: "Sin entregar",
  amount_mismatch: "Monto no coincide",
};

export const ORDER_FLAG_DESCRIPTION: Record<OrderFlag, string> = {
  undelivered:
    "Pago aprobado, pero el comprador aún no tiene acceso activo a algún producto de la orden. La reconciliación lo repara; si persiste, revisa los logs de entrega.",
  amount_mismatch:
    "Wompi reportó un pago cuyo monto o moneda no coinciden con la orden, así que no se aprobó. Requiere revisión manual.",
};

export function isOrderFlag(value: string | undefined | null): value is OrderFlag {
  return !!value && (ORDER_FLAGS as readonly string[]).includes(value);
}

export const COUPON_TYPES = ["percentage", "fixed"] as const;
export type CouponType = (typeof COUPON_TYPES)[number];