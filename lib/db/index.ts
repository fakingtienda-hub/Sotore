import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { serverEnv } from "@/lib/serverEnv";
import * as schema from "./schema";

const queryClient = postgres(serverEnv.databaseUrl, {
  max: serverEnv.databasePoolMax,
  prepare: false,
});

export const db = drizzle(queryClient, {
  schema,
  casing: "snake_case",
});

export type Db = typeof db;

export { schema };