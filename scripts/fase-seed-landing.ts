import { config } from "dotenv";

config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";

import * as schema from "../lib/db/schema";

/**
 * Contenido de referencia para el nuevo diseño de la landing (Fase 16).
 * Idempotente: crea o actualiza las secciones de contenido + configuración
 * global del sitio con la campaña del pack.
 * Todo es editable después desde /admin/landing.
 */

const BLOCKS: Array<{
  section: (typeof schema.landingBlocks)["$inferInsert"]["section"];
  sortOrder: number;
  title: string;
  subtitle: string;
  isPublished: boolean;
  content: object;
}> = [
  {
    section: "hero",
    sortOrder: 0,
    title: "Pack de moldes premium",
    subtitle:
      "Moldes listos para imprimir, videos paso a paso y recursos descargables. Todo tu taller en un solo pack, con acceso inmediato.",
    isPublished: true,
    content: {
      badge: "Oferta de lanzamiento",
      ctaText: "Quiero el pack",
      ctaProductSlug: "pack-costura-pro",
    },
  },
  {
    section: "benefits",
    sortOrder: 1,
    title: "Por qué te va a encantar",
    subtitle: "",
    isPublished: true,
    content: {
      eyebrow: "Beneficios",
      items: [
        {
          title: "Acceso inmediato",
          description: "Descargas al instante tras el pago, y quedan tuyas para siempre.",
        },
        {
          title: "Moldes en PDF listos",
          description: "A escala real, con márgenes e instrucciones claras de corte.",
        },
        {
          title: "Videos paso a paso",
          description: "Cada técnica explicada de principio a fin, sin tecnicismos.",
        },
        {
          title: "Soporte y comunidad",
          description: "Resolvés dudas mientras cosés; no quedás sola en el intento.",
        },
      ],
    },
  },
  {
    section: "content",
    sortOrder: 2,
    title: "Todo lo que trae el pack",
    subtitle: "",
    isPublished: true,
    content: {
      eyebrow: "Contenido incluido",
      items: [
        {
          title: "Moldes premium (PDF)",
          description: "Moldes a escala real con instrucciones de corte claras.",
        },
        {
          title: "Video tutoriales HD",
          description: "Paso a paso de cada prenda y técnica, a tu ritmo.",
        },
        {
          title: "Diagramas y fichas técnicas",
          description: "Medidas, materiales y secuencias sin vueltas.",
        },
        {
          title: "Checklists de materiales",
          description: "Sabés exactamente qué comprar antes de arrancar.",
        },
        {
          title: "Actualizaciones gratis",
          description: "Cada molde nuevo se suma a tu biblioteca sin costo extra.",
        },
        {
          title: "Descargas de por vida",
          description: "Tus archivos disponibles siempre que los necesites.",
        },
      ],
    },
  },
  {
    section: "bonuses",
    sortOrder: 3,
    title: "Bonus que se suman hoy",
    subtitle: "Solo por tiempo limitado, los bonus viajan adentro del pack.",
    isPublished: true,
    content: {
      eyebrow: "Bonos de hoy",
      items: [
        {
          title: "Plantillas de precios",
          description: "Listas para cobrar mejor tus productos terminados.",
        },
        {
          title: "Calendario de contenido",
          description: "12 semanas de ideas para publicar tu taller en redes.",
        },
      ],
    },
  },
  {
    section: "testimonials",
    sortOrder: 4,
    title: "Quién ya lo está usando",
    subtitle: "",
    isPublished: true,
    content: {
      eyebrow: "Quién ya lo probó",
      items: [
        {
          author: "Mariana R.",
          role: "Costurera · Bogotá",
          quote:
            "Compré el pack el fin de semana y el lunes ya estaba vendiendo mis primeros moldes. Todo listo para imprimir.",
        },
        {
          author: "Carolina T.",
          role: "Emprendedora · Medellín",
          quote:
            "Los videos hicieron que por fin perdiera el miedo a las telas difíciles. Vale cada peso.",
        },
        {
          author: "Valentina P.",
          role: "Estudiante de diseño",
          quote:
            "Los checklists me ahorraron un montón de retrabajo. No volví a comprar moldes sueltos.",
        },
      ],
    },
  },
  {
    section: "faq",
    sortOrder: 5,
    title: "Antes de comprar",
    subtitle: "",
    isPublished: true,
    content: {
      eyebrow: "Preguntas frecuentes",
      items: [
        {
          question: "¿Cómo recibo el pack?",
          answer:
            "Al confirmarse el pago recibís por email el enlace de acceso y se activa tu biblioteca. Todo queda descargable al instante.",
        },
        {
          question: "¿Es un pago único?",
          answer:
            "Sí. Pagás una sola vez y el pack queda tuyo para siempre, sin suscripciones ni cargos ocultos.",
        },
        {
          question: "¿Necesito experiencia previa?",
          answer:
            "No. Cada técnica tiene su video y su ficha técnica con las medidas, pensado para arrancar desde cero.",
        },
        {
          question: "¿Puedo vender lo que produzca con los moldes?",
          answer:
            "Sí. Podés usar los moldes para las prendas y piezas que vendas, sin límites de producción.",
        },
        {
          question: "¿Qué pasa si no me convence?",
          answer:
            "Si el pack no cumple lo que promete, escribinos dentro de los primeros 7 días y coordinamos la devolución sin vueltas.",
        },
      ],
    },
  },
  {
    section: "cta",
    sortOrder: 6,
    title: "Tu taller arranca hoy mismo",
    subtitle:
      "Moldes premium, videos paso a paso y los bonus de hoy. Pago seguro y acceso inmediato.",
    isPublished: true,
    content: {
      eyebrow: "Última llamada",
      ctaText: "Quiero el pack ahora",
      ctaProductSlug: "pack-costura-pro",
    },
  },
  {
    section: "site",
    sortOrder: 7,
    title: "",
    subtitle: "",
    isPublished: true,
    content: {
      tickerItems: [
        "Acceso inmediato tras el pago",
        "Moldes listos para imprimir",
        "Videos paso a paso",
        "Pago seguro con Wompi",
        "Descargas de por vida",
      ],
      trustRows: ["Pago seguro con Wompi", "Descarga inmediata", "Acceso de por vida"],
      patternChips: ["MOLDES", "VIDEOS", "PDFs", "CHECKLIST"],
      headerBadge: "Pago seguro · Descarga inmediata",
      headerTag: "Taller digital",
      footerBadges: ["Pago seguro con Wompi", "Acceso de por vida", "Soporte por email"],
      bonusTag: "BONO",
      heroSecondaryCtaText: "Ver qué incluye",
      heroPriceKicker: "Hoy solo",
      heroPriceNote: "Pago único · acceso de por vida",
      ctaPriceKicker: "Oferta de la semana",
      ctaPriceNote: "Pago único · acceso de por vida",
      ctaFootnote: "Pago seguro con Wompi · recibes el acceso al instante",
      featuredProductSlug: "pack-costura-pro",
    },
  },
];

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/fakingstore";
  const queryClient = postgres(databaseUrl, { prepare: false });
  const db = drizzle(queryClient, { schema, casing: "snake_case" });

  let updated = 0;
  let created = 0;

  for (const block of BLOCKS) {
    const section = block.section;
    if (!section) continue;
    const [existing] = await db
      .select({ id: schema.landingBlocks.id })
      .from(schema.landingBlocks)
      .where(eq(schema.landingBlocks.section, section))
      .limit(1);

    if (existing) {
      await db
        .update(schema.landingBlocks)
        .set({
          title: block.title,
          subtitle: block.subtitle,
          content: block.content,
          isPublished: block.isPublished,
          sortOrder: block.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(schema.landingBlocks.id, existing.id));
      updated++;
    } else {
      await db.insert(schema.landingBlocks).values({
        ...block,
        content: block.content,
        section: block.section,
      });
      created++;
    }
  }

  console.log(`Landing seed listo. Creadas: ${created} · Actualizadas: ${updated}`);
  await queryClient.end();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });