"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

// Sin `baseURL` a propósito: better-auth cae en "/api/auth" (relativo) y el
// navegador lo resuelve contra el origen actual. Así la sesión siempre viaja
// same-origin y un `NEXT_PUBLIC_APP_URL` obsoleto — por ejemplo un túnel de
// Cloudflare que ya expiró — no puede romper el login con un "Failed to fetch"
// que no dice nada útil.
//
// `NEXT_PUBLIC_APP_URL` sigue siendo la URL canónica de SERVIDOR: emails y la
// `redirect-url` de Wompi. No debería gobernar las llamadas del cliente.
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});

export const { signIn, signUp, signOut, useSession, magicLink } = authClient;

export type { User, Session } from "better-auth";