import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";

import { db, schema } from "@/lib/db";
import { wrapEmailLayout, sendEmail } from "@/lib/email/send";
import { serverEnv } from "@/lib/serverEnv";

export const auth = betterAuth({
  appName: "Fakingstore",
  baseURL: serverEnv.appUrl,
  secret: serverEnv.authSecret,
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema: {
      users: schema.users,
      sessions: schema.sessions,
      accounts: schema.accounts,
      verifications: schema.verifications,
    },
  }),
  // `appUrl` siempre entra; `AUTH_TRUSTED_ORIGINS` suma los orígenes extra
  // (localhost en desarrollo, un túnel de Cloudflare, un previews de Vercel).
  // better-auth compara contra el header `Origin` real del navegador, así que
  // basta con que el origen desde el que se entra esté en esta lista.
  trustedOrigins: [serverEnv.appUrl, ...serverEnv.authTrustedOrigins],
  advanced: {
    cookiePrefix: "fakingstore",
    defaultCookieAttributes: {
      httpOnly: true,
      secure: serverEnv.isProd,
      sameSite: "lax",
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "customer",
        input: false,
      },
      status: {
        type: "string",
        required: false,
        defaultValue: "active",
        input: false,
      },
      lastLoginAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Restablece tu contraseña",
        html: wrapEmailLayout(
          "Restablece tu contraseña",
          `<p>Hola ${user.name}, haz clic en el siguiente enlace para crear una nueva contraseña:</p>
           <p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#a83a1e;color:#fff;border-radius:6px;text-decoration:none;">Restablecer contraseña</a></p>`,
        ),
      });
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          return { data: { ...user, lastLoginAt: new Date() } };
        },
      },
    },
  },
  plugins: [
    nextCookies(),
    magicLink({
      expiresIn: 600,
      disableSignUp: true,
      sendMagicLink: async ({ email, url }) => {
        await sendEmail({
          to: email,
          subject: "Tu acceso a Fakingstore",
          html: wrapEmailLayout(
            "Accede a tu biblioteca",
            `<p>Usa este enlace para entrar a tu cuenta (válido por 10 minutos):</p>
             <p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#a83a1e;color:#fff;border-radius:6px;text-decoration:none;">Acceder</a></p>
             <p style="font-size:12px;color:#8a7a63;">Si no solicitaste este enlace, puedes ignorar este correo.</p>`,
          ),
        });
      },
    }),
  ],
});