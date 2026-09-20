import Link from "next/link";

/**
 * Paginación con estética acorde al admin (texto pequeño, bordes sutiles).
 * `href(p)` devuelve la URL COMPLETA para la página p (con la query ya incluida).
 * Solo se muestra si hay más de una página.
 */
export function Pagination({
  href,
  page,
  totalPages,
}: {
  href: (page: number) => string;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm" aria-label="Paginación">
      <p className="text-xs text-muted-foreground">
        Página {page} de {totalPages}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={href(page - 1)}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            ← Anterior
          </Link>
        ) : (
          <span className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground opacity-50" aria-disabled>
            ← Anterior
          </span>
        )}
        {page < totalPages ? (
          <Link
            href={href(page + 1)}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Siguiente →
          </Link>
        ) : (
          <span className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground opacity-50" aria-disabled>
            Siguiente →
          </span>
        )}
      </div>
    </nav>
  );
}