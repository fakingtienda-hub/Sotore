import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/* La subida de archivos va directa al bucket con una URL presignada, o sea
   que el navegador hace un PUT cross-origin a STORAGE_ENDPOINT. Sin agregarlo
   a connect-src la CSP lo bloquea con "Refused to connect" y la subida falla
   aunque R2, el CORS y la firma estén correctos. Se deriva de la variable de
   entorno para no dejar el host hardcodeado. */
const storageOrigin = (() => {
  const raw = process.env.STORAGE_ENDPOINT;
  if (!raw) return "";
  try {
    return ` ${new URL(raw).origin}`;
  } catch {
    return "";
  }
})();

/* CSP de la app. Notas:
   - script-src necesita 'unsafe-inline' porque el App Router de Next inyecta
     el payload serializado del Flight stream en <script> inline. No hay
     recursos de terceros cargados (next/font se auto-aloja en la build).
   - 'unsafe-eval' solo en desarrollo: lo usa el HMR de Next.
   - form-action permite el Web Checkout hospedado de Wompi (el form de la
     pasarela se envía por GET a ese origen). */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  `connect-src 'self'${storageOrigin}${isProd ? "" : " ws: wss:"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.wompi.co",
].join("; ");

const nextConfig: NextConfig = {
  /* En desarrollo Next bloquea las peticiones cross-origin a assets y
     endpoints de dev salvo que el hostname esté listado aquí. Con un túnel
     (Cloudflare/ngrok) el origen es otro, así que se permite el dominio del
     túnel. Sin esto la página carga pero NO hidrata: los bloques `.sf-reveal`
     se quedan en opacity 0 y solo se ve el fondo y la cabecera. */
  allowedDevOrigins: ["*.trycloudflare.com"],
  /* mupdf (WASM + .wasm hermano) y sharp (addon nativo) se cargan desde
     node_modules en runtime; no deben compilarse/bundlearse en la build. */
  serverExternalPackages: ["mupdf", "sharp"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        // Áreas autenticadas/operativas: no deben indexarse ni seguirse.
        source: "/(admin|library)/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
