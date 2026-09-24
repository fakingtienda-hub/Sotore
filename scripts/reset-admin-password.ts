import "dotenv/config";

import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import * as schema from "../lib/db/schema";
import { db } from "../lib/db";

/**
 * reset-admin-password.ts
 * ========================
 * Pone la contraseña del admin existente al valor que TÚ defines como
 * `ADMIN_PASSWORD` en `.env.local` (NO hay default: mínimo 12 caracteres,
 * si falta o es corto, aborta).
 *
 * Hashea con el MISMO algoritmo que usa el login (`better-auth/crypto`
 * hashPassword, igual que `scripts/seed.ts:32`), así que la nueva clave
 * entra directo.
 *
 * PRIVACIDAD: nunca imprime ni el valor de la clave ni su hash. Solo el
 * email del admin y confirmación de éxito.
 */

async function main() {
  const password = process.env.ADMIN_PASSWORD ?? "";

  if (password.length < 12) {
    console.error(
      "Define ADMIN_PASSWORD en .env.local (mínimo 12 caracteres) y corre de nuevo:",
    );
    console.error("  npm run reset:admin-password");
    return;
  }

  const [admin] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.role, "admin"))
    .limit(1);

  if (!admin) {
    console.error(
      "No existe ningún usuario admin. Corre primero `npm run db:seed`.",
    );
    return;
  }

  const passwordHash = await hashPassword(password);

  const [account] = await db
    .update(schema.accounts)
    .set({ password: passwordHash, updatedAt: new Date() })
    .where(
      and(
        eq(schema.accounts.userId, admin.id),
        eq(schema.accounts.providerId, "credential"),
      ),
    )
    .returning({ id: schema.accounts.id });

  if (!account) {
    console.error(
      "El admin no tiene una cuenta credential; crea la fila en accounts (providerId 'credential').",
    );
    return;
  }

  console.log("Contraseña de admin restablecida correctamente.");
  console.log(`Email de acceso: ${admin.email}`);
  console.log("Rol: " + admin.role);
  console.log("(el valor exacto de la contraseña no se muestra por seguridad)");
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exitCode = 1;
});
