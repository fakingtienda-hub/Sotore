import { PaymentResultClient } from "./payment-result-client";

export const dynamic = "force-dynamic";

/**
 * Wompi devuelve al comprador añadiendo el id de la transacción a la URL de
 * retorno (`?id=…`). Según cómo componga la query sobre una URL que ya trae
 * `?order=`, ese parámetro puede llegar como `id` propio o pegado al valor de
 * `order` (`…?order=FS-X?id=01-…`). Se aceptan las dos formas para que el id
 * nunca se pierda (y `order` no quede contaminado, que rompería la titularidad).
 */
function normalizeReturnParams(raw: { order?: string; id?: string }): {
  order?: string;
  id?: string;
} {
  const { order, id } = raw;
  if (order && /[?&]/.test(order)) {
    const cut = order.search(/[?&]/);
    const embedded = new URLSearchParams(order.slice(cut + 1)).get("id") ?? undefined;
    return { order: order.slice(0, cut), id: id ?? embedded };
  }
  return { order, id };
}

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; result?: string; id?: string }>;
}) {
  const params = await searchParams;
  const { order, id } = normalizeReturnParams(params);
  const result = params.result;

  return (
    <div className="sf-fabric relative min-h-[60vh]">
      <div className="sf-wrap flex justify-center py-16">
        <div className="w-full max-w-lg">
          <PaymentResultClient orderCode={order} transactionId={id} initialResult={result} />
          {result && (
            <p className="sf-muted mt-5 text-center text-xs">Resultado de la transacción: {result}</p>
          )}
        </div>
      </div>
    </div>
  );
}
