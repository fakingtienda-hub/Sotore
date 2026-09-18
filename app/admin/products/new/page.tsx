import { ProductForm } from "../_components/product-form";

export const metadata = {
  title: "Nuevo producto · Admin",
};

export default function NewProductPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Nuevo producto</h1>
        <p className="text-sm text-muted-foreground">
          Crea un producto o pack digital para empezar a vender.
        </p>
      </div>
      <ProductForm mode="create" />
    </div>
  );
}
