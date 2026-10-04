import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/* La subida de archivos va directa al bucket con una URL presignada, o sea
   que el navegador hace un PUT cross-origin a STORAGE_ENDPOINT. Sin agregarlo
   a connect-src la CSP lo bloquea con "Refused to connect" y la subida falla
   aunque R2, el CORS y la firma estén correctos. Se deriva de la variable de
   entorno para no dejar el host hardcodeado. */
const storageOrigins = (() => {
  const raw = process.env.STORAGE_ENDPOINT;
  if (!raw) return "";
  try {
    const { origin, hostname } = new URL(raw);
    /* El cliente S3 direcciona en virtual-hosted style, así que la petición
       real va a https://<bucket>.<host>. Un source de host en CSP no incluye
       los subdominios, por eso hace falta además la forma con comodín. */
    return ` ${origin} https://*.${hostname}`;
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
     pasarela se envía por GET a ese origen).
   - frame-ancestors va en 'self', NO en 'none': el editor de la landing en
     /admin/landing muestra la vista previa dentro de un <iframe src="/">, y
     con 'none' el navegador se la rechaza (queda el marco en blanco) aunque
     sea el mismo origen. 'self' sigue impidiendo que un sitio externo enclose
     la app, que es el ataque de clickjacking que esa directiva previene. */
const buildCsp = (frameAncestors: "'self'" | "'none'") =>
  [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    `connect-src 'self'${storageOrigins}${isProd ? "" : " ws: wss:"}`,
    "object-src 'none'",
    "base-uri 'self'",
    `frame-ancestors ${frameAncestors}`,
    "form-action 'self' https://checkout.wompi.co",
  ].join("; ");

const csp = buildCsp("'self'");
const cspLocked = buildCsp("'none'");

const nextConfig: NextConfig = {
  /* En desarrollo Next bloquea las peticiones cross-origin a assets y
     endpoints de dev salvo que el hostname esté listado aquí. Con un túnel
     (Cloudflare/ngrok) el origen es otro, así que se permite el dominio del
     túnel. Sin esto la página carga pero NO hidrata: los bloques `.sf-reveal`
     se quedan en opacity 0 y solo se ve el fondo y la cabecera. */
  allowedDevOrigins: ["*.trycloudflare.com"],
  /* Paquetes que se cargan desde node_modules en runtime en vez de
     empaquetarse en la función: reduce el bundle (menos cold start).
     - mupdf (WASM + .wasm hermano) y sharp (addon nativo): no se pueden
       compilar en la build.
     - archiver y los helpers de @aws-sdk: pesados y solo usados por la ruta
       del pack y el storage; `@aws-sdk/client-s3` y `sharp` ya los excluye
       Next por defecto, pero los listamos para que quede explícito. */
  serverExternalPackages: [
    "mupdf",
    "sharp",
    "archiver",
    "@aws-sdk/client-s3",
    "@aws-sdk/lib-storage",
    "@aws-sdk/s3-request-presigner",
  ],
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
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          /* Segunda cabecera CSP con frame-ancestors 'none'. Con varias cabeceras
             CSP el navegador las aplica TODAS y se queda con la más restrictiva:
             el admin sigue sin poder ser embebido ni por la propia app. */
          { key: "Content-Security-Policy", value: cspLocked },
        ],
      },
    ];
  },
};

export default nextConfig;
