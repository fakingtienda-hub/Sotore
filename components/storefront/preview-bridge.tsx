"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Puente de la vista previa del editor de la landing.
 *
 * SOLO actúa cuando la página está embebida en un iframe (el editor en
 * `/admin/landing`). Escucha mensajes del padre y hace `router.refresh()`, que
 * vuelve a renderizar los Server Components **sin recargar la página**: conserva
 * el scroll y el estado de los componentes cliente. En la página pública normal
 * (sin iframe) no hace nada.
 *
 * Seguridad: solo acepta mensajes del **mismo origen**, y del mismo modo envía
 * su aviso de listo. No interpreta HTML ni ejecuta nada del contenido recibido.
 */
export function PreviewBridge() {
  const router = useRouter();

  useEffect(() => {
    // Fuera de un iframe no hay editor al que responder.
    if (window.parent === window) return;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; anchor?: string } | null;
      if (!data || typeof data !== "object") return;

      if (data.type === "sf:refresh") {
        router.refresh();
        return;
      }

      if (data.type === "sf:scroll") {
        const anchor = typeof data.anchor === "string" ? data.anchor : "";
        if (anchor) {
          document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }
    };

    // Edición visual: un clic sobre un elemento anotado con `data-sf-edit`
    // (p. ej. "hero.title") avisa al editor para que abra ese campo. Se captura
    // en fase de captura y se corta el evento para no disparar enlaces/botones
    // reales (checkout incluido) desde la vista previa.
    const onClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest?.("[data-sf-edit]");
      if (!target) return;
      const field = target.getAttribute("data-sf-edit");
      if (!field) return;
      event.preventDefault();
      event.stopPropagation();
      window.parent.postMessage({ type: "sf:focus", field }, window.location.origin);
    };

    // Resaltado al pasar el ratón por los campos editables.
    const style = document.createElement("style");
    style.textContent =
      "[data-sf-edit]:hover{outline:2px dashed #18ff00;outline-offset:2px;cursor:pointer}";
    document.head.appendChild(style);

    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick, true);
    // Avisa al editor de que el preview ya montó, para que alinee el scroll con
    // la sección que se está editando (el postMessage inicial se perdería).
    window.parent.postMessage({ type: "sf:ready" }, window.location.origin);

    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick, true);
      style.remove();
    };
  }, [router]);

  return null;
}
