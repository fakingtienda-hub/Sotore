import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { serverEnv } from "@/lib/serverEnv";
import * as schema from "./schema";

/** El cliente de postgres se crea en el primer uso, no al importar el módulo:
 *  `next build` importa las rutas para recoger page data y no debe exigir
 *  `DATABASE_URL` ni abrir conexiones durante la compilación. */
function createDb() {
  const queryClient = postgres(serverEnv.databaseUrl, {
    max: serverEnv.databasePoolMax,
    prepare: false,
  });
  return drizzle(queryClient, {
    schema,
    casing: "snake_case",
  });
}

type Db = ReturnType<typeof createDb>;

let instance: Db | null = null;

function dbInstance(): Db {
  instance ??= createDb();
  return instance;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(dbInstance(), prop, receiver);
  },
});

export type { Db };

export { schema };
