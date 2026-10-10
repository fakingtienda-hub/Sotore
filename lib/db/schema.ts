import { relations } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Better Auth core tables (adapted to drizzle + snake_case columns)
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    role: varchar("role", { length: 20 }).notNull().default("customer"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    phone: varchar("phone", { length: 30 }),
    phonePrefix: varchar("phone_prefix", { length: 8 }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_idx").on(t.token), index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: varchar("provider_id", { length: 50 }).notNull(),
    accountId: varchar("account_id", { length: 255 }).notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("accounts_provider_account_idx").on(t.providerId, t.accountId), index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    identifier: varchar("identifier", { length: 255 }).notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("verifications_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("categories_slug_idx").on(t.slug)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    shortDescription: text("short_description"),
    description: text("description"),
    coverImageUrl: text("cover_image_url"),
    galleryUrls: jsonb("gallery_urls").$type<string[]>(),
    price: integer("price").notNull().default(0),
    compareAtPrice: integer("compare_at_price"),
    currency: varchar("currency", { length: 3 }).notNull().default("COP"),
    theme: varchar("theme", { length: 20 }).notNull().default("premium"),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    tags: jsonb("tags").$type<string[]>(),
    seoTitle: varchar("seo_title", { length: 200 }),
    seoDescription: text("seo_description"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    zipKey: text("zip_key"),
    zipSizeBytes: bigint("zip_size_bytes", { mode: "number" }),
    zipGeneratedAt: timestamp("zip_generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("products_slug_idx").on(t.slug),
    index("products_status_idx").on(t.status),
    index("products_category_idx").on(t.categoryId),
    /* La ruta pública de portadas busca por `cover_image_url` en cada request. */
    index("products_cover_image_url_idx").on(t.coverImageUrl),
  ],
);

export const productFileGroups = pgTable(
  "product_file_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("product_file_groups_product_idx").on(t.productId),
    uniqueIndex("product_file_groups_product_name_uq").on(t.productId, t.name),
  ],
);

export const productFiles = pgTable(
  "product_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => productFileGroups.id, { onDelete: "set null" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    fileType: varchar("file_type", { length: 20 }).notNull().default("other"),
    mimeType: varchar("mime_type", { length: 120 }),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    storageKey: text("storage_key").notNull(),
    storageProvider: varchar("storage_provider", { length: 30 }).notNull().default("s3-compatible"),
    downloadLimit: integer("download_limit"),
    minMinutesAfterPayment: integer("min_minutes_after_payment").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("product_files_product_idx").on(t.productId),
    index("product_files_group_idx").on(t.groupId),
  ],
);

// ---------------------------------------------------------------------------
// Commerce
// ---------------------------------------------------------------------------

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 40 }).notNull(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    subtotal: integer("subtotal").notNull().default(0),
    discount: integer("discount").notNull().default(0),
    total: integer("total").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("COP"),
    couponCode: varchar("coupon_code", { length: 60 }),
    couponId: uuid("coupon_id").references(() => coupons.id, { onDelete: "set null" }),
    ownerToken: varchar("owner_token", { length: 64 }),
    gateway: varchar("gateway", { length: 30 }),
    gatewayReference: varchar("gateway_reference", { length: 120 }),
    gatewayStatus: varchar("gateway_status", { length: 40 }),
    gatewayPayload: jsonb("gateway_payload"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_code_idx").on(t.code),
    uniqueIndex("orders_gateway_reference_idx").on(t.gatewayReference),
    index("orders_user_idx").on(t.userId),
    index("orders_status_idx").on(t.status),
    index("orders_created_idx").on(t.createdAt),
    /* Barrido de caducidad: `WHERE status = 'pending' AND expires_at < now()`. */
    index("orders_status_expires_idx").on(t.status, t.expiresAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    productTitleSnapshot: varchar("product_title_snapshot", { length: 200 }).notNull(),
    unitPrice: integer("unit_price").notNull(),
    quantity: integer("quantity").notNull().default(1),
    currency: varchar("currency", { length: 3 }).notNull().default("COP"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId), index("order_items_product_idx").on(t.productId)],
);

export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("purchases_user_product_idx").on(t.userId, t.productId),
    index("purchases_user_idx").on(t.userId),
  ],
);

export const downloads = pgTable(
  "downloads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => productFiles.id, { onDelete: "restrict" }),
    purchaseId: uuid("purchase_id").references(() => purchases.id, { onDelete: "set null" }),
    token: text("token"),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("downloads_user_idx").on(t.userId), index("downloads_file_idx").on(t.fileId)],
);

export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 60 }).notNull(),
    type: varchar("type", { length: 15 }).notNull().default("percentage"),
    value: integer("value").notNull().default(0),
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    productScope: jsonb("product_scope").$type<string[]>(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("coupons_code_idx").on(t.code)],
);

export const couponUsages = pgTable(
  "coupon_usages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("coupon_usages_coupon_idx").on(t.couponId),
    uniqueIndex("coupon_usages_coupon_order_uq").on(t.couponId, t.orderId),
  ],
);

// ---------------------------------------------------------------------------
// Content / settings / analytics
// ---------------------------------------------------------------------------

export const landingBlocks = pgTable(
  "landing_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    section: varchar("section", { length: 40 }).notNull().default("hero"),
    title: varchar("title", { length: 200 }),
    subtitle: text("subtitle"),
    content: jsonb("content"),
    sortOrder: integer("sort_order").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("landing_blocks_section_idx").on(t.section)],
);

export const storeSettings = pgTable(
  "store_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: varchar("key", { length: 80 }).notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("store_settings_key_idx").on(t.key)],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
    sessionId: varchar("session_id", { length: 80 }),
    properties: jsonb("properties"),
    url: text("url"),
    referrer: text("referrer"),
    userAgent: text("user_agent"),
    ipAddress: varchar("ip_address", { length: 45 }),
    pageViewId: varchar("page_view_id", { length: 80 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_name_idx").on(t.name),
    index("events_created_idx").on(t.createdAt),
    index("events_user_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Registro de correos salientes
// ---------------------------------------------------------------------------

/** Bitácora de cada intento de envío (enviado, omitido o fallido).
 *
 *  Existe porque el plan Free de Mailgun son 100 correos al día: sin un
 *  registro local no hay forma de saber cuántos se llevan gastados, ni de
 *  evitar duplicados, ni de auditar (Mailgun Free solo retiene logs 1 día).
 *  La escribe `lib/server/email-guard.ts`; nunca se borra por rendimiento
 *  porque el volumen es de decenas de filas al día. */
export const emailLog = pgTable(
  "email_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Tipo de correo (`order_approved`, `magic_link`, `password_reset`, `test`). */
    kind: varchar("kind", { length: 40 }).notNull(),
    /** `critical` (nunca se omite por cuota) | `manual` | `bulk`. */
    priority: varchar("priority", { length: 16 }).notNull(),
    recipient: varchar("recipient", { length: 255 }).notNull(),
    /** `sent` | `skipped_quota` | `skipped_duplicate` | `skipped_rate_limit` | `failed`. */
    status: varchar("status", { length: 24 }).notNull(),
    /** Proveedor real que atendió el envío (`console` en desarrollo). */
    provider: varchar("provider", { length: 16 }).notNull().default(""),
    /** Clave de idempotencia: un segundo envío con la misma clave no se repite. */
    dedupeKey: varchar("dedupe_key", { length: 200 }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    error: varchar("error", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("email_log_created_idx").on(t.createdAt),
    index("email_log_dedupe_idx").on(t.dedupeKey),
    index("email_log_recipient_idx").on(t.recipient),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  files: many(productFiles),
  orderItems: many(orderItems),
  purchases: many(purchases),
}));

export const productFilesRelations = relations(productFiles, ({ one }) => ({
  product: one(products, { fields: [productFiles.productId], references: [products.id] }),
}));

export const orderRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
  coupon: one(coupons, { fields: [orders.couponId], references: [coupons.id] }),
  purchases: many(purchases),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  user: one(users, { fields: [purchases.userId], references: [users.id] }),
  product: one(products, { fields: [purchases.productId], references: [products.id] }),
  order: one(orders, { fields: [purchases.orderId], references: [orders.id] }),
  downloads: many(downloads),
}));

export const downloadsRelations = relations(downloads, ({ one }) => ({
  user: one(users, { fields: [downloads.userId], references: [users.id] }),
  product: one(products, { fields: [downloads.productId], references: [products.id] }),
  file: one(productFiles, { fields: [downloads.fileId], references: [productFiles.id] }),
  purchase: one(purchases, { fields: [downloads.purchaseId], references: [purchases.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
  purchases: many(purchases),
  downloads: many(downloads),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductFile = typeof productFiles.$inferSelect;
export type NewProductFile = typeof productFiles.$inferInsert;
export type ProductFileGroup = typeof productFileGroups.$inferSelect;
export type NewProductFileGroup = typeof productFileGroups.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type NewPurchase = typeof purchases.$inferInsert;
export type Download = typeof downloads.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type NewCoupon = typeof coupons.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type LandingBlock = typeof landingBlocks.$inferSelect;
export type StoreSetting = typeof storeSettings.$inferSelect;
export type EmailLog = typeof emailLog.$inferSelect;
export type NewEmailLog = typeof emailLog.$inferInsert;
export type AnalyticsEvent = typeof events.$inferSelect;