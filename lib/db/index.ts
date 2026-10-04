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
    // En serverless la instancia es efímera pero puede reutilizarse minutos:
    // un cliente ocioso puede quedar apuntando a una conexión que el pooler ya
    // cerró (el README documenta el fallo intermitente de "Failed query").
    // Reciclamos por ocio y por edad, y limitamos el connect.
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
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
