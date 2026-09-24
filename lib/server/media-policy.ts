/**
 * Decisión de servir un archivo en línea vs. como adjunto en el endpoint de
 * vista. El `mimeType` de la BD (cliente) o el derivado de la extensión no son
 * fiables para renderizar inline: SVG/HTML/JS pueden ejecutar script en el
 * navegador del comprador. Solo se sirven inline los tipos sin capacidad de
 * ejecución; el resto (office, zip, rar, svg, html, …) va como attachment.
 * Módulo puro (sin `server-only`) para poder ejercitarlo desde scripts.
 */
export function isInlineSafeMime(mime: string | null | undefined): boolean {
  const base = (mime ?? "").trim().toLowerCase().split(";")[0].trim();
  if (!base) return false;

  if (base === "image/svg+xml") return false;
  if (base.startsWith("image/")) return true;
  if (base.startsWith("video/")) return true;
  if (base.startsWith("audio/")) return true;
  if (base === "application/pdf" || base === "application/x-pdf") return true;
  if (base === "text/plain" || base === "text/markdown") return true;
  return false;
}