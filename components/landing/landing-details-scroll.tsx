"use client";

import { useEffect, useRef } from "react";

export function LandingDetailsScroll({
  content,
  stack,
}: {
  content: React.ReactNode;
  stack: React.ReactNode | React.ReactNode[];
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
      sections.forEach((el, i) => {
        if (enabled) {
          el.classList.add("lg:sticky", "lg:top-0", "lg:snap-start");
          el.classList.remove("lg:relative");
          el.style.zIndex = String(5 + i);
        } else {
          el.classList.remove("lg:sticky", "lg:top-0", "lg:snap-start");
          el.classList.add("lg:relative");
          el.style.removeProperty("z-index");
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
        sections.forEach((el) => {
          const rect = el.getBoundingClientRect();
          const top = rect.top;
          const height = rect.height;
          if (height <= 0) return;

          const progress = Math.max(0, Math.min(1, (-top) / (height + vh * 0.15)));
          const parallax = progress * 8;
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

    // Tecla flecha: salto completo a siguiente/anterior sección
    const onKeyDown = (e: KeyboardEvent) => {
      const enabled = !mqlReduced.matches && mqlDesktop.matches;
      if (!enabled) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (e.repeat) return;

      const vh = window.innerHeight;
      const currentIndex = sections.findIndex((el) => {
        const rect = el.getBoundingClientRect();
        return rect.top <= vh * 0.1 && rect.bottom > vh * 0.1;
      });

      if (currentIndex < 0) return;

      let targetIndex = currentIndex;
      if (e.key === "ArrowDown") {
        targetIndex = Math.min(sections.length - 1, currentIndex + 1);
      } else {
        targetIndex = Math.max(0, currentIndex - 1);
      }

      if (targetIndex === currentIndex) return;

      e.preventDefault();
      sections[targetIndex].scrollIntoView({ behavior: "smooth", block: "start" });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKeyDown);
    onScroll();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
      mqlReduced.removeEventListener("change", update);
      mqlDesktop.removeEventListener("change", update);
    };
  }, []);

  const stackNodes = Array.isArray(stack) ? stack : [stack];

  return (
    <div ref={rootRef} className="relative scroll-smooth lg:snap-y lg:snap-mandatory">
      <div
        data-sf-pin-section
        className="relative lg:h-dvh lg:overflow-hidden lg:bg-[var(--sf-ink-2)] lg:snap-start"
      >
        {content}
      </div>

      {stackNodes.map((node, i) => (
        <div
          key={i}
          data-sf-pin-section
          className="relative lg:h-auto lg:min-h-dvh lg:bg-[var(--sf-ink)] lg:snap-start"
        >
          {node}
        </div>
      ))}
    </div>
  );
}