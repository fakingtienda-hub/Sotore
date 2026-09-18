import { config } from "dotenv";

config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";

import * as schema from "../lib/db/schema";

/**
 * Productos de prueba para desarrollo local (Fase 16 / tests).
 * Idempotente: crea o actualiza 3 productos con precios, monedas y
 * descripciones distintas para probar la landing destacada, el store,
 * el checkout y la librería.
 */

const PRODUCTS: Array<{
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  price: number;
  compareAtPrice: number | null;
  currency: "COP" | "USD" | "MXN";
  theme: "costura" | "amigurumi" | "crochet";
  status: "draft" | "published" | "archived";
  coverImageUrl: string | null;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
}> = [
  {
    slug: "pack-moldes-basicos",
    title: "Pack de Moldes Básicos",
    shortDescription:
      "12 moldes de prendas esenciales a escala real para arrancar tu taller desde cero.",
    description: `Un pack pensado para quien quiere coser sin complicaciones. Incluye 12 moldes premium a escala real (tallas S–XL), fichas técnicas con medidas y un checklist de materiales.

Todo en PDF listo para imprimir en casa o en la copistería. Acceso inmediato tras el pago y descargas de por vida.

Para quien está arrancando, este pack es el punto de partida perfecto: camisetas, faldas, pantalones y vestidos sencillos con instrucciones paso a paso.`,
    price: 4999000,
    compareAtPrice: 8999000,
    currency: "COP",
    theme: "costura",
    status: "published",
    coverImageUrl: "https://picsum.photos/seed/moldes-basicos/900/1200",
    tags: ["moldes", "principiantes", "pdf"],
    seoTitle: "Pack de Moldes Básicos · Moldes PDF a escala real",
    seoDescription:
      "12 moldes de prendas esenciales a escala real, fichas técnicas y checklist de materiales. Descarga inmediata.",
  },
  {
    slug: "curso-costura-creativa",
    title: "Curso de Costura Creativa",
    shortDescription:
      "12 videos paso a paso para diseñar prendas con patronaje en casa, sin maquina profesional.",
    description: `Domina el patronaje y el diseño de prendas con esta serie de 12 videotutoriales en HD. Cada módulo incluye diagramas, fichas técnicas y ejercicios descargables.

Aunque no tengas máquina profesional, aprendes a adaptar patrones, hacer sastrería básica y rematar como costurera experimentada.

Incluye:
- 12 videos HD (acceso de por vida).
- Plantillas imprimibles de patrones.
- Guía de acabados y dobladillos.
- Comunidad privada para resolver dudas.`,
    price: 2999,
    compareAtPrice: null,
    currency: "USD",
    theme: "costura",
    status: "published",
    coverImageUrl: "https://picsum.photos/seed/costura-creativa/900/1200",
    tags: ["videos", "patronaje", "curso"],
    seoTitle: "Curso de Costura Creativa · 12 videotutoriales en HD",
    seoDescription:
      "Aprende patronaje y diseño de prendas con 12 videos paso a paso, diagramas y ejercicios descargables.",
  },
  {
    slug: "kit-herramientas-negocio",
    title: "Kit de Herramientas para tu Negocio",
    shortDescription:
      "Plantillas de precios, calendario de contenido y checklist financiero para vender tus creaciones.",
    description: `No solo se trata de coser: también hay que vender. Este kit te da las plantillas editables para fijar precios rentables, organizar tu contenido de redes sociales durante 12 semanas y llevar el control de tus gastos.

Incluye:
- Plantilla de precios y márgenes (Excel/Google Sheets).
- Calendario de contenido de 12 semanas.
- Checklist financiero mensual.
- Guía para armar tu catálogo de productos.`,
    price: 1999000,
    compareAtPrice: 2999000,
    currency: "COP",
    theme: "costura",
    status: "draft",
    coverImageUrl: null,
    tags: ["plantillas", "negocio", "pdf"],
    seoTitle: "Kit de Herramientas para tu Negocio de costura",
    seoDescription:
      "Plantillas de precios, calendario de contenido y checklist financiero para vender tus creaciones.",
  },
  {
    slug: "curso-amigurumis",
    title: "Curso de Amigurumis Paso a Paso",
    shortDescription:
      "Teje muñecos y personajes de ganchillo desde cero: puntos básicos, relleno y acabado suave.",
    description: `Aprende a tejer amigurumis de principio a fin con este curso en video. Empezamos por los puntos básicos (cadena, punto bajo, aumentos y disminuciones) y llegamos a muñecos completos con detalle de acabado.

Incluye:
- 10 videotutoriales en HD con patrones contados.
- Guía de materiales y lanas recomendadas.
- Secretos para un acabado firme y parejo (sin huecos).
- 5 patrones descargables de personajes.

Perfecto si nunca has tejido o si quieres pulir tu técnica.`,
    price: 3499000,
    compareAtPrice: 5999000,
    currency: "COP",
    theme: "amigurumi",
    status: "published",
    coverImageUrl: null,
    tags: ["amigurumi", "ganchillo", "tejido", "curso"],
    seoTitle: "Curso de Amigurumis Paso a Paso · Puntos y patrones",
    seoDescription:
      "Teje amigurumis desde cero con 10 videos en HD, guía de materiales y 5 patrones descargables.",
  },
  {
    slug: "curso-crochet-basico",
    title: "Curso de Crochet desde Cero",
    shortDescription:
      "Dominio el ganchillo: puntos base, técnicas de tensión y tus primeras prendas con acabado de lino.",
    description: `El curso ideal para arrancar en el crochet con confianza. Aprende a sostener el ganchillo, mantener la tensión pareja y combinar puntos hasta tejer tus primeras prendas ligeras.

Incluye:
- 12 lecciones en video paso a paso.
- Tablas de puntos y abreviaturas.
- Proyectos guiados: posavasos, bufanda y top de lino.
- Tips de acabado: bloqueo, tejidos y costuras invisibles.`,
    price: 2499,
    compareAtPrice: null,
    currency: "USD",
    theme: "crochet",
    status: "published",
    coverImageUrl: null,
    tags: ["crochet", "ganchillo", "principiantes", "curso"],
    seoTitle: "Curso de Crochet desde Cero · Puntos y proyectos",
    seoDescription:
      "Aprende crochet desde cero con 12 lecciones en video, proyectos guiados y tips de acabado de lino.",
  },
];

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/fakingstore";
  const queryClient = postgres(databaseUrl, { prepare: false });
  const db = drizzle(queryClient, { schema, casing: "snake_case" });

  let created = 0;
  let updated = 0;

  for (const product of PRODUCTS) {
    const [existing] = await db
      .select({ id: schema.products.id, slug: schema.products.slug })
      .from(schema.products)
      .where(eq(schema.products.slug, product.slug))
      .limit(1);

    // galleryUrls no incluido: dejamos los metadatos por defecto de fases previas intactos.
    const values = {
      title: product.title,
      shortDescription: product.shortDescription,
      description: product.description,
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      currency: product.currency,
      theme: product.theme,
      status: product.status,
      coverImageUrl: product.coverImageUrl,
      tags: product.tags,
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
      publishedAt: product.status === "published" ? new Date() : null,
      updatedAt: new Date(),
    };

    if (existing) {
      await db
        .update(schema.products)
        .set(values)
        .where(eq(schema.products.id, existing.id));
      updated++;
      console.log(`  actualizado: ${product.slug}`);
    } else {
      await db.insert(schema.products).values({ ...values, slug: product.slug });
      created++;
      console.log(`  creado: ${product.slug}`);
    }
  }

  console.log(`Productos listos. Creados: ${created} · Actualizados: ${updated}`);
  await queryClient.end();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });