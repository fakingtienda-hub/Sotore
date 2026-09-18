import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

import { eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../lib/db/schema";

const databaseUrl = process.env.DATABASE_URL!;
const queryClient = postgres(databaseUrl, { prepare: false });
const db = drizzle(queryClient, { schema, casing: "snake_case" });

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx scripts/fase9-gettoken.ts <email>");
  process.exit(1);
}

async function main() {
  // Delete stale verifications for this email (older ones)
  const stale = await db
    .select({ id: schema.verifications.id })
    .from(schema.verifications)
    .where(like(schema.verifications.value, `%"email":"${email}"%`));

  if (stale.length > 0) {
    for (const row of stale) {
      await db.delete(schema.verifications).where(eq(schema.verifications.id, row.id));
    }
  }

  // Insert a fresh verification record (better-auth style)
  const token = `FSE2E-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  await db.insert(schema.verifications).values({
    id: crypto.randomUUID(),
    identifier: token,
    value: JSON.stringify({ email, name: "Cliente E2E" }),
    expiresAt: new Date(Date.now() + 600_000),
  });

  console.log(token);
  await queryClient.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
