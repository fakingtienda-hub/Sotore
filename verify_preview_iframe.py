"""Comprueba que la vista previa del admin puede cargar la landing en un iframe.

Reproduce el mecanismo exacto del preview: pagina same-origin que mete un
<iframe src="/"> y lee su contenido. Antes del arreglo, la CSP con
frame-ancestors 'none' hacia que el navegador rechazara el marco."""

import sys

from playwright.sync_api import sync_playwright

TARGET = "http://localhost:3000/"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    # La pagina anfitriona es la propia app, mismo origen que el preview.
    page.goto("http://localhost:3000/que-incluye", wait_until="domcontentloaded")

    page.evaluate(
        """() => {
            const f = document.createElement('iframe');
            f.id = 'preview';
            f.style.width = '1280px';
            f.style.height = '720px';
            f.src = '/';
            document.body.prepend(f);
        }"""
    )
    page.wait_for_timeout(3500)

    info = page.evaluate(
        """() => {
            const f = document.getElementById('preview');
            const doc = f && f.contentDocument;
            return {
                existe: !!f,
                conDoc: !!doc,
                alto: f ? f.getBoundingClientRect().height : 0,
                texto: doc && doc.body ? doc.body.innerText.replace(/\\s+/g, ' ').trim().slice(0, 90) : '',
                altoBody: doc && doc.body ? doc.body.scrollHeight : 0,
            };
        }"""
    )
    print("iframe creado   :", info["existe"])
    print("contentDocument :", info["conDoc"])
    print("tamano iframe   :", info["alto"], "px")
    print("alto del cuerpo :", info["altoBody"], "px")
    print("texto cargado   :", repr(info["texto"]))

    browser.close()

ok = info["conDoc"] and info["altoBody"] > 200 and len(info["texto"]) > 10
print()
print("OK: el preview carga la landing dentro del iframe." if ok else "FALLO: el iframe quedo vacio (bloqueado).")
sys.exit(0 if ok else 1)