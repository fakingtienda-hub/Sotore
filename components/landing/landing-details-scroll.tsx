"use client";

import { useEffect, useRef, useState } from "react";

export function LandingDetailsScroll({
  content,
  stack,
}: {
  content: React.ReactNode;
  stack: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentWrapRef = useRef<HTMLDivElement>(null);
  const stackWrapRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const contentWrap = contentWrapRef.current;
    const stackWrap = stackWrapRef.current;
    if (!root || !contentWrap || !stackWrap) return;

    const mqlReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mqlDesktop = window.matchMedia("(min-width: 1024px)");

    const updateEnabled = () => {
      const reduce = mqlReduced.matches;
      const isDesktop = mqlDesktop.matches;
      setEnabled(!reduce && isDesktop);
    };

    updateEnabled();
    mqlReduced.addEventListener("change", updateEnabled);
    mqlDesktop.addEventListener("change", updateEnabled);

    let raf = 0;
    let lastProgress = -1;

    const setProgress = (p: number) => {
      const clamped = Math.max(0, Math.min(1, p));
      if (Math.abs(clamped - lastProgress) < 0.001) {
        lastProgress = clamped;
        return;
      }
      lastProgress = clamped;

      const stackEl = stackWrap;
      const contentEl = contentWrap;

      // Parallax ligero: la sección siguiente sube con un pequeño offset
      // para dar sensación de profundidad. Cubrimos ~92% del recorrido
      // manteniendo un ligero desplazamiento residual en "Qué incluye".
      const stackFactor = 0.92;
      const contentParallax = clamped * 8; // px aproximados
      const stackY = clamped * stackFactor * -100; // %

      stackEl.style.transform = `translate3d(0, ${stackY}%, 0)`;
      stackEl.style.willChange = clamped > 0.0001 && clamped < 0.9999 ? "transform" : "auto";
      stackEl.style.backfaceVisibility = "hidden";
      stackEl.style.transformStyle = "preserve-3d";

      contentEl.style.transform = `translate3d(0, ${-contentParallax}px, 0)`;
      contentEl.style.willChange = clamped > 0.0001 && clamped < 0.9999 ? "transform" : "auto";
      contentEl.style.backfaceVisibility = "hidden";
    };

    const compute = () => {
      const rect = root.getBoundingClientRect();
      const vh = window.innerHeight;
      const rootTop = rect.top;
      const rootHeight = rect.height;

      const total = rootHeight - vh;
      let progress = 0;
      if (total > 0) {
        progress = (vh - rootTop) / total;
      } else {
        progress = 0;
      }
      setProgress(progress);
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };

    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    compute();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      mqlReduced.removeEventListener("change", updateEnabled);
      mqlDesktop.removeEventListener("change", updateEnabled);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative">
      {/* Capa fija: "Qué incluye" */}
      <div
        className={
          enabled
            ? "lg:sticky lg:top-0 lg:z-0 lg:h-dvh lg:overflow-hidden"
            : "relative"
        }
      >
        <div
          ref={contentWrapRef}
          className={enabled ? "[backface-visibility:hidden] will-change-transform" : ""}
        >
          {content}
        </div>
      </div>

      {/* Capa que sube por encima: resto de secciones */}
      <div
        ref={stackWrapRef}
        className={
          enabled
            ? "relative z-10 lg:mt-[-100dvh] [backface-visibility:hidden] [transform-style:preserve-3d] will-change-transform"
            : "relative"
        }
      >
        {stack}
      </div>

      {enabled ? (
        <div aria-hidden="true" className="pointer-events-none h-[20vh] w-full" />
      ) : null}
    </div>
  );
}