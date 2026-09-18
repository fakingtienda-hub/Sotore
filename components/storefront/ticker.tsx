import type { ReactNode } from "react";

export function Ticker({ items }: { items: ReactNode[] }) {
  if (items.length === 0) return null;
  const doubled = [...items, ...items];

  return (
    <div className="sf-ticker">
      <div className="sf-ticker-track">
        {doubled.map((item, i) => (
          <span key={i} className="sf-ticker-item">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}