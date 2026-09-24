import { createHash, createHmac } from "node:crypto";

import { verifyWompiEventChecksum } from "../lib/server/wompi";

type SignedPayload = {
  event: string;
  data: { transaction: Record<string, unknown> };
  timestamp: number;
  signature: { properties: string[]; checksum: string };
};

const EVENTS_SECRET = "test_events_verify_secret";
const checksumFor = (raw: string) =>
  createHash("sha256").update(raw, "utf8").digest("hex");

function resolvePath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (
      acc &&
      typeof acc === "object" &&
      key in (acc as Record<string, unknown>)
    ) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function signPayload(
  payload: Omit<SignedPayload, "signature">,
  secret: string,
): SignedPayload {
  const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
  const raw =
    properties
      .map((path) => {
        const value = resolvePath(payload.data, path);
        return value == null ? "" : String(value);
      })
      .join("") + String(payload.timestamp ?? "") + secret;
  return {
    ...payload,
    signature: {
      properties,
      checksum: checksumFor(raw).toUpperCase(),
    },
  };
}

let failures = 0;

function assert(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures += 1;
}

const basePayload = {
  event: "transaction.updated",
  data: {
    transaction: {
      id: "1234-1610641025-49201",
      status: "APPROVED",
      amount_in_cents: 4490000,
    },
  },
  timestamp: 1530291411,
};

const valid = signPayload(basePayload, EVENTS_SECRET);
assert(
  "checksum oficial válido (mayúsculas) se verifica",
  verifyWompiEventChecksum(valid, EVENTS_SECRET),
);

assert(
  "checksum en minúsculas también verifica",
  verifyWompiEventChecksum(
    { ...valid, signature: { ...valid.signature, checksum: valid.signature.checksum.toLowerCase() } },
    EVENTS_SECRET,
  ),
);

assert(
  "secret equivocado → rechaza",
  !verifyWompiEventChecksum(valid, "wrong_secret"),
);

const tamperedData = {
  ...valid,
  data: {
    transaction: {
      ...valid.data.transaction,
      amount_in_cents: 1,
    },
  },
};
assert(
  "monto manipulado (pierde firma) → rechaza",
  !verifyWompiEventChecksum(tamperedData, EVENTS_SECRET),
);

assert(
  "timestamp manipulado → rechaza",
  !verifyWompiEventChecksum({ ...valid, timestamp: valid.timestamp + 1 }, EVENTS_SECRET),
);

assert(
  "sin signature.properties → rechaza",
  !verifyWompiEventChecksum(
    { ...valid, signature: { properties: [], checksum: valid.signature.checksum } },
    EVENTS_SECRET,
  ),
);

const headerOnly = {
  ...valid,
  signature: { properties: valid.signature.properties, checksum: undefined as string | undefined },
};
assert(
  "checksum por header (override) verifica",
  verifyWompiEventChecksum(headerOnly, EVENTS_SECRET, valid.signature.checksum),
);

const wrongHmac = createHmac("sha256", EVENTS_SECRET)
  .update(JSON.stringify({ event: "transaction.updated" }), "utf8")
  .digest("hex");
assert(
  "estilo viejo HMAC(rawBody) NO pasa como checksum",
  !verifyWompiEventChecksum(
    { ...valid, signature: { ...valid.signature, checksum: wrongHmac } },
    EVENTS_SECRET,
  ),
);

if (failures > 0) {
  console.error(`\n${failures} verificación(es) FALLARON`);
  process.exit(1);
}
console.log("\nTodos los checksum de evento Wompi verifican correctamente.");