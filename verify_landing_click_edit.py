"""Verifica la edición visual de la landing (Fase 2).

Con la sesión de admin abierta:
  1. /admin/landing carga el preview en un iframe.
  2. Un clic sobre un elemento anotado con `data-sf-edit` (hero.title) debe
     saltar al paso "Hero" del asistente y enfocar el campo correspondiente.
  3. Igual para un ítem de lista (benefits.items.0.title), que abre el grupo
     "Lista de beneficios" y enfoca el campo del ítem.

Antes de Fase 2 un clic en el preview no hacía nada (o disparaba el enlace real).
"""

import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
EMAIL = "admin@fakingstore.com"
PASSWORD = "Fakingstore-Admin-2026!"

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"[{'OK' if ok else 'FALLO'}] {name}" + (f" — {detail}" if detail else ""))


def focus_id(page) -> str:
    return page.evaluate(
        """() => {
            const el = document.activeElement;
            return el && el.id ? el.id : (el ? el.tagName + ':' + (el.textContent||'').trim().slice(0,20) : 'none');
        }"""
    )


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1600, "height": 1000})

    # --- Sesión de admin ---
    # `networkidle` espera a la hidratación: si no, el submit lo maneja el
    # navegador (form nativo) antes de que React enganche el handler.
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill("#email", EMAIL)
    page.fill("#password", PASSWORD)
    page.click("button[type=submit]")
    page.wait_for_url("**/admin**", timeout=15000)
    check("login de admin", "/admin" in page.url, page.url)

    # --- Editor ---
    page.goto(f"{BASE}/admin/landing", wait_until="domcontentloaded")
    page.wait_for_selector("iframe[title='Vista previa de la landing']", timeout=15000)

    frame = page.frame_locator("iframe[title='Vista previa de la landing']")
    frame.locator("[data-sf-edit]").first.wait_for(state="attached", timeout=15000)
    page.wait_for_timeout(1500)  # deja montar el puente (sf:ready)

    # El paso inicial es "site": el campo hero aún no existe en el editor.
    check(
        "paso inicial = Sitio",
        page.locator("h2", has_text="Sitio · textos globales").count() == 1,
    )

    # Habilita clics en el preview (overlay lo bloquea por defecto).
    page.click("button[aria-label='Activar interacción en la vista previa']")
    page.wait_for_timeout(200)

    # --- Clic 1: hero.title ---
    frame.locator("[data-sf-edit='hero.title']").first.click()
    page.wait_for_timeout(900)
    check(
        "clic en hero.title abre el paso Hero",
        page.locator("h2", has_text="Hero").count() == 1,
    )
    check("hero.title enfoca el campo", focus_id(page) == "sf-field-hero-title", focus_id(page))

    # --- Clic 2: ítem de lista (benefits) ---
    page.goto(f"{BASE}/admin/landing?step=benefits", wait_until="domcontentloaded")
    page.wait_for_selector("iframe[title='Vista previa de la landing']", timeout=15000)
    frame = page.frame_locator("iframe[title='Vista previa de la landing']")
    frame.locator("[data-sf-edit='benefits.items.0.title']").wait_for(
        state="attached", timeout=15000
    )
    page.wait_for_timeout(1500)
    # La recarga reinicia el overlay de bloqueo de clics.
    page.click("button[aria-label='Activar interacción en la vista previa']")
    page.wait_for_timeout(200)
    # El preview de benefits es /que-incluye: el editor arranca en ese paso, así
    # que el grupo de la lista debe abrirse de todos modos por el pedido de foco.
    frame.locator("[data-sf-edit='benefits.items.0.title']").first.click()
    page.wait_for_timeout(900)
    check(
        "clic en benefits.items.0.title enfoca el ítem",
        focus_id(page) == "sf-item-benefits-0-title",
        focus_id(page),
    )

    browser.close()

failed = [r for r in results if not r[1]]
print()
if failed:
    print(f"FALLO: {len(failed)} de {len(results)} comprobaciones fallaron.")
    sys.exit(1)
print(f"OK: {len(results)}/{len(results)} comprobaciones pasaron.")
