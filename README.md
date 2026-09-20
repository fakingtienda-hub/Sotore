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
| 8 | Webhook + validación de pagos |
| **9 ✓** | Entrega automática |
| **10 ✓** | Biblioteca del cliente |
| **11 ✓** | CRM administrativo |
| 12 | Emails transaccionales |
| 13 | Analytics + Meta Pixel |
| 14 | Seguridad + pruebas |
| 15 | Optimización + deploy |
