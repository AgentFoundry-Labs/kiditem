// ============================================
// KidItem Unified Schema — Drizzle ORM + PostgreSQL
// ============================================
// Merged from:
//   - e-commerce-system SQLAlchemy models (sourcing pipeline)
//   - kiditem_dashboard Prisma schema (operations/CRUD)
//
// Constraints:
//   - NO native PG enums (text + app-level StrEnum)
//   - All timestamps with timezone
//   - UUID primary keys
//   - CHECK constraints on monetary/count fields
//
// Phase 1: Service features (this file)
// Phase 2: Agent features (content_generations, coupang_listings,
//           product_performances, douyin_live_rooms, workflows)
// ============================================

import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  uuid,
  numeric,
  real,
  index,
  unique,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// ─── Companies ────────────────────────────────────────────────────────────────
// From dashboard: Company model (거영/해피프렌즈)
// Phase 1 equivalent of e-commerce's Tenant

export const companies = pgTable('companies', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ─── Users ────────────────────────────────────────────────────────────────────
// Merged from e-commerce User + dashboard User
// Roles: admin, manager, member, viewer
// Teams: online, offline, web (from dashboard)

export const users = pgTable(
  'users',
  {
    id: id(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    role: text('role').notNull().default('member'), // admin | manager | member | viewer
    team: text('team'), // online | offline | web
    avatarUrl: text('avatar_url'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('users_email_unique').on(table.email),
    index('users_company_id_idx').on(table.companyId),
  ],
);

// ─── Products ─────────────────────────────────────────────────────────────────
// UNIFIED from e-commerce Product (sourcing) + dashboard Product (operations)
//
// Sourcing fields: source_url, source_platform, cost_cny, raw_data, processed_data
// Operations fields: sell_price, commission_rate, shipping_cost, ad_tier
// Common: name, status, category, coupang_product_id, abc_grade

export const products = pgTable(
  'products',
  {
    id: id(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    // Core
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    status: text('status').notNull().default('draft'), // draft | processing | listed | discontinued
    category: text('category'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    thumbnailUrl: text('thumbnail_url'),

    // Sourcing (from e-commerce)
    sourceUrl: text('source_url'),
    sourcePlatform: text('source_platform'), // alibaba | alibaba_1688 | tiktok | douyin | taobao | other
    costCny: numeric('cost_cny', { precision: 12, scale: 2 }),
    marginRate: numeric('margin_rate', { precision: 5, scale: 4 }),
    rawData: jsonb('raw_data').$type<Record<string, unknown>>(),
    processedData: jsonb('processed_data').$type<Record<string, unknown>>(),
    detailPageUrl: text('detail_page_url'),

    // Operations (from dashboard)
    sellPrice: integer('sell_price'), // KRW
    commissionRate: numeric('commission_rate', { precision: 5, scale: 4 }),
    shippingCost: integer('shipping_cost'), // KRW
    abcGrade: text('abc_grade'), // A | B | C
    adTier: text('ad_tier'), // premium | standard | none

    // Coupang
    coupangProductId: text('coupang_product_id'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('products_company_id_idx').on(table.companyId),
    index('products_status_idx').on(table.status),
    index('products_abc_grade_idx').on(table.abcGrade),
    check('products_sell_price_check', sql`${table.sellPrice} > 0 OR ${table.sellPrice} IS NULL`),
    check('products_cost_cny_check', sql`${table.costCny} > 0 OR ${table.costCny} IS NULL`),
    check(
      'products_margin_rate_check',
      sql`(${table.marginRate} >= 0 AND ${table.marginRate} <= 1) OR ${table.marginRate} IS NULL`,
    ),
  ],
);

// ─── Inventory ────────────────────────────────────────────────────────────────
// Merged from e-commerce Inventory + dashboard Inventory
// 1:1 with Product

export const inventory = pgTable(
  'inventory',
  {
    id: id(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .unique()
      .references(() => products.id, { onDelete: 'cascade' }),

    // Stock levels
    currentStock: integer('current_stock').notNull().default(0),
    reservedStock: integer('reserved_stock').notNull().default(0),

    // Replenishment
    safetyStock: integer('safety_stock').notNull().default(0),
    reorderPoint: integer('reorder_point').notNull().default(0),
    reorderQuantity: integer('reorder_quantity').notNull().default(0),
    leadTimeDays: integer('lead_time_days'),

    // Analytics
    dailySalesAvg: real('daily_sales_avg').notNull().default(0),

    lastRestockedAt: timestamp('last_restocked_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('inventory_company_id_idx').on(table.companyId),
    index('inventory_product_id_idx').on(table.productId),
    check('inventory_current_stock_check', sql`${table.currentStock} >= 0`),
    check('inventory_reserved_stock_check', sql`${table.reservedStock} >= 0`),
    check('inventory_safety_stock_check', sql`${table.safetyStock} >= 0`),
  ],
);

// ─── Orders ───────────────────────────────────────────────────────────────────
// From dashboard: Coupang sales orders (customer → seller)
// NOT the same as PurchaseOrder (seller → supplier)

export const orders = pgTable(
  'orders',
  {
    id: id(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'set null',
    }),

    // Order identification
    orderNumber: text('order_number').notNull(),
    platform: text('platform').notNull(), // coupang | naver | gmarket | 11st | ...
    coupangOrderId: text('coupang_order_id'),

    // Customer
    customerName: text('customer_name').notNull().default(''),

    // Line items (denormalized for simplicity in Phase 1)
    productName: text('product_name').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unitPrice: integer('unit_price').notNull(), // KRW
    totalPrice: integer('total_price').notNull(), // KRW

    // Status
    status: text('status').notNull().default('pending'),
    // pending | processing | shipped | delivered | cancelled | returned

    // Shipping
    trackingNumber: text('tracking_number'),
    shippingCompany: text('shipping_company'),

    orderedAt: timestamp('ordered_at', { withTimezone: true }).notNull().defaultNow(),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('orders_company_id_idx').on(table.companyId),
    index('orders_product_id_idx').on(table.productId),
    index('orders_status_idx').on(table.status),
    index('orders_platform_idx').on(table.platform),
    index('orders_ordered_at_idx').on(table.orderedAt),
    check('orders_quantity_check', sql`${table.quantity} > 0`),
    check('orders_unit_price_check', sql`${table.unitPrice} > 0`),
    check('orders_total_price_check', sql`${table.totalPrice} > 0`),
  ],
);

// ─── Purchase Orders ──────────────────────────────────────────────────────────
// From e-commerce: Supplier orders (seller → 1688/factory)
// Completely different entity from Orders (customer → seller)

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: id(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    supplierName: text('supplier_name').notNull(),
    supplierContact: text('supplier_contact'),
    totalAmountCny: numeric('total_amount_cny', { precision: 12, scale: 2 }).notNull(),

    status: text('status').notNull().default('draft'),
    // draft | sent | confirmed | shipped | received

    orderDate: date('order_date').notNull().defaultNow(),
    expectedDeliveryDate: date('expected_delivery_date'),
    trackingNumber: text('tracking_number'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('purchase_orders_company_id_idx').on(table.companyId),
    index('purchase_orders_status_idx').on(table.status),
    check('purchase_orders_total_check', sql`${table.totalAmountCny} > 0`),
  ],
);

export const purchaseOrderItems = pgTable(
  'purchase_order_items',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'set null',
    }),

    productName: text('product_name').notNull(),
    quantity: integer('quantity').notNull(),
    unitPriceCny: numeric('unit_price_cny', { precision: 12, scale: 2 }).notNull(),

    createdAt: createdAt(),
  },
  (table) => [
    index('purchase_order_items_order_id_idx').on(table.orderId),
    check('purchase_order_items_quantity_check', sql`${table.quantity} > 0`),
    check('purchase_order_items_price_check', sql`${table.unitPriceCny} > 0`),
  ],
);

// ─── Ads ──────────────────────────────────────────────────────────────────────
// From dashboard: Campaign tracking per product

export const ads = pgTable(
  'ads',
  {
    id: id(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),

    platform: text('platform').notNull().default('coupang'), // coupang | naver | ...
    campaignName: text('campaign_name'),
    dailyBudget: integer('daily_budget'), // KRW
    spend: integer('spend').notNull().default(0), // KRW
    impressions: integer('impressions').notNull().default(0),
    clicks: integer('clicks').notNull().default(0),
    conversions: integer('conversions').notNull().default(0),
    roas: numeric('roas', { precision: 10, scale: 2 }),

    date: date('date').notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('ads_company_id_idx').on(table.companyId),
    index('ads_product_id_idx').on(table.productId),
    index('ads_date_idx').on(table.date),
    check('ads_spend_check', sql`${table.spend} >= 0`),
    check('ads_impressions_check', sql`${table.impressions} >= 0`),
    check('ads_clicks_check', sql`${table.clicks} >= 0`),
    check('ads_conversions_check', sql`${table.conversions} >= 0`),
  ],
);

// ─── Profit & Loss ────────────────────────────────────────────────────────────
// From dashboard: Monthly P&L by product

export const profitLoss = pgTable(
  'profit_loss',
  {
    id: id(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),

    year: integer('year').notNull(),
    month: integer('month').notNull(), // 1-12

    revenue: integer('revenue').notNull().default(0), // KRW
    cogs: integer('cogs').notNull().default(0), // Cost of goods sold
    commission: integer('commission').notNull().default(0), // Platform commission
    shippingCost: integer('shipping_cost').notNull().default(0),
    adCost: integer('ad_cost').notNull().default(0),
    otherCost: integer('other_cost').notNull().default(0),
    netProfit: integer('net_profit').notNull().default(0),

    orderCount: integer('order_count').notNull().default(0),
    returnCount: integer('return_count').notNull().default(0),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('profit_loss_company_id_idx').on(table.companyId),
    index('profit_loss_product_id_idx').on(table.productId),
    index('profit_loss_year_month_idx').on(table.year, table.month),
    check('profit_loss_month_check', sql`${table.month} >= 1 AND ${table.month} <= 12`),
  ],
);

// ─── Thumbnails ───────────────────────────────────────────────────────────────
// From dashboard: Image CTR tracking for optimization

export const thumbnails = pgTable(
  'thumbnails',
  {
    id: id(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),

    imageUrl: text('image_url').notNull(),
    strategy: text('strategy').notNull().default('standard'), // premium | standard
    status: text('status').notNull().default('active'), // active | warning | critical
    ctr: numeric('ctr', { precision: 5, scale: 4 }), // click-through rate (0.0-1.0)
    impressions: integer('impressions').notNull().default(0),
    clicks: integer('clicks').notNull().default(0),

    measuredAt: timestamp('measured_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('thumbnails_company_id_idx').on(table.companyId),
    index('thumbnails_product_id_idx').on(table.productId),
    check('thumbnails_impressions_check', sql`${table.impressions} >= 0`),
    check('thumbnails_clicks_check', sql`${table.clicks} >= 0`),
  ],
);

// ─── Reviews ──────────────────────────────────────────────────────────────────
// From dashboard: Product review monitoring

export const reviews = pgTable(
  'reviews',
  {
    id: id(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),

    platform: text('platform').notNull().default('coupang'),
    rating: integer('rating').notNull(), // 1-5
    content: text('content'),
    reviewerName: text('reviewer_name'),

    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [
    index('reviews_company_id_idx').on(table.companyId),
    index('reviews_product_id_idx').on(table.productId),
    check('reviews_rating_check', sql`${table.rating} >= 1 AND ${table.rating} <= 5`),
  ],
);

// ─── Alerts ───────────────────────────────────────────────────────────────────
// From dashboard: System notifications

export const alerts = pgTable(
  'alerts',
  {
    id: id(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'set null',
    }),

    type: text('type').notNull(),
    // profit_low | ad_high | stock_low | thumbnail_drop | minus_product | ...
    severity: text('severity').notNull().default('warning'), // info | warning | critical
    title: text('title').notNull(),
    message: text('message'),
    isRead: boolean('is_read').notNull().default(false),

    createdAt: createdAt(),
  },
  (table) => [
    index('alerts_company_id_idx').on(table.companyId),
    index('alerts_is_read_idx').on(table.isRead),
    index('alerts_type_idx').on(table.type),
    index('alerts_created_at_idx').on(table.createdAt),
  ],
);

// ─── Inferred TypeScript Types ────────────────────────────────────────────────

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type Inventory = typeof inventory.$inferSelect;
export type NewInventory = typeof inventory.$inferInsert;

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type NewPurchaseOrder = typeof purchaseOrders.$inferInsert;

export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type NewPurchaseOrderItem = typeof purchaseOrderItems.$inferInsert;

export type Ad = typeof ads.$inferSelect;
export type NewAd = typeof ads.$inferInsert;

export type ProfitLoss = typeof profitLoss.$inferSelect;
export type NewProfitLoss = typeof profitLoss.$inferInsert;

export type Thumbnail = typeof thumbnails.$inferSelect;
export type NewThumbnail = typeof thumbnails.$inferInsert;

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;

export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
