import Link from "next/link";

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
          <div className="sf-card p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-[var(--sf-gold)] text-2xl" aria-hidden>
              💳
            </div>
            <h1 className="sf-title mt-6 text-4xl text-[var(--sf-paper)]">Pago en verificación</h1>
            <p className="sf-muted mt-3 leading-relaxed">
              Recibimos tu pago (o el intento de pago) y estamos confirmándolo con Wompi.
            </p>
            {order && (
              <p className="mx-auto mt-5 inline-block border-2 border-dashed border-[var(--sf-line-strong)] px-5 py-3 font-mono text-sm font-bold tracking-[0.25em] text-[var(--sf-paper)]">
                {order}
              </p>
            )}
            <p className="sf-muted mt-4 text-xs">
              El estado final de tu orden se confirma vía webhook. Te avisaremos por email y aparecerá en tu biblioteca.
            </p>
            <div className="mt-7 flex items-center justify-center gap-3">
              <Link href="/library" className="sf-btn">
                Ir a mi biblioteca
              </Link>
              <Link href="/" className="sf-btn sf-btn-ghost">
                Volver al inicio
              </Link>
            </div>
            {result && <p className="sf-muted mt-5 text-xs">Resultado de la transacción: {result}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}