import { isInlineSafeMime } from "../lib/server/media-policy";

let failures = 0;

function assert(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures += 1;
}

// Tipos que SÍ pueden servirse inline (sin capacidad de ejecución).
assert("image/png → inline", isInlineSafeMime("image/png") === true);
assert("image/jpeg → inline", isInlineSafeMime("image/jpeg") === true);
assert("image/gif → inline", isInlineSafeMime("image/gif") === true);
assert("image/webp → inline", isInlineSafeMime("image/webp") === true);
assert("application/pdf → inline", isInlineSafeMime("application/pdf") === true);
assert("application/x-pdf → inline", isInlineSafeMime("application/x-pdf") === true);
assert("video/mp4 → inline", isInlineSafeMime("video/mp4") === true);
assert("audio/mpeg → inline", isInlineSafeMime("audio/mpeg") === true);
assert("text/plain → inline", isInlineSafeMime("text/plain") === true);
assert("text/markdown → inline", isInlineSafeMime("text/markdown") === true);
assert("text/plain; charset=utf-8 → inline", isInlineSafeMime("text/plain; charset=utf-8") === true);

// Tipos que NUNCA se sirven inline (pueden ejecutar script o no son renderizables).
assert("image/svg+xml → attachment (XSS)", isInlineSafeMime("image/svg+xml") === false);
assert("image/svg+xml;charset=utf-8 → attachment", isInlineSafeMime("image/svg+xml;charset=utf-8") === false);
assert("text/html → attachment", isInlineSafeMime("text/html") === false);
assert("application/javascript → attachment", isInlineSafeMime("application/javascript") === false);
assert("text/xml → attachment", isInlineSafeMime("text/xml") === false);
assert("application/json → attachment", isInlineSafeMime("application/json") === false);
assert("application/zip → attachment", isInlineSafeMime("application/zip") === false);
assert("application/vnd.ms-excel → attachment", isInlineSafeMime("application/vnd.ms-excel") === false);
assert("application/octet-stream → attachment", isInlineSafeMime("application/octet-stream") === false);
assert("mayúsculas IMAGE/SVG+XML → attachment", isInlineSafeMime("IMAGE/SVG+XML") === false);
assert("application/vnd.ms-htmlhelp → attachment", isInlineSafeMime("application/vnd.ms-htmlhelp") === false);

// Entradas vacías.
assert("null → false", isInlineSafeMime(null) === false);
assert("undefined → false", isInlineSafeMime(undefined) === false);
assert("vacío → false", isInlineSafeMime("") === false);

if (failures > 0) {
  console.error(`\n${failures} verificación(es) FALLARON`);
  process.exit(1);
}
console.log("\nPolítica inline de entrega de archivos verificado (Fase 4).");