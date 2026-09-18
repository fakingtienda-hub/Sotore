"use client";

import { type ReactNode, useLayoutEffect, useRef } from "react";

export function HeroPriceCrop({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    let raf = 0;
    const upd = () => {
      const root = ref.current;
      if (!root) return;
      const media = root.querySelector<HTMLElement>(".sf-hero-media");
      const img = root.querySelector<HTMLImageElement>(".sf-hero-media img");
      if (!media || !img || !img.naturalWidth) return;
      const mw = media.clientWidth || 0;
      const mh = media.clientHeight || 0;
      if (!mw || !mh) return;
      const imgAr = img.naturalWidth / img.naturalHeight;
      const boxAr = mw / mh;
      const crop = imgAr > boxAr ? Math.max(0, (mh - mw / imgAr) / 2) : 0;
      root.style.setProperty("--sf-crop", `${crop.toFixed(2)}px`);
    };

    const rootEl = ref.current;
    if (!rootEl) return;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(upd);
    });
    ro.observe(rootEl);
    const img = rootEl.querySelector<HTMLImageElement>(".sf-hero-media img");
    if (img) {
      ro.observe(img);
      img.addEventListener("load", upd);
    }
    upd();
    window.addEventListener("load", upd);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("load", upd);
      img?.removeEventListener("load", upd);
    };
  }, []);

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-xs lg:max-w-md">
      {children}
    </div>
  );
}