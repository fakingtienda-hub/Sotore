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
| 15 | Optimización + deploy |

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
- Persistencia del `storage/` local (archivos de producto + miniaturas): el código solo tiene el driver de disco (`LocalStorage`); las credenciales `STORAGE_*` de S3 en `.env.local` están vacías y **no hay cliente S3 implementado**. En producción montar un volumen persistente o implementar S3.

Nota: la BD se gestiona con `npm run db:push` (migraciones); las migraciones de Drizzle solo aplican en bases nuevas viajeras.
