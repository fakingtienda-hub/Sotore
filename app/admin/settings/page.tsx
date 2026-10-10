import {
  getWompiSettings,
  getStoreSettings,
  getEmailSettings,
  getEmailUsage,
} from "@/lib/server/actions/settings";
import { getReconciliationPanel } from "@/lib/server/actions/reconciliation";
import { SettingsForm } from "./_components/settings-form";
import { WompiSettingsForm } from "./_components/wompi-settings-form";
import { EmailSettingsForm } from "./_components/email-settings-form";
import { ReconciliationPanel } from "./_components/reconciliation-panel";

export const dynamic = "force-dynamic";
export default async function AdminSettingsPage() {
  const [settings, wompi, email, emailUsage, reconciliation] = await Promise.all([
    getStoreSettings(),
    getWompiSettings(),
    getEmailSettings(),
    getEmailUsage(),
    getReconciliationPanel(),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Configuración</h1>
      <p className="mt-2 text-muted-foreground">
        Datos generales de la tienda, credenciales de pago y redes sociales.
      </p>
      {/* En escritorio las tarjetas se reparten en dos columnas: apiladas
          ocupaban 672px de un contenedor de ancho completo y dejaban media
          pantalla vacía a la derecha. `items-start` mantiene cada tarjeta con
          su altura natural para que no se estiren a la de su vecina. */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <SettingsForm initial={settings} />
        <WompiSettingsForm initial={wompi} />
        <EmailSettingsForm initial={email} usage={emailUsage} />
        <ReconciliationPanel status={reconciliation} />
      </div>
    </div>
  );
}