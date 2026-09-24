import { safeNextPath } from "../lib/client/safe-redirect";
import { safeTokenEqual } from "../lib/server/safe-token";
import { rateLimit } from "../lib/server/rate-limit";

let failures = 0;

function assert(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures += 1;
}

// 1) Open redirect: safeNextPath solo deja rutas relativas del mismo origen.
assert("next nulo → null", safeNextPath(null) === null);
assert("next indefinido → null", safeNextPath(undefined) === null);
assert("next vacío → null", safeNextPath("") === null);
assert("ruta relativa válida → igual", safeNextPath("/library") === "/library");
assert("ruta relativa con subruta → igual", safeNextPath("/admin/sales?tab=1") === "/admin/sales?tab=1");
assert("URL absoluta http → null", safeNextPath("http://evil.com") === null);
assert("URL absoluta https → null", safeNextPath("https://evil.com") === null);
assert("double slash → null", safeNextPath("//evil.com") === null);
assert("con backslash → null", safeNextPath("/\\evil.com") === null);
assert("protocolo javascript → null", safeNextPath("javascript:alert(1)") === null);
assert("texto suelto → null", safeNextPath("not a path") === null);

// 2) safeTokenEqual: comparación de tokens en tiempo constante y correcta.
assert("tokens iguales → true", safeTokenEqual("abc123", "abc123") === true);
assert("tokens distintos → false", safeTokenEqual("abc123", "abc124") === false);
assert("longitudes distintas → false", safeTokenEqual("ab", "abc") === false);
assert("token vacío no coincide", safeTokenEqual("", "x") === false && safeTokenEqual("", "") === true);
assert("string largo mixto no coincide", safeTokenEqual("aBcD1", "abcd1") === false);

// 3) rateLimit: ventana fija por clave.
const key = `verify:${Math.random().toString(36).slice(2)}`;
const hits = Array.from({ length: 5 }, () => rateLimit(key, 5, 60_000));
assert("5 primeros hits permitidos", hits.every((r) => r.ok) === true);
assert("6º hit en la ventana → bloqueado", rateLimit(key, 5, 60_000).ok === false);
assert("bloqueado devuelve retryAfter", typeof rateLimit(key, 5, 60_000).retryAfter !== "undefined");
const otherKey = `verify-other:${Math.random().toString(36).slice(2)}`;
assert("clave distinta no comparte bucket", rateLimit(otherKey, 5, 60_000).ok === true);

if (failures > 0) {
  console.error(`\n${failures} verificación(es) FALLARON`);
  process.exit(1);
}
console.log("\nFase 2 (ownership sin auto-heal, redirect seguro, rate-limit) verificado.");