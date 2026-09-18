import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../lib/db/schema";

async function main() {
  const databaseUrl = process.env.DATABASE_URL!;
  const queryClient = postgres(databaseUrl, { prepare: false });
  const db = drizzle(queryClient, { schema, casing: "snake_case" });

  const email = process.argv[2] ?? "fase11-crm@fakingstore.com";

  const [user] = await db
    .select({ id: schema.users.id, role: schema.users.role, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  console.log(JSON.stringify(user ?? null));
  await queryClient.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});