# Fakingstore

Tienda digital para packs de productos digitales (patrones, videos, PDFs, ZIP, recursos gráficos) con mini CRM administrativo.

**Stack:** Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL (Drizzle ORM) · Wompi · Vercel / VPS

## Inicio rápido

```bash
cp .env.example .env.local   # completar valores reales
npm install
npm run dev
```

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Iniciar producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | Type-check sin emitir |

## Estructura del proyecto

```
app/
  (public)/      Landing, /store/[slug], /checkout/[slug]
  (auth)/        Login, setup-access
  (customer)/    Library, /library/[product]
  admin/         Dashboard, ventas, clientes, productos, cupones, landing, settings
  api/           payment/init, webhooks/wompi, files/[fileId]/download

components/      ui/, landing/, customer/, admin/, checkout/
lib/             db/, auth/, server/ (actions, storage, rate-limit, wompi), utils/ (cn, format), serverEnv, constants
types/           Tipos de dominio compartidos
emails/          Plantillas transaccionales HTML
database/        Migraciones y seeds
```

## Base de datos en serverless (Supabase)

La app debe conectarse por el **pooler en modo transaccion** (puerto `6543`), que es
lo que publica la integracion como `POSTGRES_URL`.

```bash
# lo publica la integracion de Supabase en Vercel
POSTGRES_URL=postgresql://usuario:clave@aws-0-<region>.pooler.supabase.com:6543/postgres
```

Configurar `DATABASE_URL` apuntando al puerto `5432` (modo sesion) hace que el pool
reutilice conexiones que el pooler ya cerro. Las consultas fallan con
`Failed query` sin detalle y las paginas del admin devuelven `500` de forma
intermitente, primero con trafico concurrente y luego de forma permanente.
`DATABASE_URL` queda solo como respaldo para desarrollo local.

## Variables de entorno

Ver [.env.example](./.env.example) para la lista completa documentada.

## Fases de desarrollo

| Fase | Descripción |
|------|-------------|
| **1 ✓** | Arquitectura + proyecto base (esta entrega) |
| **2 ✓** | Base de datos + autenticación |
| **3 ✓** | CRUD productos |
| **4 ✓** | Storage y archivos |
| **5 ✓** | Landing page editable |
| **6 ✓** | Checkout + cupones |
| **7 ✓** | Integración Wompi |
| **8 ✓** | Webhook + validación de pagos |
| **9 ✓** | Entrega automática |
| **10 ✓** | Biblioteca del cliente |
| **11 ✓** | CRM administrativo |
| 12 | Emails transaccionales (console ✓; Resend/SMTP en producción pendiente) |
| 13 | Analytics + Meta Pixel |
| **14 ✓** | Seguridad + pruebas (auditoría de arquitectura completa) |
| **15 ✓** | Optimización + deploy (deploy en producción y storage durable en R2 ✓) |

## Estado actual

Producción: **https://sotore-psi.vercel.app** (Vercel, deploy automático desde `main`).

- Base de datos en Supabase: 10 migraciones aplicadas, 17 tablas.
- Landing con **tema `premium` por defecto** (`DEFAULT_LANDING_THEME` en `lib/constants.ts`; el resto del código la referencia, no la vuelve a hardcodear).
- **Subida de archivos funcionando en producción.** Bucket R2 `productos-tienda` conectado y verificado con un navegador real.

### ✅ R2 conectado: cómo quedó y qué se aprende si hay que rehacerlo

Bucket **`productos-tienda`**, con las cuatro variables en Vercel (production y preview): `STORAGE_BUCKET`, `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`. CORS aplicado en el bucket.

El token es un **R2 Account API Token** con `Object Read & Write` limitado a ese bucket. Preferí *Account* sobre *User*: el de usuario queda inactivo si te sacan el rol de la cuenta y la tienda se deja de poder subir archivos sin causa aparente.

Verificado end-to-end contra producción: login en la UI → `POST /api/files/upload-url` devuelve la URL firmada → `PUT` directo a R2 → `200` → relectura por `/api/files/<storageKey>` → `200 image/png`. Sin errores de CORS en consola.

Tres cosas que hubo que resolver y que no son evidentes:

1. **La CSP bloqueaba la subida, no el CORS.** `connect-src 'self'` hacía que el navegador rechazara el `PUT` con `Refused to connect`, *antes* de cualquier petición. R2, el CORS y la firma ya estaban bien y el error se veía igual.
2. **Un source de host en CSP no incluye subdominios.** El cliente S3 direcciona en virtual-hosted style, así que la petición real va a `https://<bucket>.<endpoint>`, no a `https://<endpoint>`. Alcanzaba con agregar solo el origen del endpoint; hacía falta además la forma con comodín. `next.config.ts` deriva ambas de `STORAGE_ENDPOINT`.
3. **Las variables nuevas no aplican al deployment vivo.** Hay que redeployar después de cargarlas.

> Las credenciales van directo en el dashboard de Vercel. No pegarlas en el chat ni en archivos del repo, y rotar las que ya quedaron expuestas en conversaciones.


## Puesta en producción

El código está listo para producción; falta **configuración de entorno**. Checklist:

### Wompi (Web Checkout hospedado — no requiere llave privada)
| Variable | Requerido |
|----------|-----------|
| `WOMPI_ENV` | `production` (para pago real) |
| `NEXT_PUBLIC_WOMPI_PUBLIC_KEY` | Sí |
| `WOMPI_INTEGRITY_SECRET` | Sí |
| `WOMPI_EVENTS_SECRET` | Sí (sin él el webhook responde 503) |

> `WOMPI_PRIVATE_KEY` no se usa en el código; es un sobrante del ejemplo.

### Email
- `EMAIL_PROVIDER=resend` + `EMAIL_API_KEY` (implementado).
- `EMAIL_PROVIDER=smtp` **no está implementado** (`lib/email/send.ts` lanza error).
- `EMAIL_FROM` personalizable.

### Imprescindibles (además de Wompi/email)
- `NEXT_PUBLIC_APP_URL`: dominio real (lo usan los emails y la `redirect-url` del checkout).
- `DATABASE_URL`: Postgres gestionado.
- `AUTH_SECRET` / `BETTER_AUTH_SECRET`: generar uno por entorno; `.env.local` contiene valores versionados.
### Storage (archivos de producto y portadas)
- `lib/server/storage.ts` elige el driver en el primer uso: `R2Storage` (S3-compatible) si hay `STORAGE_ENDPOINT` + credenciales, si no `LocalStorage` (disco).
- **En Vercel el filesystem es de solo lectura salvo `/tmp`**, así que sin `STORAGE_*` configuradas toda subida falla con `500`. Para desarrollo local alcanza con el driver de disco.
- `STORAGE_BUCKET`, `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`: credenciales de R2 (o cualquier S3-compatible).
- Los archivos grandes se suben con **PUT directo al bucket** contra una URL presignada (`POST /api/files/upload-url`), porque Vercel corta el body de una request en ~4,5 MB. El cliente (`lib/client/upload.ts`) elige esa vía automáticamente y cae a la ruta proxied `POST /api/files/upload` cuando no hay bucket.
- Las imágenes se sirven siempre por la app (`/api/files/<storageKey>`), así que el bucket puede ser privado: no hace falta CORS para leerlas, solo para la subida directa.

La BD se gestiona con migraciones de Drizzle (`npm run db:generate`, `npm run db:migrate`), aplicadas y verificadas contra Supabase.
