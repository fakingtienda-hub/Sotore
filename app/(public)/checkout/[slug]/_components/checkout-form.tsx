"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { createPendingOrder, getCouponDiscount } from "@/lib/server/actions/checkout";
import { formatPrice } from "@/lib/utils/format";
import { PaymentWidget } from "./payment-widget";

type CheckoutProduct = {
  id: string;
  slug: string;
  title: string;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  coverImageUrl: string | null;
};

type CheckoutFile = { id: string; name: string; fileType: string };

const FILE_LABELS: Record<string, string> = {
  video: "Videos",
  pdf: "PDFs",
  zip: "ZIP",
  image: "Imágenes",
  audio: "Audio",
  other: "Recursos",
};

function ProductThumb({ product, small }: { product: CheckoutProduct; small?: boolean }) {
  if (product.coverImageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={product.coverImageUrl} alt={product.title} className={small ? "sf-thumb sf-thumb-sm" : "sf-thumb"} />
    );
  }
  return (
    <div className={`sf-thumb${small ? " sf-thumb-sm" : ""} flex items-center justify-center bg-[var(--sf-ink-3)]`}>
      <span className={small ? "text-lg opacity-40" : "text-2xl opacity-40"} aria-hidden>
        📦
      </span>
    </div>
  );
}

function SummaryBody({
  product,
  bullets,
  files,
  subtotal,
  discount,
  total,
  appliedCode,
  showHead,
}: {
  product: CheckoutProduct;
  bullets: string[];
  files: CheckoutFile[];
  subtotal: number;
  discount: number;
  total: number;
  appliedCode?: string;
  showHead: boolean;
}) {
  const hasCompare = product.compareAtPrice != null && product.compareAtPrice > product.price;
  const discountPct = hasCompare
    ? Math.round(((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100)
    : null;

  return (
    <>
      {showHead ? (
        <div className="flex items-center gap-4 px-5 py-4">
          <ProductThumb product={product} />
          <div className="min-w-0">
            <span className="sf-label">{discountPct != null ? `−${discountPct}% hoy` : "Tu pedido"}</span>
            <p className="mt-0.5 truncate font-semibold text-[var(--sf-paper)]">{product.title}</p>
            <p className="sf-muted mt-0.5 text-xs">Licencia digital · acceso inmediato</p>
          </div>
        </div>
      ) : null}

      <div className="space-y-3 px-5 pb-5 text-sm">
        <div className="flex items-center justify-between text-[var(--sf-muted)]">
          <span>Subtotal</span>
          <span>{formatPrice(subtotal, product.currency)}</span>
        </div>
        {discount > 0 ? (
          <div className="flex items-center justify-between text-[var(--sf-gold)]">
            <span>Descuento ({appliedCode})</span>
            <span>−{formatPrice(discount, product.currency)}</span>
          </div>
        ) : null}

        {showHead ? (
          <div className="-mx-5 -mb-5 mt-4 flex items-center justify-between border-t-2 border-dashed border-[var(--sf-line-strong)] bg-[var(--sf-ink-3)] px-5 py-4">
            <span className="sf-label">Total a pagar</span>
            <span className="sf-title text-3xl leading-none text-[var(--sf-paper)]">
              {formatPrice(total, product.currency)}
            </span>
          </div>
        ) : null}
      </div>

      {bullets.length > 0 || files.length > 0 ? (
        <div className="border-t border-dashed border-[var(--sf-line)] px-5 py-1">
          <details className="sf-faq">
            <summary>
              <span className="text-sm font-semibold text-[var(--sf-paper)]">Qué incluye</span>
            </summary>
            <div className="faq-a">
              {bullets.length > 0 ? (
                <ul className="space-y-1.5">
                  {bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2 text-sm">
                      <span className="text-[var(--sf-thread)]" aria-hidden>
                        ✓
                      </span>
                      <span className="text-[var(--sf-muted)]">{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {files.length > 0 ? (
                <ul className="mt-3 space-y-1.5">
                  {files.map((file) => (
                    <li key={file.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-[var(--sf-paper)]">{file.name}</span>
                      <span className="shrink-0 rounded border border-[var(--sf-line-strong)] px-1.5 py-0.5 font-mono text-[12px] tracking-[0.12em] text-[var(--sf-paper-dim)]">
                        {FILE_LABELS[file.fileType] ?? file.fileType.toUpperCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </details>
        </div>
      ) : null}

      <div className="flex items-center gap-2 px-5 pb-5">
        <span className="text-[var(--sf-gold)]">✓</span>
        <span className="sf-label">Pago cifrado y procesado con Wompi</span>
      </div>
    </>
  );
}

export function CheckoutForm({
  product,
  bullets,
  files,
}: {
  product: CheckoutProduct;
  bullets: string[];
  files: CheckoutFile[];
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phonePrefix, setPhonePrefix] = useState("+57");
  const [couponInput, setCouponInput] = useState("");
  const [applied, setApplied] = useState<{ code: string; discount: number } | null>(null);
  const [couponState, setCouponState] = useState<{ loading: boolean; error: string | null }>({
    loading: false,
    error: null,
  });

  const subtotal = product.price;
  const discount = applied?.discount ?? 0;
  const total = Math.max(0, subtotal - discount);

  const [orderResult, setOrderResult] = useState<{ ok: boolean; orderId?: string; orderCode?: string; error?: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setSubmitError(null);
    const res = await createPendingOrder({
      slug: product.slug,
      name,
      email,
      phone: phone.trim() || undefined,
      phonePrefix: phone.trim() ? phonePrefix : undefined,
      couponCode: applied?.code,
    });
    setPending(false);
    if (res.ok) {
      setOrderResult(res);
    } else {
      setSubmitError(res.error ?? "No se pudo crear la orden.");
    }
  }

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    setCouponState({ loading: true, error: null });
    const res = await getCouponDiscount(code, product.id);
    if (res.ok && res.discount != null) {
      setApplied({ code: code.toUpperCase(), discount: res.discount });
      setCouponState({ loading: false, error: null });
    } else {
      setApplied(null);
      setCouponState({ loading: false, error: res.error ?? "Cupón inválido." });
    }
  }

  // Puente transitorio: la orden se crea y el `PaymentWidget` lleva al comprador
  // a Wompi por sí solo (cuenta regresiva), sin una pantalla intermedia extra.
  if (orderResult?.ok) {
    if (!orderResult.orderCode) {
      return (
        <div className="sf-card mx-auto max-w-xl p-6 text-center text-sm text-[var(--sf-thread)]">
          La orden se creó pero no pudimos obtener su código. Escríbenos para ayudarte.
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-xl">
        <PaymentWidget orderCode={orderResult.orderCode} autoSubmitSec={6} />
      </div>
    );
  }

  const summaryProps = {
    product,
    bullets,
    files,
    subtotal,
    discount,
    total,
    appliedCode: applied?.code,
  };

  return (
    <div className="sf-checkout-shell">
      {/* El título va FUERA de la rejilla: así los dos recuadros (formulario y
          resumen) arrancan a la misma altura, alineados entre sí. */}
      <header className="sf-checkout-head">
        <h1 className="sf-checkout-h1 sf-title text-[clamp(1.75rem,6vw,2.6rem)] text-[var(--sf-paper)]">Finalizar compra</h1>
        <p className="sf-checkout-sub sf-muted mt-2">
          Solo tus datos de contacto y el pago. El acceso llega en el instante en que se confirme.
        </p>
      </header>

      <div className="sf-checkout-grid">
      <div>
        <form onSubmit={handleSubmit} className="sf-checkout-form sf-card p-5 md:p-7">
          <h2 className="sf-label">Datos del comprador</h2>

          <div className="sf-checkout-fields">
            <div>
              <label htmlFor="name" className="sf-field-label">
                Nombre completo
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
                autoCapitalize="words"
                enterKeyHint="next"
                placeholder="Cómo te podemos llamar"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="sf-input"
              />
            </div>

            <div>
              <label htmlFor="email" className="sf-field-label">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                enterKeyHint="next"
                placeholder="donde@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="sf-input"
              />
              <p className="sf-checkout-hint sf-muted mt-1.5 text-xs">Ahí llega el enlace de acceso y la factura.</p>
            </div>

            <div>
              <label htmlFor="phone" className="sf-field-label">
                Teléfono
              </label>
              <div className="sf-phone-row mt-2 flex items-stretch gap-2">
                <select
                  id="phonePrefix"
                  name="phonePrefix"
                  value={phonePrefix}
                  onChange={(e) => setPhonePrefix(e.target.value)}
                  className="sf-input w-28 shrink-0"
                  aria-label="Código de país"
                >
                  <option value="+57">CO +57</option>
                  <option value="+1">US +1</option>
                  <option value="+52">MX +52</option>
                  <option value="+507">PA +507</option>
                  <option value="+34">ES +34</option>
                  <option value="+56">CL +56</option>
                  <option value="+54">AR +54</option>
                  <option value="+595">PY +595</option>
                  <option value="+51">PE +51</option>
                  <option value="+58">VE +58</option>
                </select>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  minLength={6}
                  maxLength={15}
                  autoComplete="tel-national"
                  inputMode="tel"
                  enterKeyHint="next"
                  placeholder="300 123 45 67"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ""))}
                  className="sf-input min-w-0 flex-1"
                />
              </div>
              <p className="sf-checkout-hint sf-muted mt-1.5 text-xs">
                Lo usamos para contactarte si hay alguna duda con tu compra. Llega pre-llenado a Wompi.
              </p>
            </div>

            <div>
              <label htmlFor="coupon" className="sf-field-label">
                Cupón de descuento
              </label>
              <div className="sf-coupon-row mt-2 flex items-stretch gap-2">
                <input
                  id="coupon"
                  name="coupon"
                  type="text"
                  autoCapitalize="characters"
                  enterKeyHint="go"
                  value={couponInput}
                  onChange={(e) => {
                    setCouponInput(e.target.value);
                    if (applied) setApplied(null);
                  }}
                  onKeyDown={(e) => {
                    /* Enter en el cupón aplica el cupón: NO envía el formulario
                       (crearía la orden sin el descuento puesto). */
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void applyCoupon();
                    }
                  }}
                  placeholder="EJ: WELCOME10"
                  className="sf-input"
                />
                <button
                  type="button"
                  onClick={applyCoupon}
                  disabled={couponState.loading || !couponInput.trim()}
                  className="sf-btn sf-btn-ghost sf-btn-sm min-h-12 shrink-0 self-stretch"
                >
                  {couponState.loading ? "..." : "Aplicar"}
                </button>
              </div>
              {applied ? (
                <p className="mt-1.5 text-xs font-medium text-[var(--sf-gold)]">
                  Cupón {applied.code} aplicado: −{formatPrice(applied.discount, product.currency)}
                </p>
              ) : null}
              {couponState.error ? (
                <p className="mt-1.5 text-xs font-medium text-[var(--sf-thread)]">{couponState.error}</p>
              ) : null}
            </div>

            {submitError ? (
              <p className="rounded-md border border-dashed border-[var(--sf-thread)] bg-[rgba(239,74,46,0.12)] px-3 py-2 text-sm text-[var(--sf-thread)]">
                {submitError}
              </p>
            ) : null}

            <button type="submit" disabled={pending} className="sf-btn w-full text-lg">
              {pending ? "Abriendo el pago seguro…" : "Continuar al pago"}
            </button>
            <p className="sf-checkout-hint sf-muted text-center text-xs">
              Sin registro previo. El acceso se envía a tu email tras confirmar el pago.
            </p>
          </div>
        </form>
      </div>

      <aside className="-order-1 lg:order-none">
        {/* Móvil: resumen plegable (solo la barra con el total) para que el formulario quede a la vista. */}
        <details className="sf-checkout-toggle sf-card overflow-hidden lg:hidden">
          <summary>
            <ProductThumb product={product} small />
            <span className="min-w-0 flex-1">
              <span className="sf-label block">Total a pagar</span>
              <span className="sf-bar-title block truncate text-sm text-[var(--sf-paper)]">{product.title}</span>
            </span>
            <span className="text-right">
              {discount > 0 ? (
                <s className="mr-1.5 text-xs text-[var(--sf-muted)]">
                  {formatPrice(subtotal, product.currency)}
                </s>
              ) : null}
              <span className="sf-display text-lg leading-none text-[var(--sf-paper)]">
                {formatPrice(total, product.currency)}
              </span>
            </span>
          </summary>
          <div className="border-t border-dashed border-[var(--sf-line)]">
            <SummaryBody {...summaryProps} showHead={false} />
          </div>
        </details>

        {/* Desktop: resumen completo (el <aside> ya es pegajoso por CSS). */}
        <div className="sf-summary-card sf-card hidden overflow-hidden lg:block">
          <SummaryBody {...summaryProps} showHead />
        </div>
      </aside>
      </div>
    </div>
  );
}
