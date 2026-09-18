import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/db/schema";

const databaseUrl = process.env.DATABASE_URL!;
const queryClient = postgres(databaseUrl, { prepare: false });
const db = drizzle(queryClient, { schema, casing: "snake_case" });

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx scripts/fase9-session-cookie.ts <email>");
  process.exit(1);
}

async function main() {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user) {
    console.error("USER_NOT_FOUND");
    process.exit(1);
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const [session] = await db
    .insert(schema.sessions)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      token: crypto.randomUUID(),
      expiresAt,
    })
    .returning({ token: schema.sessions.token });

  if (!session) {
    console.error("SESSION_INSERT_FAILED");
    process.exit(1);
  }

  console.log(session.token);
  await queryClient.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
