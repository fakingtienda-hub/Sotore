import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

void config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Missing required environment variable: DATABASE_URL");
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./database/migrations",
  dialect: "postgresql",
  casing: "snake_case",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: databaseUrl,
  },
});