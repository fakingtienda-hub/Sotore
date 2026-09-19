import type { NextConfig } from "next";

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
};

export default nextConfig;
