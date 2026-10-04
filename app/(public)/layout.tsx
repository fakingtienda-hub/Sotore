import { getLandingSiteConfig } from "@/lib/server/actions/landing";
import { getLandingTheme } from "@/lib/server/landing-theme";
import { getLandingFont } from "@/lib/landing-fonts";
import { PublicFooter, PublicHeader } from "@/components/storefront/public-chrome";
import { PreviewBridge } from "@/components/storefront/preview-bridge";

const storeName = process.env.NEXT_PUBLIC_STORE_NAME ?? "Fakingstore";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const site = await getLandingSiteConfig();
  const theme = await getLandingTheme();
  const font = getLandingFont(site.titleFont);

  // Fuente elegida en el CRM ("Sitio · textos globales"). Vacío = automática por
  // tema (cada tema define su --sf-title-font en storefront.css).
  const fontStyle = font
    ? ({
        "--sf-title-font": font.stack,
        "--sf-title-weight": String(font.weight),
        "--sf-title-tracking": font.tracking,
      } as React.CSSProperties)
    : undefined;

  return (
    <div className="storefront" data-sf-theme={theme} style={fontStyle}>
      {/* Sin JS no hay reveal: mostrar todo el contenido directamente. */}
      <noscript>
        <style>{`.sf-reveal{opacity:1!important;transform:none!important}`}</style>
      </noscript>

      <PublicHeader site={site} storeName={storeName} />

      {children}

      <PublicFooter site={site} storeName={storeName} />

      {/* Solo hace algo dentro del iframe del editor; inerte en público. */}
      <PreviewBridge />
    </div>
  );
}