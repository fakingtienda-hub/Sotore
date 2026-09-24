import { PaymentResultClient } from "./payment-result-client";

export const dynamic = "force-dynamic";

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; result?: string }>;
}) {
  const { order, result } = await searchParams;

  return (
    <div className="sf-fabric relative min-h-[60vh]">
      <div className="sf-wrap flex justify-center py-16">
        <div className="w-full max-w-lg">
          <PaymentResultClient orderCode={order} initialResult={result} />
          {result && (
            <p className="sf-muted mt-5 text-center text-xs">Resultado de la transacción: {result}</p>
          )}
        </div>
      </div>
    </div>
  );
}