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

Es lo único que falta para poder subir una imagen de portada o un archivo de producto desde la UI. En producción la ruta proxied responde `500` con `"Error al escribir el archivo."`: el filesystem de Vercel es de solo lectura salvo `/tmp`, así que el driver de disco no puede escribir nada.

Bucket: **`productos-tienda`**. `STORAGE_BUCKET` y `STORAGE_ENDPOINT` ya están cargados en Vercel (production y preview). **Faltan las dos claves.**

1. En Cloudflare: **R2 → Overview → Manage R2 API Tokens → Create Account API Token**.
2. Permiso **Object Read & Write**, con alcance **Apply to specific buckets only** → `productos-tienda`. Preferí *Account API Token* sobre *User*: el de usuario queda inactivo si te sacan el rol de la cuenta y la tienda se queda sin poder subir archivos sin causa aparente.
3. **Create API Token** muestra **Access Key ID** y **Secret Access Key** una sola vez. Guardalos antes de cerrar la pestaña.
4. En Vercel (Settings → Environment Variables), agregar las dos que faltan:

   | Variable | Origen |
   |----------|--------|
   | `STORAGE_ACCESS_KEY_ID` | *Access Key ID* del token |
   | `STORAGE_SECRET_ACCESS_KEY` | *Secret Access Key* del token |

5. En el bucket, **Settings → CORS**. **No es opcional**: el cliente siempre pide primero una URL presignada y sube directo desde el navegador, así que sin CORS falla cualquier imagen, por chica que sea.

   ```json
   [{ "AllowedOrigins": ["https://sotore-psi.vercel.app"],
      "AllowedMethods": ["PUT", "GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600 }]
   ```

6. Redeploy (Vercel no aplica variables nuevas al deployment vivo) y probar la subida.

Comprobaciones esperadas: `POST /api/files/upload-url` devuelve una URL firmada en vez de `501`, y `POST /api/files/upload` deja de dar `500`.

> Las credenciales van directo en el dashboard de Vercel; no pegarlas en el chat ni en `.env.local`, que está versionado.


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
