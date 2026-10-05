"use client";

import { useEffect, useRef } from "react";

export function LandingDetailsScroll({
  content,
  stack,
}: {
  content: React.ReactNode;
  stack: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const mqlReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mqlDesktop = window.matchMedia("(min-width: 1024px)");

    const sections = Array.from(
      root.querySelectorAll<HTMLElement>("[data-sf-pin-section]")
    );

    const update = () => {
      const enabled = !mqlReduced.matches && mqlDesktop.matches;
      sections.forEach((el) => {
        if (enabled) {
          el.classList.add("lg:sticky", "lg:top-0", "lg:z-10");
          el.classList.remove("lg:relative");
        } else {
          el.classList.remove("lg:sticky", "lg:top-0", "lg:z-10");
          el.classList.add("lg:relative");
        }
        el.style.removeProperty("transform");
        el.style.removeProperty("will-change");
      });
    };

    update();
    mqlReduced.addEventListener("change", update);
    mqlDesktop.addEventListener("change", update);

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const enabled = !mqlReduced.matches && mqlDesktop.matches;
        if (!enabled) return;

        const vh = window.innerHeight;
        sections.forEach((el, i) => {
          const rect = el.getBoundingClientRect();
          const top = rect.top;
          const height = rect.height;
          if (height <= 0) return;

          // Progreso mientras esta sección está "pinneada" (top <= 0)
          // Progreso 0 = empieza a cubrir, progreso 1 = ha pasado casi todo
          const progress = Math.max(0, Math.min(1, (-top) / (height + vh * 0.1)));
          const parallax = progress * 12; // px, muy ligero
          el.style.transform = `translate3d(0, ${-parallax}px, 0)`;
          el.style.willChange = progress > 0 && progress < 1 ? "transform" : "auto";
          el.style.backfaceVisibility = "hidden";
        });
      });
    };

    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(onScroll);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    onScroll();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      mqlReduced.removeEventListener("change", update);
      mqlDesktop.removeEventListener("change", update);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative">
      {/* Sección fija: Qué incluye */}
      <div data-sf-pin-section className="relative lg:h-dvh lg:overflow-hidden">
        {content}
      </div>

      {/* Secciones siguientes apiladas con sticky */}
      {Array.isArray(stack)
        ? stack
        : [stack].map((node, i) => (
            <div
              key={i}
              data-sf-pin-section
              className="relative lg:h-auto"
            >
              {node}
            </div>
          ))}
    </div>
  );
}