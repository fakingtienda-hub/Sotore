import { formatPrice } from "@/lib/utils/format";

export function PriceTicket({
  kicker,
  price,
  currency,
  compareAt,
  note,
}: {
  kicker?: string;
  price: number;
  currency: string;
  compareAt?: number | null;
  note?: string;
}) {
  const priceLabel = formatPrice(price, currency);

  return (
    <div className="sf-ticket">
      {kicker ? <span className="kicker">{kicker}</span> : null}
      <span className="tag-price" data-text={priceLabel}>
        {priceLabel}
      </span>
      {compareAt != null && compareAt > price ? (
        <span className="tag-note line-through">{formatPrice(compareAt, currency)}</span>
      ) : null}
      {note ? <span className="tag-note">{note}</span> : null}
    </div>
  );
}