import Link from "next/link";

interface RoutePlaceholderProps {
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
}

export function RoutePlaceholder({
  title,
  description,
  backHref = "/",
  backLabel = "Volver al inicio",
}: RoutePlaceholderProps) {
  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-3xl flex-col items-start justify-center gap-6 px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">
        Fase 1 · Estructura lista
      </p>
      <h1 className="font-display text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
        {title}
      </h1>
      {description ? (
        <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      <Link
        href={backHref}
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {backLabel}
      </Link>
    </main>
  );
}