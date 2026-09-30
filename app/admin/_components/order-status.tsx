import {
  ORDER_FLAG_DESCRIPTION,
  ORDER_FLAG_LABEL,
  ORDER_STATUS_LABEL,
  type OrderFlag,
  type OrderStatus,
} from "@/lib/constants";

/**
 * Presentación de estado y anomalías de una orden. Antes estos mapas estaban
 * duplicados en `admin/page.tsx` y `admin/sales/page.tsx` (y los dos se
 * olvidaban de `expired`, que se veía como la palabra cruda en inglés). Aquí
 * hay una sola definición.
 */

const STATUS_TONE: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  declined: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  voided: "bg-muted text-muted-foreground",
  error: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  expired: "bg-muted text-muted-foreground",
};

/** Las anomalías van en rojo siempre: son dinero, no progreso normal. */
const FLAG_TONE: Record<OrderFlag, string> = {
  undelivered: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  amount_mismatch: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
};

const pill =
  "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap";

function isOrderStatusValue(value: string): value is OrderStatus {
  return value in ORDER_STATUS_LABEL;
}

export function OrderStatusBadge({ status }: { status: string }) {
  const label = isOrderStatusValue(status) ? ORDER_STATUS_LABEL[status] : status;
  const tone = isOrderStatusValue(status) ? STATUS_TONE[status] : STATUS_TONE.pending;
  return <span className={`${pill} ${tone}`}>{label}</span>;
}

/** Badges de anomalía, uno por flag. No renderiza nada si no hay ninguno. */
export function OrderFlagBadges({ flags }: { flags: readonly OrderFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <>
      {flags.map((flag) => (
        <span
          key={flag}
          className={`${pill} ${FLAG_TONE[flag]}`}
          title={ORDER_FLAG_DESCRIPTION[flag]}
        >
          {ORDER_FLAG_LABEL[flag]}
        </span>
      ))}
    </>
  );
}

export function OrderStatusCell({
  status,
  flags,
}: {
  status: string;
  flags: readonly OrderFlag[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <OrderStatusBadge status={status} />
      <OrderFlagBadges flags={flags} />
    </div>
  );
}
