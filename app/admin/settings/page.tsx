import { getWompiSettings, getStoreSettings } from "@/lib/server/actions/settings";
import { SettingsForm } from "./_components/settings-form";
import { WompiSettingsForm } from "./_components/wompi-settings-form";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const [settings, wompi] = await Promise.all([getStoreSettings(), getWompiSettings()]);

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Configuración</h1>
      <p className="mt-2 text-muted-foreground">
        Datos generales de la tienda, credenciales de pago y redes sociales.
      </p>
      <SettingsForm initial={settings} />
      <WompiSettingsForm initial={wompi} />
    </div>
  );
}