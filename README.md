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
| 15 | Optimización + deploy (deploy en producción ✓; falta storage durable, ver abajo) |

## Estado actual

Producción: **https://sotore-psi.vercel.app** (Vercel, deploy automático desde `main`).

- Base de datos en Supabase: 10 migraciones aplicadas, 17 tablas.
- Landing con **tema `premium` por defecto** (`DEFAULT_LANDING_THEME` en `lib/constants.ts`; el resto del código la referencia, no la vuelve a hardcodear).
- Los archivos se guardan y se sirven, pero **no se pueden subir desde la nube**: falta el bucket. Abajo está el paso exacto.

### ⬜ Pendiente: configurar el bucket de R2 (bloquea la subida de portadas)

Es lo único que falta para poder subir una imagen de portada o un archivo de producto desde la UI. En producción la ruta proxied responde `500` con `"Error al escribir el archivo."` (el log de la función muestra el `EROFS` del filesystem de solo lectura).

1. En Cloudflare: **R2 → Create bucket** (por ejemplo `sotore-media`).
2. **Manage R2 API Tokens → Create API Token**, con *Object Read & Write* limitado a ese bucket. Devuelve Access Key ID, Secret Access Key y el endpoint S3.
3. En el bucket, **Settings → CORS** (necesario para la subida directa desde el navegador):

   ```json
   [{ "AllowedOrigins": ["https://sotore-psi.vercel.app"],
      "AllowedMethods": ["PUT", "GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600 }]
   ```

4. En Vercel (Settings → Environment Variables), agregar:

   | Variable | Valor |
   |----------|-------|
   | `STORAGE_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
   | `STORAGE_ACCESS_KEY_ID` | del token R2 |
   | `STORAGE_SECRET_ACCESS_KEY` | del token R2 |
   | `STORAGE_BUCKET` | nombre del bucket |

5. Redeploy y probar. Sin las variables, `POST /api/files/upload-url` responde `501` y el cliente usa la ruta proxied a propósito.

> Las credenciales van directo en el dashboard de Vercel; no pegarlas en el chat ni en `.env.local` versionado.


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
