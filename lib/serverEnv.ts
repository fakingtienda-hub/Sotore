import { config } from "dotenv";

void config({ path: ".env.local" });

export type ServerEnv = {
  appUrl: string;
  databaseUrl: string;
  databasePoolMax: number;
  authSecret: string;
  emailProvider: "console" | "resend" | "smtp";
  emailApiKey: string;
  emailFrom: string;
  emailToTest: string;
  isProd: boolean;
  storageDir: string;
  storageBaseUrl: string;
  maxUploadBytes: number;
  wompiEnv: "sandbox" | "production";
  wompiPublicKey: string;
  wompiIntegritySecret: string;
  wompiEventsSecret: string;
  wompiApiUrl: string;
};

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  if (name === "AUTH_SECRET" && value.length < 32)
    throw new Error(
      "AUTH_SECRET must be at least 32 characters. Generate with: openssl rand -base64 32",
    );
  return value;
};

const optional = (name: string, fallback: string): string => process.env[name] ?? fallback;

const wompiEnvRaw = optional("WOMPI_ENV", "sandbox");
if (wompiEnvRaw !== "sandbox" && wompiEnvRaw !== "production") {
  throw new Error(`WOMPI_ENV debe ser 'sandbox' o 'production' (recibido: "${wompiEnvRaw}").`);
}

export const serverEnv: ServerEnv = {
  appUrl: optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
  databaseUrl: required("DATABASE_URL"),
  databasePoolMax: Number(optional("DATABASE_POOL_MAX", "5")),
  authSecret: required("AUTH_SECRET"),
  emailProvider: optional("EMAIL_PROVIDER", "console") as ServerEnv["emailProvider"],
  emailApiKey: optional("EMAIL_API_KEY", ""),
  emailFrom: optional("EMAIL_FROM", "Fakingstore <hola@fakingstore.com>"),
  emailToTest: optional("EMAIL_TO_TEST", "test@fakingstore.com"),
  storageDir: optional("STORAGE_DIR", "storage"),
  storageBaseUrl: optional("STORAGE_BASE_URL", "/api/files"),
  maxUploadBytes: Number(optional("STORAGE_MAX_FILE_BYTES", String(512 * 1024 * 1024))),
  wompiEnv: wompiEnvRaw as ServerEnv["wompiEnv"],
  wompiPublicKey: optional("NEXT_PUBLIC_WOMPI_PUBLIC_KEY", ""),
  wompiIntegritySecret: optional("WOMPI_INTEGRITY_SECRET", ""),
  wompiEventsSecret: optional("WOMPI_EVENTS_SECRET", ""),
  wompiApiUrl: optional("WOMPI_API_URL", ""),
  isProd: process.env.NODE_ENV === "production",
};