"use server";

import { and, count, desc, eq, exists, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { ORDER_STATUSES } from "@/lib/constants";

export type SalesFilter = {
  q?: string;
  status?: string;
  productId?: string;
  from?: string;
  to?: string;
};

export type Paginated<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type DashboardStats = {
  revenueByCurrency: { currency: string; total: number }[];
  approvedOrderCount: number;
  pendingOrderCount: number;
  customerCount: number;
  downloadCount: number;
  topProducts: { title: string; quantity: number; revenue: number; currency: string }[];
  recentOrders: {
    id: string;
    code: string;
    status: string;
    total: number;
    currency: string;
    createdAt: Date;
    customerName: string | null;
    customerEmail: string | null;
  }[];
};

export type CustomerRow = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  orderCount: number;
  spending: { currency: string; total: number }[];
  lastPurchaseAt: Date | null;
  downloadCount: number;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  await requireAdmin();
  // Ingresos agrupados POR MONEDA: sumar COP+USD+… en un solo número sería
  // engañoso (decisión ACK: sin tasa de cambio, se agrupa por moneda).
  const revenueByCurrency = await db
    .select({
      currency: schema.orders.currency,
      total: sql<number>`COALESCE(SUM(${schema.orders.total}), 0)`.mapWith(Number),
    })
    .from(schema.orders)
    .where(eq(schema.orders.status, "approved"))
    .groupBy(schema.orders.currency)
    .orderBy(sql`SUM(${schema.orders.total}) DESC`);

  const [approvedCount] = await db
    .select({ c: count() })
    .from(schema.orders)
    .where(eq(schema.orders.status, "approved"));

  const [pendingCount] = await db
    .select({ c: count() })
    .from(schema.orders)
    .where(eq(schema.orders.status, "pending"));

  const [customerCount] = await db
    .select({ c: count() })
    .from(schema.users)
    .where(eq(schema.users.role, "customer"));

  const [downloadCount] = await db.select({ c: count() }).from(schema.downloads);

  const topProducts = await db
    .select({
      title: schema.orderItems.productTitleSnapshot,
      quantity: sql<number>`SUM(${schema.orderItems.quantity})`.mapWith(Number),
      revenue: sql<number>`SUM(${schema.orderItems.unitPrice} * ${schema.orderItems.quantity})`.mapWith(Number),
      currency: sql<string>`MIN(${schema.orderItems.currency})`,
    })
    .from(schema.orderItems)
    .innerJoin(
      schema.orders,
      and(eq(schema.orderItems.orderId, schema.orders.id), eq(schema.orders.status, "approved")),
    )
    .groupBy(schema.orderItems.productTitleSnapshot)
    .orderBy(sql`SUM(${schema.orderItems.quantity}) DESC`)
    .limit(6);

  const recentOrders = await db
    .select({
      id: schema.orders.id,
      code: schema.orders.code,
      status: schema.orders.status,
      total: schema.orders.total,
      currency: schema.orders.currency,
      createdAt: schema.orders.createdAt,
      customerName: schema.users.name,
      customerEmail: schema.users.email,
    })
    .from(schema.orders)
    .innerJoin(schema.users, eq(schema.orders.userId, schema.users.id))
    .orderBy(desc(schema.orders.createdAt))
    .limit(8);

  return {
    revenueByCurrency: revenueByCurrency.map((r) => ({
      currency: r.currency,
      total: r.total,
    })),
    approvedOrderCount: approvedCount?.c ?? 0,
    pendingOrderCount: pendingCount?.c ?? 0,
    customerCount: customerCount?.c ?? 0,
    downloadCount: downloadCount?.c ?? 0,
    topProducts: topProducts.map((p) => ({
      title: p.title,
      quantity: p.quantity,
      revenue: p.revenue,
      currency: p.currency,
    })),
    recentOrders: recentOrders.map((o) => ({
      id: o.id,
      code: o.code,
      status: o.status,
      total: o.total,
      currency: o.currency,
      createdAt: o.createdAt,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
    })),
  };
}

export async function listCustomers(
  search?: string,
  page = 1,
  pageSize = 50,
): Promise<Paginated<CustomerRow>> {
  await requireAdmin();
  const term = search?.trim() ?? "";
  const where = and(
    eq(schema.users.role, "customer"),
    term
      ? or(
          ilike(schema.users.name, `%${term}%`),
          ilike(schema.users.email, `%${term.toLowerCase()}%`),
        )
      : undefined,
  );

  const [{ c: total }] = await db.select({ c: count() }).from(schema.users).where(where);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const users = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(where)
    .orderBy(desc(schema.users.createdAt))
    .limit(pageSize)
    .offset((safePage - 1) * pageSize);

  if (users.length === 0) {
    return { rows: [], total, page: safePage, pageSize, totalPages };
  }

  const ids = users.map((u) => u.id);
  const orderAgg = await db
    .select({
      userId: schema.orders.userId,
      currency: schema.orders.currency,
      orderCount: count(),
      totalSpent: sql<number>`COALESCE(SUM(${schema.orders.total}), 0)`.mapWith(Number),
      lastPurchaseAt: sql<Date | null>`MAX(${schema.orders.paidAt})`,
    })
    .from(schema.orders)
    .where(and(eq(schema.orders.status, "approved"), inArray(schema.orders.userId, ids)))
    .groupBy(schema.orders.userId, schema.orders.currency);

  const downloadAgg = await db
    .select({ userId: schema.downloads.userId, c: count() })
    .from(schema.downloads)
    .where(inArray(schema.downloads.userId, ids))
    .groupBy(schema.downloads.userId);

  const orderMap = new Map<string, { orderCount: number; lastPurchaseAt: Date | null }>();
  const spendingMap = new Map<string, { currency: string; total: number }[]>();
  for (const o of orderAgg) {
    const agg = orderMap.get(o.userId) ?? { orderCount: 0, lastPurchaseAt: null };
    agg.orderCount = (agg.orderCount ?? 0) + o.orderCount;
    if (!agg.lastPurchaseAt || (o.lastPurchaseAt && o.lastPurchaseAt > agg.lastPurchaseAt)) {
      agg.lastPurchaseAt = o.lastPurchaseAt;
    }
    orderMap.set(o.userId, agg);
    const list = spendingMap.get(o.userId) ?? [];
    list.push({ currency: o.currency, total: o.totalSpent });
    spendingMap.set(o.userId, list);
  }
  const downloadMap = new Map(downloadAgg.map((d) => [d.userId, d.c]));

  const rows = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    createdAt: u.createdAt,
    orderCount: orderMap.get(u.id)?.orderCount ?? 0,
    spending: spendingMap.get(u.id) ?? [],
    lastPurchaseAt: orderMap.get(u.id)?.lastPurchaseAt ?? null,
    downloadCount: downloadMap.get(u.id) ?? 0,
  }));
  return { rows, total, page: safePage, pageSize, totalPages };
}

export type CustomerDetail = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  orders: {
    id: string;
    code: string;
    status: string;
    total: number;
    currency: string;
    createdAt: Date;
    items: { productTitle: string; quantity: number; unitPrice: number }[];
  }[];
  downloads: {
    fileName: string;
    productTitle: string;
    createdAt: Date;
  }[];
};

export async function getCustomerDetail(id: string): Promise<CustomerDetail | null> {
  await requireAdmin();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!user) return null;

  const orders = await db.select().from(schema.orders).where(eq(schema.orders.userId, user.id)).orderBy(desc(schema.orders.createdAt));
  const orderIds = orders.map((o) => o.id);
  const items = orderIds.length
    ? await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, orderIds))
    : [];

  const downloads = await db
    .select({
      fileName: schema.productFiles.name,
      productTitle: schema.products.title,
      createdAt: schema.downloads.createdAt,
    })
    .from(schema.downloads)
    .innerJoin(schema.productFiles, eq(schema.downloads.fileId, schema.productFiles.id))
    .innerJoin(schema.products, eq(schema.downloads.productId, schema.products.id))
    .where(eq(schema.downloads.userId, user.id))
    .orderBy(desc(schema.downloads.createdAt));

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    orders: orders.map((o) => ({
      id: o.id,
      code: o.code,
      status: o.status,
      total: o.total,
      currency: o.currency,
      createdAt: o.createdAt,
      items: items
        .filter((i) => i.orderId === o.id)
        .map((i) => ({ productTitle: i.productTitleSnapshot, quantity: i.quantity, unitPrice: i.unitPrice })),
    })),
    downloads,
  };
}

export type SalesRow = {
  id: string;
  code: string;
  status: string;
  total: number;
  currency: string;
  createdAt: Date;
  customerName: string | null;
  customerEmail: string | null;
  items: { productTitle: string; quantity: number; unitPrice: number }[];
};

function parseStatus(status: string | undefined): string | undefined {
  return status && (ORDER_STATUSES as readonly string[]).includes(status) ? status : undefined;
}

function productExists(productId: string) {
  const sub = db
    .select({ one: sql`1` })
    .from(schema.orderItems)
    .where(and(eq(schema.orderItems.productId, productId), eq(schema.orderItems.orderId, schema.orders.id)));
  return exists(sub);
}

export async function listSales(filter: SalesFilter = {}, page = 1, pageSize = 50): Promise<Paginated<SalesRow>> {
  await requireAdmin();
  const conditions: (ReturnType<typeof eq> | ReturnType<typeof ilike> | ReturnType<typeof gte> | ReturnType<typeof lte> | ReturnType<typeof or> | ReturnType<typeof exists>)[] = [];

  const term = filter.q?.trim();
  if (term) {
    conditions.push(
      or(
        ilike(schema.orders.code, `%${term.toUpperCase()}%`),
        ilike(schema.users.email, `%${term.toLowerCase()}%`),
        ilike(schema.users.name, `%${term}%`),
      ),
    );
  }
  const status = parseStatus(filter.status);
  if (status) conditions.push(eq(schema.orders.status, status));
  if (filter.from) conditions.push(gte(schema.orders.createdAt, new Date(`${filter.from}T00:00:00`)));
  if (filter.to) conditions.push(lte(schema.orders.createdAt, new Date(`${filter.to}T23:59:59`)));
  if (filter.productId) conditions.push(productExists(filter.productId));

  const where = conditions.length ? and(...conditions) : undefined;

  // El where puede referenciar emails/nombres de users (búsqueda por texto),
  // así que el COUNT necesita el mismo JOIN a users que la query de filas.
  const [{ c: total }] = await db
    .select({ c: count() })
    .from(schema.orders)
    .innerJoin(schema.users, eq(schema.orders.userId, schema.users.id))
    .where(where);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const orders = await db
    .select({
      id: schema.orders.id,
      code: schema.orders.code,
      status: schema.orders.status,
      total: schema.orders.total,
      currency: schema.orders.currency,
      createdAt: schema.orders.createdAt,
      customerName: schema.users.name,
      customerEmail: schema.users.email,
    })
    .from(schema.orders)
    .innerJoin(schema.users, eq(schema.orders.userId, schema.users.id))
    .where(where)
    .orderBy(desc(schema.orders.createdAt))
    .limit(pageSize)
    .offset((safePage - 1) * pageSize);

  const orderIds = orders.map((o) => o.id);
  const items = orderIds.length
    ? await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, orderIds))
    : [];

  const rows = orders.map((o) => ({
    ...o,
    customerName: o.customerName,
    customerEmail: o.customerEmail,
    items: items
      .filter((i) => i.orderId === o.id)
      .map((i) => ({ productTitle: i.productTitleSnapshot, quantity: i.quantity, unitPrice: i.unitPrice })),
  }));
  return { rows, total, page: safePage, pageSize, totalPages };
}

export async function listProductsForSales() {
  await requireAdmin();
  return db
    .select({ id: schema.products.id, title: schema.products.title })
    .from(schema.products)
    .orderBy(desc(schema.products.createdAt));
}