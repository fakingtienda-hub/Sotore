import { eq } from "drizzle-orm";
import { exit } from "node:process";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

async function main() {
  const admins = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      role: schema.users.role,
      emailVerified: schema.users.emailVerified,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.role, "admin"));

  console.log("=== admins en BD (email | rol | emailVerificado | creado) — NUNCA passwords ===");
  if (admins.length === 0) {
    console.log("(no hay ningún admin todavía → corre `npm run db:seed`)");
  }
  for (const a of admins) {
    console.log(`${a.email} | ${a.role} | ${a.emailVerified ? "si" : "no"} | ${a.createdAt?.toISOString()}`);
  }

  const anyUsers = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  console.log(`\nexisten usuarios en users: ${anyUsers.length > 0 ? "si" : "no"}`);

  await db.$client.end?.();
  exit(0);
}

main().catch((e) => {
  console.error("ERROR:", e);
  exit(1);
});
