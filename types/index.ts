import type { CouponType, FileType, OrderStatus, ProductStatus, UserRole, UserStatus } from "@/lib/constants";

export interface User {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  priceCents: number;
  comparePriceCents: number | null;
  currency: string;
  coverImage: string | null;
  gallery: string[];
  status: ProductStatus;
  featured: boolean;
  categoryId: string | null;
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  ogImage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductFile {
  id: string;
  productId: string;
  name: string;
  fileType: FileType;
  storagePath: string;
  fileSize: number;
  sortOrder: number;
  createdAt: string;
}

export interface Order {
  id: string;
  reference: string;
  userId: string;
  productId: string;
  amountCents: number;
  currency: string;
  status: OrderStatus;
  wompiTransactionId: string | null;
  paymentMethod: string | null;
  couponCode: string | null;
  discountCents: number;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface Purchase {
  id: string;
  userId: string;
  productId: string;
  orderId: string;
  active: boolean;
  purchasedAt: string;
}

export interface DownloadRecord {
  id: string;
  userId: string;
  productId: string;
  fileId: string;
  downloadedAt: string;
  ipHash: string | null;
  userAgent: string | null;
}

export interface Coupon {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  maxUses: number;
  usedCount: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  createdAt: string;
}

export type LandingBlockType =
  | "hero"
  | "benefits"
  | "includes"
  | "gallery"
  | "bonus"
  | "testimonials"
  | "faq"
  | "cta"
  | "footer";

export interface LandingBlock {
  id: string;
  blockType: LandingBlockType;
  content: Record<string, unknown>;
  sortOrder: number;
  active: boolean;
}

export interface StoreSettings {
  storeName: string;
  logo: string | null;
  currency: string;
  ownerEmail: string | null;
  emailFrom: string | null;
  wompiEnv: "sandbox" | "production";
  socialLinks: { instagram: string | null; facebook: string | null };
  metaPixelId: string | null;
}