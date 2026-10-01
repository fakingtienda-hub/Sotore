import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth/server";

/* Los handlers se construyen de forma perezosa: `auth.handler` se leia en el
 * import y eso instantiaba betterAuth durante `next build`, que exige
 * AUTH_SECRET y DATABASE_URL en la maquina de compilacion. Vercel no las
 * tiene (`.env.local` esta en .gitignore), asi que el build moria con
 * "Failed to collect page data for /api/auth/[...all]". En runtime las
 * variables ya estan configuradas y el primer request las resuelve. */
function buildHandler(method: "GET" | "POST") {
  return (req: Parameters<ReturnType<typeof toNextJsHandler>["GET"]>[0]) =>
    toNextJsHandler(auth.handler)[method](req);
}

export const GET = buildHandler("GET");
export const POST = buildHandler("POST");
