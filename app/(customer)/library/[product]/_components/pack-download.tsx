import Link from "next/link";

import { formatFileSize } from "@/lib/utils/format";

type PackDownloadProps = {
  product: {
    id: string;
    title: string;
    coverImageUrl: string | null;
    zipSizeBytes: number | null;
  };
  fileCount: number;
};

/**
 * Vista de biblioteca para el cliente final: una imagen del pack y un botón de
 * descarga. A propósito NO se listan los archivos sueltos.
 *
 * Además de simplificar la pantalla, evita exponer la estructura interna de
 * carpetas del producto y reduce el número de peticiones: antes había una por
 * archivo para miniatura y preview. El contenido sigue siendo el mismo ZIP de
 * siempre, servido por `/api/products/[productId]/pack`.
 *
 * El botón es un enlace plano, no un `fetch` + blob: el pack puede pesar cientos
 * de MB y así el navegador gestiona la descarga sin pasar los bytes por JS.
 */
export function PackDownload({ product, fileCount }: PackDownloadProps) {
  const fileLabel = fileCount === 1 ? "1 archivo" : `${fileCount.toLocaleString("es-CO")} archivos`;
  const size = product.zipSizeBytes && product.zipSizeBytes > 0 ? formatFileSize(product.zipSizeBytes) : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
      <Link
        href="/library"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        &larr; Mi biblioteca
      </Link>

      <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">{product.title}</h1>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {product.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.coverImageUrl}
            alt={product.title}
            className="aspect-video w-full object-cover"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-secondary text-6xl opacity-40" aria-hidden>
            📦
          </div>
        )}

        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-foreground">Pack completo</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {fileLabel}
              {size ? ` · ${size}` : ""}
            </p>
          </div>

          <a
            href={`/api/products/${product.id}/pack`}
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Descargar pack
          </a>
        </div>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        Recibes un único archivo ZIP con todo el contenido del pack. Descomprímelo con la app de tu
        dispositivo y conservás el acceso mientras la compra esté activa.
      </p>
    </div>
  );
}
