"use client";

import { useEffect, useRef } from "react";

/**
 * Página de detalles (`/que-incluye`): cada sección ocupa el alto del viewport y
 * el pasaje entre secciones es de a una (snap del documento + flechas).
 *
 * Antes esto usaba `position: sticky` + parallax, pero el snap vivía en un div
 * que no era el contenedor de scroll, así que nunca enganchaba y el parallax
 * quedaba a medias. Ahora el snap se aplica al documento (`html`), de modo que
 * scroll y flechas avanzan exactamente una sección.
 */
const SNAP_CLASS = "sf-details-snap";

export function LandingDetailsScroll({
  content,
  stack,
}: {
  content: React.ReactNode;
  stack: React.ReactNode | React.ReactNode[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stackNodes = Array.isArray(stack) ? stack : [stack];
  const nodes = [content, ...stackNodes].filter(Boolean);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const mqlDesktop = window.matchMedia("(min-width: 1024px)");
    const mqlReduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    const sections = () =>
      Array.from(root.querySelectorAll<HTMLElement>("[data-sf-snap]"));

    const headerHeight = () => {
      const header = document.querySelector<HTMLElement>(".storefront > header");
      return header ? header.offsetHeight : 0;
    };

    // Con un desplegable (FAQ) abierto el snap se apaga para poder leer la
    // respuesta completa; al cerrarlo, vuelve a paginar.
    const syncSnap = () => {
      const openDetails = root.querySelector("details[open]");
      document.documentElement.classList.toggle(
        SNAP_CLASS,
        mqlDesktop.matches && !openDetails,
      );
    };

    syncSnap();
    mqlDesktop.addEventListener("change", syncSnap);

    const details = Array.from(root.querySelectorAll("details"));
    details.forEach((d) => d.addEventListener("toggle", syncSnap));

    const currentIndex = () => {
      const target = window.scrollY + headerHeight() + 1;
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      sections().forEach((el, i) => {
        const top = el.getBoundingClientRect().top + window.scrollY;
        const dist = Math.abs(top - target);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      return best;
    };

    // Flechas: salto completo a la sección siguiente/anterior.
    const onKeyDown = (e: KeyboardEvent) => {
      if (!mqlDesktop.matches || mqlReduced.matches) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (e.repeat) return;

      const els = sections();
      if (els.length === 0) return;

      const current = currentIndex();
      const next =
        e.key === "ArrowDown"
          ? Math.min(els.length - 1, current + 1)
          : Math.max(0, current - 1);
      if (next === current) return;

      e.preventDefault();
      els[next].scrollIntoView({ behavior: "smooth", block: "start" });
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      mqlDesktop.removeEventListener("change", syncSnap);
      details.forEach((d) => d.removeEventListener("toggle", syncSnap));
      document.documentElement.classList.remove(SNAP_CLASS);
    };
  }, []);

  return (
    <div ref={rootRef}>
      {nodes.map((node, i) => (
        <div
          key={i}
          data-sf-snap
          className={[
            "sf-snap-section",
            i % 2 === 1 ? "bg-[var(--sf-ink-2)]" : "bg-[var(--sf-ink)]",
            i > 0 ? "border-t border-[var(--sf-line)]" : "",
          ].join(" ")}
        >
          {node}
        </div>
      ))}
    </div>
  );
}
