import {
  Archivo_Black,
  Bebas_Neue,
  Cinzel,
  Cormorant_Garamond,
  DM_Serif_Display,
  Fjalla_One,
  Inter,
  Libre_Baskerville,
  Lora,
  Montserrat,
  Oswald,
  Outfit,
  Playfair_Display,
  Poppins,
  Roboto_Slab,
  Sora,
  Space_Grotesk,
} from "next/font/google";

/**
 * Carga (self-hosted) de las fuentes del selector de tipografía del CRM.
 *
 * - `preload: false`: NO se precargan; el navegador descarga solo la fuente que
 *   el tema/texto realmente usa. Evita 17 <link rel=preload> innecesarios.
 * - Los nombres de `variable` deben coincidir con `stack` en `lib/landing-fonts.ts`.
 * - `anton` NO se carga aquí: reutiliza `--font-poster` de `app/layout.tsx`.
 * - Las fuentes variables se cargan sin `weight` (rango completo); las estáticas
 *   (Archivo Black, Bebas Neue, Fjalla One, DM Serif Display, Poppins) sí lo declaran.
 * - next/font exige que cada loader se asigne a una const en el ámbito del módulo.
 */

const archivoBlack = Archivo_Black({ weight: "400", subsets: ["latin"], display: "swap", preload: false, variable: "--font-archivo-black" });
const bebasNeue = Bebas_Neue({ weight: "400", subsets: ["latin"], display: "swap", preload: false, variable: "--font-bebas" });
const fjallaOne = Fjalla_One({ weight: "400", subsets: ["latin"], display: "swap", preload: false, variable: "--font-fjalla" });
const dmSerifDisplay = DM_Serif_Display({ weight: "400", subsets: ["latin"], display: "swap", preload: false, variable: "--font-dm-serif" });
const poppins = Poppins({ weight: ["500", "600", "700", "800"], subsets: ["latin"], display: "swap", preload: false, variable: "--font-poppins" });
const oswald = Oswald({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-oswald" });
const montserrat = Montserrat({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-montserrat" });
const outfit = Outfit({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-outfit" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-space-grotesk" });
const sora = Sora({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-sora" });
const inter = Inter({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-inter" });
const playfairDisplay = Playfair_Display({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-playfair" });
const cinzel = Cinzel({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-cinzel" });
const cormorantGaramond = Cormorant_Garamond({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-cormorant" });
const libreBaskerville = Libre_Baskerville({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-libre-baskerville" });
const lora = Lora({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-lora" });
const robotoSlab = Roboto_Slab({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-roboto-slab" });

export const landingFontVariables = [
  archivoBlack.variable,
  bebasNeue.variable,
  fjallaOne.variable,
  dmSerifDisplay.variable,
  poppins.variable,
  oswald.variable,
  montserrat.variable,
  outfit.variable,
  spaceGrotesk.variable,
  sora.variable,
  inter.variable,
  playfairDisplay.variable,
  cinzel.variable,
  cormorantGaramond.variable,
  libreBaskerville.variable,
  lora.variable,
  robotoSlab.variable,
].join(" ");
