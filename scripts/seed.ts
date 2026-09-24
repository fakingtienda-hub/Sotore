import { config } from "dotenv";

config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";

import * as schema from "../lib/db/schema";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/fakingstore";

const queryClient = postgres(databaseUrl, { prepare: false });
const db = drizzle(queryClient, { schema, casing: "snake_case" });

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@fakingstore.com";
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = process.env.ADMIN_NAME ?? "Admin Fakingstore";

  if (password.length < 12) {
    console.error(
      "Define ADMIN_PASSWORD en .env.local (mínimo 12 caracteres) y corre de nuevo: npm run db:seed",
    );
    process.exit(1);
  }

  const existing = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);

  if (existing.length > 0) {
    console.log(`Admin ya existe (${email}). Nada que hacer.`);
    return;
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  await db.transaction(async (tx) => {
    await tx.insert(schema.users).values({
      id: userId,
      email,
      emailVerified: true,
      name,
      role: "admin",
      status: "active",
    });

    await tx.insert(schema.accounts).values({
      id: crypto.randomUUID(),
      userId,
      accountId: userId,
      providerId: "credential",
      password: passwordHash,
    });
  });

  console.log(`Administrador creado: ${email} (rol: admin)`);
  console.log("(la contraseña no se muestra por seguridad)");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });