import type { SVGProps } from "react";

/** Iconos del CRM: SVGs inline (el proyecto no usa librería de iconos).
 *  Heredan el color con `currentColor` y el tamaño con clases de Tailwind. */
const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export function IconDashboard(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

export function IconSales(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M5.5 8h13l-1.1 11.5a1.5 1.5 0 01-1.5 1.35H8.1a1.5 1.5 0 01-1.5-1.35L5.5 8z" />
      <path d="M9 8V6.5a3 3 0 016 0V8" />
    </svg>
  );
}

export function IconCustomers(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3.3" />
      <path d="M3.3 20.2a5.7 5.7 0 0111.4 0" />
      <path d="M16.2 5.6a3 3 0 010 5.6" />
      <path d="M18 20.2a5.6 5.6 0 00-2.1-4.3" />
    </svg>
  );
}

export function IconProducts(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.2l8 4.4v8.8l-8 4.4-8-4.4V7.6l8-4.4z" />
      <path d="M4 7.6l8 4.4 8-4.4" />
      <path d="M12 12v8.8" />
    </svg>
  );
}

export function IconCoupons(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7.5A1.5 1.5 0 015.5 6h13A1.5 1.5 0 0120 7.5v2a2.5 2.5 0 000 5v2a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 16.5v-2a2.5 2.5 0 000-5v-2z" />
      <path d="M12.5 9.5v5" strokeDasharray="1.6 1.8" />
    </svg>
  );
}

export function IconDownloads(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5v11" />
      <path d="M7.5 10.5l4.5 4.5 4.5-4.5" />
      <path d="M4.5 20.5h15" />
    </svg>
  );
}

export function IconSettings(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h9" />
      <path d="M19 7h1.5" />
      <circle cx="15.5" cy="7" r="2.2" />
      <path d="M4 17h1.5" />
      <path d="M11.5 17h9" />
      <circle cx="8.5" cy="17" r="2.2" />
    </svg>
  );
}

export function IconLanding(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 8.5h18" />
      <path d="M9.5 8.5V20" />
    </svg>
  );
}
