import "dotenv/config";

import {
  generateIntegritySignature,
  normalizeWompiSecret,
  wompiCheckoutBlockReason,
  wompiKeyEnvironment,
  wompiSecretEnvironment,
  wompiSecretWarnings,
  type WompiConfig,
} from "../lib/server/wompi";

/**
 * Verifica la regla que impide cobrar dinero real creyendo que se está en
 * sandbox. En Wompi el checkout cobra según la LLAVE pública (`pub_prod_` vs
 * `pub_test_`), no según el selector de entorno, y las credenciales no se
 * mezclan entre ambientes. Son funciones puras: no se toca la pasarela.
 */

let failures = 0;

function assert(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures += 1;
}

/** Replica exacta de la derivación de `getWompiConfig` para probarla sin BD. */
function derive(
  declaredEnv: "sandbox" | "production",
  publicKey: string,
  integritySecret = "",
): Pick<WompiConfig, "configured" | "env" | "keyEnv" | "integrityEnv" | "envMismatch"> {
  const keyEnv = wompiKeyEnvironment(publicKey);
  return {
    configured: true,
    env: declaredEnv,
    keyEnv,
    integrityEnv: integritySecret ? wompiSecretEnvironment(integritySecret) : null,
    envMismatch: keyEnv !== null && keyEnv !== declaredEnv,
  };
}

function main() {
  console.log("== Detección de entorno: llave pública ==");
  assert("pub_test_ → sandbox", wompiKeyEnvironment("pub_test_abc123") === "sandbox");
  assert("pub_prod_ → production", wompiKeyEnvironment("pub_prod_xyz789") === "production");
  assert("mayúsculas → sandbox", wompiKeyEnvironment("PUB_TEST_ABC") === "sandbox");
  assert("espacios alrededor → production", wompiKeyEnvironment("  pub_prod_1 ") === "production");
  assert("llave privada (no pública) → null", wompiKeyEnvironment("prv_test_123") === null);
  assert("vacío → null", wompiKeyEnvironment("") === null);
  assert("formato desconocido → null", wompiKeyEnvironment("abc123") === null);

  console.log("\n== Detección de entorno: secretos ==");
  assert("test_integrity_ → sandbox", wompiSecretEnvironment("test_integrity_abc") === "sandbox");
  assert("prod_integrity_ → production", wompiSecretEnvironment("prod_integrity_abc") === "production");
  assert("test_events_ → sandbox", wompiSecretEnvironment("test_events_abc") === "sandbox");
  assert("prod_events_ → production", wompiSecretEnvironment("prod_events_abc") === "production");
  assert("secreto sin prefijo → null", wompiSecretEnvironment("a1b2c3d4") === null);
  assert("vacío → null", wompiSecretEnvironment("") === null);

  console.log("\n== Guard de checkout ==");
  const danger = derive("sandbox", "pub_prod_REAL");
  const dangerReason = wompiCheckoutBlockReason(danger);
  assert("sandbox declarado + llave de producción BLOQUEA", dangerReason !== null);
  assert(
    "el motivo advierte del cobro real",
    !!dangerReason && dangerReason.includes("dinero real"),
    dangerReason ?? "",
  );
  assert(
    "el motivo nombra la llave de producción",
    !!dangerReason && dangerReason.includes("pub_prod_"),
    dangerReason ?? "",
  );

  const reverse = derive("production", "pub_test_TEST");
  const reverseReason = wompiCheckoutBlockReason(reverse);
  assert("producción declarado + llave de pruebas BLOQUEA", reverseReason !== null);
  assert(
    "el motivo explica el rechazo de la pasarela",
    !!reverseReason && reverseReason.includes("rechazado"),
    reverseReason ?? "",
  );

  const mixedSecret = derive("sandbox", "pub_test_KEY", "prod_integrity_SEC");
  const mixedReason = wompiCheckoutBlockReason(mixedSecret);
  assert("llave de pruebas + integridad de producción BLOQUEA", mixedReason !== null);
  assert(
    "el motivo explica que la firma fallaría",
    !!mixedReason && mixedReason.includes("firma"),
    mixedReason ?? "",
  );

  assert("sandbox coherente NO bloquea", wompiCheckoutBlockReason(derive("sandbox", "pub_test_a")) === null);
  assert(
    "producción coherente NO bloquea",
    wompiCheckoutBlockReason(derive("production", "pub_prod_a")) === null,
  );
  assert(
    "credenciales coherentes con secretos NO bloquea",
    wompiCheckoutBlockReason(derive("sandbox", "pub_test_a", "test_integrity_b")) === null,
  );
  assert("llave no reconocible NO bloquea", wompiCheckoutBlockReason(derive("sandbox", "abc")) === null);
  assert(
    "secreto sin prefijo NO bloquea (no se asume nada)",
    wompiCheckoutBlockReason(derive("sandbox", "pub_test_a", "sin_prefijo")) === null,
  );
  assert(
    "sin configurar NO bloquea (se muestra \"no configurada\")",
    wompiCheckoutBlockReason({
      configured: false,
      env: "sandbox",
      keyEnv: "production",
      integrityEnv: "production",
      envMismatch: true,
    }) === null,
  );

  console.log("\n== Firma de integridad: concatenación y normalización ==");
  // Vector EXACTO de la documentación oficial de Wompi (Widget & Checkout Web
  // → «Paso 3: Genera una firma de integridad»). Ancla el orden
  // referencia+monto+moneda+secreto y el algoritmo SHA-256.
  assert(
    "coincide con el vector oficial de Wompi (referencia+monto+moneda+secreto)",
    generateIntegritySignature(
      { reference: "sk8-438k4-xmxm392-sn2m", amountInCents: 2490000, currency: "COP" },
      "prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6",
    ) === "37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5",
  );

  const baseSigInput = { reference: "FS-ABC-123", amountInCents: 2490000, currency: "COP" };
  const cleanSig = generateIntegritySignature(baseSigInput, "test_integrity_abc");
  assert(
    "secreto con salto de línea final produce la MISMA firma (se recorta)",
    generateIntegritySignature(baseSigInput, "test_integrity_abc\n") === cleanSig,
  );
  assert(
    "secreto con espacios a ambos lados produce la MISMA firma",
    generateIntegritySignature(baseSigInput, "  test_integrity_abc  ") === cleanSig,
  );
  assert(
    "un secreto distinto SÍ cambia la firma",
    generateIntegritySignature(baseSigInput, "test_integrity_xyz") !== cleanSig,
  );
  assert("normalizeWompiSecret recorta los extremos", normalizeWompiSecret("  abc\n") === "abc");

  console.log("\n== Diagnóstico de secretos mal pegados ==");
  assert(
    "llave privada (prv_…) en el campo del secreto se detecta",
    wompiSecretWarnings({ integritySecret: "prv_test_abc", eventsSecret: "" }).some((w) =>
      w.includes("LLAVE PRIVADA"),
    ),
  );
  assert(
    "integridad y eventos con el mismo valor se detecta",
    wompiSecretWarnings({
      integritySecret: "test_integrity_a",
      eventsSecret: "test_integrity_a",
    }).some((w) => w.includes("MISMO valor")),
  );
  assert(
    "espacios internos en el secreto se detectan",
    wompiSecretWarnings({ integritySecret: "test integrity abc", eventsSecret: "" }).some((w) =>
      w.includes("espacios"),
    ),
  );
  assert(
    "secretos sanos y distintos no generan avisos",
    wompiSecretWarnings({ integritySecret: "test_integrity_a", eventsSecret: "test_events_b" }).length ===
      0,
  );

  console.log(`\n${failures === 0 ? "TODO OK" : `${failures} FALLOS`}`);
  if (failures > 0) process.exitCode = 1;
}

main();
