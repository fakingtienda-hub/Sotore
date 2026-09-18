import { listCoupons, listProductsForCoupons } from "@/lib/server/actions/coupons";
import { CouponsManager } from "./_components/coupons-manager";

export const metadata = {
  title: "Cupones · Admin",
};

export default async function AdminCouponsPage() {
  const [coupons, products] = await Promise.all([listCoupons(), listProductsForCoupons()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Cupones</h1>
        <p className="text-sm text-muted-foreground">
          Descuentos por porcentaje o monto fijo, con límite de usos y vigencia.
        </p>
      </div>

      <CouponsManager coupons={coupons} products={products} />
    </div>
  );
}