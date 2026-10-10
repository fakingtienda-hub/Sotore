"use client";

import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { AdminNav } from "./admin-nav";

/** Clave donde se recuerda si el menú quedó retraído en escritorio. */
const COLLAPSED_KEY = "fs-crm-nav-collapsed";

/** Mismo breakpoint que usa Tailwind para `md` (768px). */
const DESKTOP_QUERY = "(min-width: 768px)";

/** Evento propio para avisar a los suscriptores de un cambio en ESTA pestaña:
 *  el evento `storage` del navegador solo llega a las demás pestañas. */
const LOCAL_CHANGE_EVENT = "fs-crm-nav-change";

function subscribeCollapsed(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(LOCAL_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LOCAL_CHANGE_EVENT, callback);
  };
}

/** En el servidor siempre `false` (menú expandido); tras hidratar, React vuelve
 *  a leer el snapshot del cliente sin provocar desajuste de hidratación. */
const readCollapsedServer = () => false;

function readCollapsed() {
  return window.localStorage.getItem(COLLAPSED_KEY) === "1";
}

function writeCollapsed(value: boolean) {
  window.localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
}

function subscribeDesktop(callback: () => void) {
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

const readDesktopServer = () => false;

function readDesktop() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

export function AdminShell({ children }: { children: ReactNode }) {
  // Preferencia de escritorio: persistida en localStorage y leída como almacén
  // externo (evita setState dentro de un efecto y desajustes de hidratación).
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    readCollapsed,
    readCollapsedServer,
  );
  const isDesktop = useSyncExternalStore(subscribeDesktop, readDesktop, readDesktopServer);

  // Cajón móvil: estado de UI, no persistido. Al pasar a escritorio deja de
  // contar como abierto (por eso `drawerOpen` y no `mobileOpen` en el render),
  // así no hace falta un efecto que lo cierre.
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerOpen = mobileOpen && !isDesktop;
  // Riel de iconos: solo aplica al menú fijo de escritorio. En móvil el cajón
  // siempre muestra icono + texto.
  const compact = isDesktop && collapsed;

  // Mientras el cajón está abierto, el fondo no debe desplazarse.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  const toggleNav = () => {
    // Un mismo botón: en escritorio retrae/expande la columna; en móvil abre
    // o cierra el cajón.
    if (isDesktop) writeCollapsed(!collapsed);
    else setMobileOpen((value) => !value);
  };

  // Cerrar el cajón al pulsar cualquier enlace (cubre el caso de seguir en la
  // misma ruta, donde la navegación no cambia de página).
  const onSidebarClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!drawerOpen) return;
    if ((event.target as HTMLElement).closest("a")) setMobileOpen(false);
  };

  const navExpanded = isDesktop ? !collapsed : drawerOpen;

  // Sin conflicto de `display` en el mismo breakpoint: en móvil decide
  // abierto/cerrado y en `md` decide ancho completo (192px) o riel (64px).
  const sidebarMobile = drawerOpen
    ? "fixed inset-y-0 left-0 z-40 flex w-64 shadow-xl"
    : "hidden";
  const sidebarDesktop = collapsed
    ? "md:static md:flex md:w-16 md:shadow-none"
    : "md:static md:flex md:w-48 md:shadow-none";

  return (
    <div className="crm-scope flex min-h-screen bg-background">
      {drawerOpen ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 cursor-default bg-foreground/40 md:hidden"
        />
      ) : null}

      <aside
        id="admin-sidebar"
        aria-label="Menú del CRM"
        className={`flex-col overflow-hidden border-r border-border bg-card transition-[width] duration-200 ease-out ${sidebarMobile} ${sidebarDesktop}`}
        onClick={onSidebarClick}
      >
        <div
          className={`flex h-14 shrink-0 items-center border-b border-border ${
            compact ? "justify-center px-2" : "justify-between px-4 md:px-5"
          }`}
        >
          {compact ? (
            <span className="font-display text-lg font-semibold" title="Fakingstore">
              F
            </span>
          ) : (
            <>
              <span className="font-display text-lg font-semibold">Fakingstore</span>
              <button
                type="button"
                aria-label="Cerrar menú"
                onClick={() => setMobileOpen(false)}
                className="rounded-sm p-1.5 text-muted-foreground hover:bg-secondary hover:text-secondary-foreground md:hidden"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-5 w-5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </>
          )}
        </div>
        <Suspense fallback={<div className="flex-1" />}>
          <AdminNav compact={compact} onNavigate={() => setMobileOpen(false)} />
        </Suspense>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur md:px-6">
          <button
            type="button"
            onClick={toggleNav}
            aria-label="Mostrar u ocultar el menú"
            aria-expanded={navExpanded}
            aria-controls="admin-sidebar"
            title="Mostrar u ocultar el menú"
            className="rounded-sm p-1.5 text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-5 w-5">
              <rect x="2.5" y="4" width="15" height="1.6" rx="0.8" />
              <rect x="2.5" y="9.2" width="15" height="1.6" rx="0.8" />
              <rect x="2.5" y="14.4" width="15" height="1.6" rx="0.8" />
            </svg>
          </button>
          <span className={`font-display text-lg font-semibold ${compact ? "" : "md:hidden"}`}>
            Fakingstore
          </span>
        </header>

        <main className="flex-1 px-6 py-8 md:px-10">{children}</main>
      </div>
    </div>
  );
}
