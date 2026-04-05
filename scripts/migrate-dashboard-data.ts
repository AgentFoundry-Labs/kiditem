#!/usr/bin/env tsx
/**
 * migrate-dashboard-data.ts
 *
 * Migrates all data from the kiditem_dashboard SQLite DB into kiditem PostgreSQL.
 *
 * Usage:
 *   npx tsx scripts/migrate-dashboard-data.ts [sqlite-path]
 *
 * Default SQLite path: ~/workspace/kiditem_dashboard/prisma/dev.db
 * Target PostgreSQL: postgresql://kiditem:kiditem@localhost:5433/kiditem
 */

import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { v5 as uuidv5 } from 'uuid';
import path from 'path';
import os from 'os';

// ─── Config ──────────────────────────────────────────────────────────────────

const SQLITE_PATH =
  process.argv[2] ||
  path.join(os.homedir(), 'workspace/kiditem_dashboard/prisma/dev.db');

const PG_URL = 'postgresql://kiditem:kiditem@localhost:5433/kiditem';

// Fixed namespace for deterministic CUID→UUID conversion
const UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // DNS namespace

// Tables that are kiditem-only — never touch during migration
const SKIP_PG_TABLES = new Set([
  'agent_tasks',
  'agent_logs',
  'douyin_live_rooms',
  'douyin_live_products',
  'content_generations',
  'coupang_listings',
  'product_performances',
  'workflow_templates',
  'workflow_runs',
  'workflow_step_runs',
  'credentials',
  'activity_events',
  'coupang_orders',
  'coupang_order_items',
  'coupang_returns',
  'coupang_return_items',
  'product_items',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Deterministic CUID → UUID via UUIDv5 */
function toUUID(cuid: string): string {
  return uuidv5(cuid, UUID_NAMESPACE);
}

/** Map a CUID FK value: null stays null, otherwise convert */
function mapFK(
  idMap: Map<string, string>,
  oldId: string | null | undefined,
): string | null {
  if (!oldId) return null;
  return idMap.get(oldId) ?? null;
}

/** SQLite datetime (epoch ms number or ISO string) → ISO 8601 with TZ */
function toTimestamptz(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === 'number') {
    return new Date(val).toISOString();
  }
  if (typeof val === 'string') {
    // Already ISO string from SQLite
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }
  return null;
}

/** SQLite datetime → Date-only string YYYY-MM-DD */
function toDate(val: unknown): string | null {
  const iso = toTimestamptz(val);
  if (!iso) return null;
  return iso.slice(0, 10);
}

/** Float→Int (KRW rounding) */
function toInt(val: unknown): number {
  if (val == null) return 0;
  return Math.round(Number(val));
}

/** Float → Decimal string (for Decimal columns) */
function toDecimal(val: unknown, fallback = '0'): string {
  if (val == null) return fallback;
  return String(Number(val));
}

/** Bool from SQLite (0/1) */
function toBool(val: unknown): boolean {
  return val === 1 || val === true || val === 'true';
}

// ─── Logging ─────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[migrate] ${msg}`);
}
function logTable(name: string, count: number) {
  console.log(`  ✓ ${name}: ${count} rows`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log(`Source: ${SQLITE_PATH}`);
  log(`Target: ${PG_URL}`);

  // Open SQLite
  const sqlite = new Database(SQLITE_PATH, { readonly: true });

  // Connect PostgreSQL
  const pool = new Pool({ connectionString: PG_URL });
  const pg = await pool.connect();

  try {
    // Discover which SQLite tables have data
    const sqliteTables = sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%'`,
      )
      .all() as { name: string }[];
    log(`Found ${sqliteTables.length} SQLite tables`);

    // ── Read ALL source data ───────────────────────────────────────────────
    function readTable(name: string): Record<string, unknown>[] {
      return sqlite.prepare(`SELECT * FROM "${name}"`).all() as Record<
        string,
        unknown
      >[];
    }

    const srcCompanies = readTable('Company');
    const srcUsers = readTable('User');
    const srcProducts = readTable('Product');
    const srcInventory = readTable('Inventory');
    const srcOrders = readTable('Order');
    const srcAds = readTable('Ad');
    const srcProfitLoss = readTable('ProfitLoss');
    const srcThumbnails = readTable('Thumbnail');
    const srcReviews = readTable('Review');
    const srcPurchaseOrders = readTable('PurchaseOrder');
    const srcAlerts = readTable('Alert');
    const srcSuppliers = readTable('Supplier');
    const srcSupplierProducts = readTable('SupplierProduct');
    const srcBundleProducts = readTable('BundleProduct');
    const srcBundleItems = readTable('BundleItem');
    const srcProductLocations = readTable('ProductLocation');
    const srcSettlements = readTable('Settlement');
    const srcPickingLists = readTable('PickingList');
    const srcPickingItems = readTable('PickingItem');
    const srcShipments = readTable('Shipment');
    const srcWarehouses = readTable('Warehouse');
    const srcDeliveryRules = readTable('DeliveryRule');
    const srcNotificationLogs = readTable('NotificationLog');
    const srcCategoryMappings = readTable('CategoryMapping');
    const srcFilterPresets = readTable('FilterPreset');
    const srcNotificationTemplates = readTable('NotificationTemplate');
    const srcCommonCodes = readTable('CommonCode');
    const srcOptionMasters = readTable('OptionMaster');
    const srcCommissionRates = readTable('CommissionRate');
    const srcProductTemplates = readTable('ProductTemplate');
    const srcAnnouncements = readTable('Announcement');
    const srcSalesPlans = readTable('SalesPlan');
    const srcAuditLogs = readTable('AuditLog');
    const srcProductSamples = readTable('ProductSample');
    const srcPriceHistories = readTable('PriceHistory');
    const srcProductNameMappings = readTable('ProductNameMapping');
    const srcStockTransfers = readTable('StockTransfer');
    const srcProductMemos = readTable('ProductMemo');
    const srcStockAudits = readTable('StockAudit');
    const srcReturnTransfers = readTable('ReturnTransfer');
    const srcStockTransactions = readTable('StockTransaction');
    const srcManualLedgers = readTable('ManualLedger');
    const srcProcessingCosts = readTable('ProcessingCost');
    const srcSupplierPayments = readTable('SupplierPayment');
    const srcGradeHistories = readTable('GradeHistory');
    const srcTrafficStats = readTable('TrafficStats');
    const srcCSRecords = readTable('CSRecord');
    const srcCompanyInfo = readTable('CompanyInfo');
    const srcGiftRules = readTable('GiftRule');
    const srcStockAllocations = readTable('StockAllocation');
    const srcPackGroups = readTable('PackGroup');
    const srcUnshippedItems = readTable('UnshippedItem');
    const srcStockMovementSummaries = readTable('StockMovementSummary');
    const srcSalesAnalyses = readTable('SalesAnalysis');

    log('All source data loaded');

    // ── Build ID maps ──────────────────────────────────────────────────────
    // Map old CUID → new UUID for every entity
    const idMap = new Map<string, string>();
    function registerIds(rows: Record<string, unknown>[]) {
      for (const r of rows) {
        const oldId = r.id as string;
        idMap.set(oldId, toUUID(oldId));
      }
    }

    // Register all IDs upfront
    [
      srcCompanies,
      srcUsers,
      srcProducts,
      srcInventory,
      srcOrders,
      srcAds,
      srcProfitLoss,
      srcThumbnails,
      srcReviews,
      srcPurchaseOrders,
      srcAlerts,
      srcSuppliers,
      srcSupplierProducts,
      srcBundleProducts,
      srcBundleItems,
      srcProductLocations,
      srcSettlements,
      srcPickingLists,
      srcPickingItems,
      srcShipments,
      srcWarehouses,
      srcDeliveryRules,
      srcNotificationLogs,
      srcCategoryMappings,
      srcFilterPresets,
      srcNotificationTemplates,
      srcCommonCodes,
      srcOptionMasters,
      srcCommissionRates,
      srcProductTemplates,
      srcAnnouncements,
      srcSalesPlans,
      srcAuditLogs,
      srcProductSamples,
      srcPriceHistories,
      srcProductNameMappings,
      srcStockTransfers,
      srcProductMemos,
      srcStockAudits,
      srcReturnTransfers,
      srcStockTransactions,
      srcManualLedgers,
      srcProcessingCosts,
      srcSupplierPayments,
      srcGradeHistories,
      srcTrafficStats,
      srcCSRecords,
      srcCompanyInfo,
      srcGiftRules,
      srcStockAllocations,
      srcPackGroups,
      srcUnshippedItems,
      srcStockMovementSummaries,
      srcSalesAnalyses,
    ].forEach(registerIds);

    // Default company UUID — use first Company's converted UUID
    const defaultCompanyId =
      srcCompanies.length > 0
        ? toUUID(srcCompanies[0].id as string)
        : toUUID('default-company');

    log(`Default companyId: ${defaultCompanyId}`);
    log(`ID map: ${idMap.size} entries`);

    // ── Helper: bulk insert with parameterized queries ─────────────────────
    async function bulkInsert(
      tableName: string,
      columns: string[],
      rows: unknown[][],
    ) {
      if (rows.length === 0) {
        logTable(tableName, 0);
        return;
      }

      // Batch inserts in chunks of 100
      const BATCH_SIZE = 100;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const values: unknown[] = [];
        const valuePlaceholders: string[] = [];

        for (const row of batch) {
          const placeholders = row.map(
            (_, ci) => `$${values.length + ci + 1}`,
          );
          valuePlaceholders.push(`(${placeholders.join(', ')})`);
          values.push(...row);
        }

        const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${valuePlaceholders.join(', ')} ON CONFLICT DO NOTHING`;
        await pg.query(sql, values);
      }

      logTable(tableName, rows.length);
    }

    // ── Clear migrated tables (idempotent) ─────────────────────────────────
    // Delete in reverse FK order. Only delete from dashboard-sourced tables.
    log('Clearing target tables (dashboard data only)...');

    await pg.query('BEGIN');

    // Reverse FK order: children first, parents last
    const clearOrder = [
      // Agent platform (must come before companies)
      'agent_permission_denials',
      'agent_action_snapshots',
      'agent_wakeup_requests',
      'agent_workflows',
      'heartbeat_runs',
      'agent_runtime_state',
      'agent_definitions',
      'agent_logs',
      'agent_tasks',
      'execution_logs',
      'execution_tasks',
      'execution_workers',
      'workflow_step_runs',
      'workflow_runs',
      'workflow_templates',
      'workflow_marketplace',
      'agent_marketplace',
      'feature_gates',
      'activity_events',
      // Deep children
      'supplier_payments',
      'stock_movement_summaries',
      'sales_analyses',
      'stock_allocations',
      'unshipped_items',
      'pack_groups',
      'gift_rules',
      'company_info',
      'cs_records',
      'grade_histories',
      'traffic_stats',
      'processing_costs',
      'manual_ledgers',
      'stock_transactions',
      'return_transfers',
      'stock_audits',
      'product_memos',
      'stock_transfers',
      'product_name_mappings',
      'price_histories',
      'product_samples',
      'audit_logs',
      'announcements',
      'sales_plans',
      'product_templates',
      'commission_rates',
      'option_masters',
      'common_codes',
      'notification_templates',
      'notification_logs',
      'filter_presets',
      'category_mappings',
      'delivery_rules',
      'picking_items',
      'picking_lists',
      'shipments',
      'settlements',
      'bundle_items',
      'bundle_products',
      'product_locations',
      'supplier_products',
      'alerts',
      'purchase_order_items',
      'purchase_orders',
      'reviews',
      'thumbnails',
      'profit_loss',
      'ads',
      'orders',
      'inventory',
      'products',
      'warehouses',
      'suppliers',
      'users',
      'companies',
    ];

    for (const table of clearOrder) {
      if (!SKIP_PG_TABLES.has(table)) {
        await pg.query(`DELETE FROM ${table}`);
      }
    }

    log('Tables cleared');

    // ══════════════════════════════════════════════════════════════════════════
    // INSERT in FK dependency order
    // ══════════════════════════════════════════════════════════════════════════

    log('Migrating Company...');
    await bulkInsert(
      'companies',
      ['id', 'name', 'slug', 'business_number', 'is_active', 'created_at', 'updated_at'],
      srcCompanies.map((r) => [
        toUUID(r.id as string),
        r.name as string,
        (r.name as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'default',
        r.businessNumber ?? null,
        true,
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        new Date().toISOString(),
      ]),
    );

    // ── Users ──────────────────────────────────────────────────────────────
    log('Migrating User...');
    await bulkInsert(
      'users',
      ['id', 'company_id', 'email', 'name', 'password', 'role', 'team', 'last_login_at', 'created_at', 'updated_at'],
      srcUsers.map((r) => [
        toUUID(r.id as string),
        mapFK(idMap, r.companyId as string) ?? defaultCompanyId,
        r.email as string,
        r.name as string,
        r.password ?? null,
        r.role ?? 'member',
        r.team ?? null,
        toTimestamptz(r.lastLoginAt),
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        new Date().toISOString(),
      ]),
    );

    // ── Suppliers ──────────────────────────────────────────────────────────
    log('Migrating Supplier...');
    await bulkInsert(
      'suppliers',
      ['id', 'company_id', 'name', 'contact_name', 'phone', 'email', 'address', 'lead_time_days', 'payment_terms', 'notes', 'status', 'created_at', 'updated_at'],
      srcSuppliers.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.name as string,
        r.contactName ?? null,
        r.phone ?? null,
        r.email ?? null,
        r.address ?? null,
        r.leadTimeDays ?? 7,
        r.paymentTerms ?? null,
        r.notes ?? null,
        r.status ?? 'active',
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        toTimestamptz(r.updatedAt) ?? new Date().toISOString(),
      ]),
    );

    // ── Warehouses ─────────────────────────────────────────────────────────
    log('Migrating Warehouse...');
    await bulkInsert(
      'warehouses',
      ['id', 'company_id', 'name', 'code', 'address', 'manager', 'phone', 'is_default', 'status', 'created_at', 'updated_at'],
      srcWarehouses.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.name as string,
        r.code ?? null,
        r.address ?? null,
        r.manager ?? null,
        r.phone ?? null,
        toBool(r.isDefault),
        r.status ?? 'active',
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        toTimestamptz(r.updatedAt) ?? new Date().toISOString(),
      ]),
    );

    // ── Products ───────────────────────────────────────────────────────────
    log('Migrating Product...');
    await bulkInsert(
      'products',
      [
        'id', 'company_id', 'name', 'description', 'sku', 'barcode',
        'status', 'category', 'thumbnail_url', 'cost_price', 'sell_price',
        'commission_rate', 'shipping_cost', 'other_cost', 'abc_grade',
        'ad_tier', 'ad_budget_limit', 'coupang_product_id', 'image_url',
        'thumbnail_strategy', 'is_deleted', 'deleted_at', 'memo',
        'created_at', 'updated_at',
      ],
      srcProducts.map((r) => [
        toUUID(r.id as string),
        mapFK(idMap, r.companyId as string) ?? defaultCompanyId,
        r.name as string,
        '', // description
        r.sku ?? null,
        r.barcode ?? null,
        r.status ?? 'active',
        r.category ?? null,
        r.imageUrl ?? null, // thumbnailUrl = imageUrl
        toInt(r.costPrice) || null,
        toInt(r.sellPrice) || null,
        toDecimal(Number(r.commissionRate ?? 0) / 100, '0'),
        toInt(r.shippingCost),
        toInt(r.otherCost),
        r.abcGrade ?? null,
        r.adTier ?? null,
        r.adBudgetLimit != null ? toInt(r.adBudgetLimit) : null,
        r.coupangId ?? null,
        r.imageUrl ?? null,
        r.thumbnailStrategy ?? 'standard',
        toBool(r.isDeleted),
        toTimestamptz(r.deletedAt),
        r.memo ?? null,
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        toTimestamptz(r.updatedAt) ?? new Date().toISOString(),
      ]),
    );

    // ── Inventory ──────────────────────────────────────────────────────────
    log('Migrating Inventory...');
    await bulkInsert(
      'inventory',
      ['id', 'company_id', 'product_id', 'current_stock', 'safety_stock', 'reorder_point', 'lead_time_days', 'daily_sales_avg', 'created_at', 'updated_at'],
      srcInventory
        .filter((r) => mapFK(idMap, r.productId as string) !== null)
        .map((r) => [
          toUUID(r.id as string),
          defaultCompanyId,
          mapFK(idMap, r.productId as string)!,
          Math.max(0, (r.currentStock as number) ?? 0),
          Math.max(0, (r.safetyStock as number) ?? 0),
          Math.max(0, (r.reorderPoint as number) ?? 0),
          r.leadTimeDays ?? null,
          toDecimal(r.avgDailySales, '0'),
          toTimestamptz(r.updatedAt) ?? new Date().toISOString(),
          toTimestamptz(r.updatedAt) ?? new Date().toISOString(),
        ]),
    );

    // ── BundleProducts ─────────────────────────────────────────────────────
    log('Migrating BundleProduct...');
    await bulkInsert(
      'bundle_products',
      ['id', 'company_id', 'name', 'sku', 'sell_price', 'status', 'coupang_id', 'created_at', 'updated_at'],
      srcBundleProducts.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.name as string,
        r.sku ?? null,
        toInt(r.sellPrice),
        r.status ?? 'active',
        r.coupangId ?? null,
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        toTimestamptz(r.updatedAt) ?? new Date().toISOString(),
      ]),
    );

    // ── BundleItems ────────────────────────────────────────────────────────
    log('Migrating BundleItem...');
    await bulkInsert(
      'bundle_items',
      ['id', 'bundle_id', 'product_id', 'quantity'],
      srcBundleItems
        .filter(
          (r) =>
            mapFK(idMap, r.bundleId as string) !== null &&
            mapFK(idMap, r.productId as string) !== null,
        )
        .map((r) => [
          toUUID(r.id as string),
          mapFK(idMap, r.bundleId as string)!,
          mapFK(idMap, r.productId as string)!,
          r.quantity ?? 1,
        ]),
    );

    // ── SupplierProducts ───────────────────────────────────────────────────
    log('Migrating SupplierProduct...');
    await bulkInsert(
      'supplier_products',
      ['id', 'supplier_id', 'product_id', 'supply_price', 'min_order_qty', 'is_main', 'created_at'],
      srcSupplierProducts
        .filter(
          (r) =>
            mapFK(idMap, r.supplierId as string) !== null &&
            mapFK(idMap, r.productId as string) !== null,
        )
        .map((r) => [
          toUUID(r.id as string),
          mapFK(idMap, r.supplierId as string)!,
          mapFK(idMap, r.productId as string)!,
          toInt(r.supplyPrice),
          r.minOrderQty ?? 1,
          toBool(r.isMain),
          toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        ]),
    );

    // ── ProductLocations ───────────────────────────────────────────────────
    log('Migrating ProductLocation...');
    await bulkInsert(
      'product_locations',
      ['id', 'product_id', 'zone', 'rack', 'shelf', 'bin_code', 'notes', 'updated_at'],
      srcProductLocations
        .filter((r) => mapFK(idMap, r.productId as string) !== null)
        .map((r) => [
          toUUID(r.id as string),
          mapFK(idMap, r.productId as string)!,
          r.zone ?? null,
          r.rack ?? null,
          r.shelf ?? null,
          r.binCode ?? null,
          r.notes ?? null,
          toTimestamptz(r.updatedAt) ?? new Date().toISOString(),
        ]),
    );

    // ── Orders ─────────────────────────────────────────────────────────────
    // Dashboard Order is per-product: productId, quantity, amount
    // kiditem Order: needs orderNumber, platform, productName, unitPrice, totalPrice
    log('Migrating Order...');
    await bulkInsert(
      'orders',
      [
        'id', 'company_id', 'product_id', 'order_number', 'platform',
        'coupang_order_id', 'product_name', 'quantity', 'unit_price', 'total_price',
        'status', 'receiver_name', 'receiver_phone', 'receiver_addr', 'memo',
        'ordered_at', 'created_at', 'updated_at',
      ],
      srcOrders.map((r) => {
        const productId = mapFK(idMap, r.productId as string);
        const amount = toInt(r.amount);
        const qty = (r.quantity as number) || 1;
        const unitPrice = qty > 0 ? Math.round(amount / qty) : amount;
        // Try to get product name from srcProducts
        const product = srcProducts.find((p) => p.id === r.productId);
        const productName = product ? (product.name as string) : 'Unknown';
        // Use coupangOrderId as orderNumber if available, else use id
        const orderNumber = (r.coupangOrderId as string) || (r.id as string);

        return [
          toUUID(r.id as string),
          defaultCompanyId,
          productId,
          orderNumber,
          r.orderType ?? 'coupang',
          r.coupangOrderId ?? null,
          productName,
          qty,
          unitPrice,
          amount,
          r.status ?? 'pending',
          r.receiverName ?? null,
          r.receiverPhone ?? null,
          r.receiverAddr ?? null,
          r.memo ?? null,
          toTimestamptz(r.orderedAt) ?? new Date().toISOString(),
          toTimestamptz(r.orderedAt) ?? new Date().toISOString(),
          new Date().toISOString(),
        ];
      }),
    );

    // ── PurchaseOrders ─────────────────────────────────────────────────────
    // Dashboard: per-product PO (productId, quantity, unitCost, totalCost, supplier)
    // kiditem: header PO (supplierName, totalAmountCny) + PurchaseOrderItem children
    log('Migrating PurchaseOrder → PurchaseOrder + PurchaseOrderItem...');

    // Create PO headers
    const poItemUUIDs: { poId: string; itemId: string; productId: string | null; productName: string; qty: number; unitCost: number }[] = [];

    await bulkInsert(
      'purchase_orders',
      [
        'id', 'company_id', 'supplier_name', 'supplier_contact', 'supplier_id',
        'total_amount_cny', 'status', 'order_date', 'expected_delivery_date',
        'received_at', 'received_qty', 'defect_qty', 'defect_type', 'defect_action',
        'defect_note', 'inspected_at', 'inspected_by',
        'created_at', 'updated_at',
      ],
      srcPurchaseOrders.map((r) => {
        const newId = toUUID(r.id as string);
        const productId = mapFK(idMap, r.productId as string);
        const product = srcProducts.find((p) => p.id === r.productId);
        const productName = product ? (product.name as string) : 'Unknown';
        const qty = (r.quantity as number) || 0;
        const unitCost = Number(r.unitCost) || 0;

        // Create PO item entry for later insert
        poItemUUIDs.push({
          poId: newId,
          itemId: uuidv5(`${r.id as string}-item-0`, UUID_NAMESPACE),
          productId,
          productName,
          qty,
          unitCost,
        });

        return [
          newId,
          defaultCompanyId,
          (r.supplier as string) || 'Unknown',
          null, // supplier_contact
          mapFK(idMap, r.supplierId as string),
          toDecimal(Math.max(0.01, Number(r.totalCost ?? 0)), '0.01'),
          r.status ?? 'draft',
          toDate(r.orderedAt) ?? new Date().toISOString().slice(0, 10),
          toDate(r.expectedAt),
          toTimestamptz(r.receivedAt),
          r.receivedQty != null ? (r.receivedQty as number) : null,
          r.defectQty != null ? (r.defectQty as number) : null,
          r.defectType ?? null,
          r.defectAction ?? null,
          r.defectNote ?? null,
          toTimestamptz(r.inspectedAt),
          r.inspectedBy ?? null,
          toTimestamptz(r.orderedAt) ?? new Date().toISOString(),
          new Date().toISOString(),
        ];
      }),
    );

    // Insert PO items
    await bulkInsert(
      'purchase_order_items',
      ['id', 'order_id', 'product_id', 'product_name', 'quantity', 'unit_price_cny', 'created_at'],
      poItemUUIDs.map((item) => [
        item.itemId,
        item.poId,
        item.productId,
        item.productName,
        item.qty,
        toDecimal(Math.max(0.01, item.unitCost), '0.01'),
        new Date().toISOString(),
      ]),
    );

    // ── Ads ────────────────────────────────────────────────────────────────
    log('Migrating Ad...');
    await bulkInsert(
      'ads',
      [
        'id', 'company_id', 'product_id', 'platform', 'campaign_name', 'spend',
        'impressions', 'clicks', 'conversions', 'revenue',
        'billing_type', 'sale_type', 'ad_type', 'campaign_id',
        'ad_group', 'ad_product_name', 'ad_option_id', 'conv_product_name',
        'conv_option_id', 'placement', 'keyword', 'note',
        'direct_orders_1d', 'indirect_orders_1d', 'direct_qty_1d', 'indirect_qty_1d',
        'direct_revenue_1d', 'indirect_revenue_1d', 'total_roas_1d', 'direct_roas_1d',
        'total_orders_14d', 'direct_orders_14d', 'indirect_orders_14d',
        'total_qty_14d', 'direct_qty_14d', 'indirect_qty_14d',
        'total_revenue_14d', 'direct_revenue_14d', 'indirect_revenue_14d',
        'total_roas_14d', 'direct_roas_14d',
        'campaign_start_date', 'campaign_end_date',
        'date', 'created_at', 'updated_at',
      ],
      srcAds
        .filter((r) => mapFK(idMap, r.productId as string) !== null)
        .map((r) => [
          toUUID(r.id as string),
          defaultCompanyId,
          mapFK(idMap, r.productId as string)!,
          'coupang',
          r.campaignName ?? null,
          toInt(r.spend),
          (r.impressions as number) ?? 0,
          (r.clicks as number) ?? 0,
          (r.conversions as number) ?? 0,
          toInt(r.revenue),
          r.billingType ?? null,
          r.saleType ?? null,
          r.adType ?? null,
          r.campaignId ?? null,
          r.adGroup ?? null,
          r.adProductName ?? null,
          r.adOptionId ?? null,
          r.convProductName ?? null,
          r.convOptionId ?? null,
          r.placement ?? null,
          r.keyword ?? null,
          r.note ?? null,
          (r.directOrders1d as number) ?? 0,
          (r.indirectOrders1d as number) ?? 0,
          (r.directQty1d as number) ?? 0,
          (r.indirectQty1d as number) ?? 0,
          toInt(r.directRevenue1d),
          toInt(r.indirectRevenue1d),
          toDecimal(r.totalRoas1d, '0'),
          toDecimal(r.directRoas1d, '0'),
          (r.totalOrders14d as number) ?? 0,
          (r.directOrders14d as number) ?? 0,
          (r.indirectOrders14d as number) ?? 0,
          (r.totalQty14d as number) ?? 0,
          (r.directQty14d as number) ?? 0,
          (r.indirectQty14d as number) ?? 0,
          toInt(r.totalRevenue14d),
          toInt(r.directRevenue14d),
          toInt(r.indirectRevenue14d),
          toDecimal(r.totalRoas14d, '0'),
          toDecimal(r.directRoas14d, '0'),
          r.campaignStartDate ? toDate(r.campaignStartDate) : null,
          r.campaignEndDate ? toDate(r.campaignEndDate) : null,
          toDate(r.date) ?? new Date().toISOString().slice(0, 10),
          toTimestamptz(r.date) ?? new Date().toISOString(),
          new Date().toISOString(),
        ]),
    );

    // ── ProfitLoss ─────────────────────────────────────────────────────────
    // Dashboard: period (String like "2025-05"), productId
    // kiditem: year (Int), month (Int), productId, companyId
    log('Migrating ProfitLoss...');
    await bulkInsert(
      'profit_loss',
      [
        'id', 'company_id', 'product_id', 'year', 'month',
        'revenue', 'cogs', 'commission', 'shipping_cost', 'ad_cost', 'other_cost',
        'net_profit', 'profit_rate', 'order_count',
        'created_at', 'updated_at',
      ],
      srcProfitLoss
        .filter((r) => mapFK(idMap, r.productId as string) !== null)
        .map((r) => {
          const period = r.period as string; // "2025-05" or similar
          let year = new Date().getFullYear();
          let month = new Date().getMonth() + 1;
          if (period && period.includes('-')) {
            const parts = period.split('-');
            year = parseInt(parts[0], 10) || year;
            month = parseInt(parts[1], 10) || month;
          }
          return [
            toUUID(r.id as string),
            defaultCompanyId,
            mapFK(idMap, r.productId as string)!,
            year,
            month,
            toInt(r.revenue),
            toInt(r.costOfGoods),
            toInt(r.commission),
            toInt(r.shippingCost),
            toInt(r.adCost),
            toInt(r.otherCost),
            toInt(r.netProfit),
            toDecimal(Math.max(-9.9999, Math.min(9.9999, Number(r.profitRate ?? 0) / 100)), '0'),
            (r.orderCount as number) ?? 0,
            toTimestamptz(r.createdAt) ?? new Date().toISOString(),
            new Date().toISOString(),
          ];
        }),
    );

    // ── Thumbnails ─────────────────────────────────────────────────────────
    log('Migrating Thumbnail...');
    await bulkInsert(
      'thumbnails',
      ['id', 'company_id', 'product_id', 'image_url', 'strategy', 'status', 'ctr', 'prev_click_rate', 'created_at', 'updated_at'],
      srcThumbnails
        .filter((r) => mapFK(idMap, r.productId as string) !== null)
        .map((r) => [
          toUUID(r.id as string),
          defaultCompanyId,
          mapFK(idMap, r.productId as string)!,
          r.imageUrl as string,
          'standard',
          r.status ?? 'active',
          toDecimal(r.clickRate, '0'),
          toDecimal(r.prevClickRate, '0'),
          toTimestamptz(r.createdAt) ?? new Date().toISOString(),
          toTimestamptz(r.updatedAt) ?? new Date().toISOString(),
        ]),
    );

    // ── Reviews ────────────────────────────────────────────────────────────
    log('Migrating Review...');
    await bulkInsert(
      'reviews',
      ['id', 'company_id', 'product_id', 'platform', 'rating', 'content', 'reviewed_at', 'created_at'],
      srcReviews
        .filter((r) => mapFK(idMap, r.productId as string) !== null)
        .map((r) => [
          toUUID(r.id as string),
          defaultCompanyId,
          mapFK(idMap, r.productId as string)!,
          'coupang',
          (r.rating as number) ?? 5,
          r.content ?? null,
          toTimestamptz(r.createdAt) ?? new Date().toISOString(),
          toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        ]),
    );

    // ── Alerts ─────────────────────────────────────────────────────────────
    log('Migrating Alert...');
    await bulkInsert(
      'alerts',
      ['id', 'company_id', 'product_id', 'type', 'severity', 'title', 'message', 'is_read', 'created_at'],
      srcAlerts.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        mapFK(idMap, r.productId as string),
        r.type as string,
        'warning',
        (r.message as string).slice(0, 100) || r.type as string,
        r.message ?? null,
        toBool(r.isRead),
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
      ]),
    );

    // ── Shipments ──────────────────────────────────────────────────────────
    log('Migrating Shipment...');
    await bulkInsert(
      'shipments',
      [
        'id', 'company_id', 'order_id', 'product_id', 'tracking_no', 'courier_code',
        'courier_name', 'status', 'shipped_at', 'delivered_at', 'delivery_days',
        'warehouse_id', 'created_at',
      ],
      srcShipments.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        mapFK(idMap, r.orderId as string),
        mapFK(idMap, r.productId as string),
        r.trackingNo ?? null,
        r.courierCode ?? null,
        r.courierName ?? null,
        r.status ?? 'ready',
        toTimestamptz(r.shippedAt),
        toTimestamptz(r.deliveredAt),
        r.deliveryDays != null ? (r.deliveryDays as number) : null,
        mapFK(idMap, r.warehouseId as string),
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
      ]),
    );

    // ── PickingLists ───────────────────────────────────────────────────────
    log('Migrating PickingList...');
    await bulkInsert(
      'picking_lists',
      ['id', 'company_id', 'list_number', 'status', 'total_items', 'picked_items', 'assigned_to', 'started_at', 'completed_at', 'created_at'],
      srcPickingLists.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.listNumber as string,
        r.status ?? 'pending',
        (r.totalItems as number) ?? 0,
        (r.pickedItems as number) ?? 0,
        r.assignedTo ?? null,
        toTimestamptz(r.startedAt),
        toTimestamptz(r.completedAt),
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
      ]),
    );

    // ── PickingItems ───────────────────────────────────────────────────────
    log('Migrating PickingItem...');
    await bulkInsert(
      'picking_items',
      ['id', 'picking_list_id', 'order_id', 'product_id', 'product_name', 'sku', 'quantity', 'location', 'is_picked', 'is_verified', 'picked_at', 'verified_at'],
      srcPickingItems
        .filter((r) => mapFK(idMap, r.pickingListId as string) !== null)
        .map((r) => [
          toUUID(r.id as string),
          mapFK(idMap, r.pickingListId as string)!,
          r.orderId ?? null,
          r.productId as string, // productId is a String in PG (not UUID)
          r.productName as string,
          r.sku ?? null,
          (r.quantity as number) ?? 1,
          r.location ?? null,
          toBool(r.isPicked),
          toBool(r.isVerified),
          toTimestamptz(r.pickedAt),
          toTimestamptz(r.verifiedAt),
        ]),
    );

    // ── Settlements ────────────────────────────────────────────────────────
    log('Migrating Settlement...');
    await bulkInsert(
      'settlements',
      ['id', 'company_id', 'period', 'expected_amount', 'actual_amount', 'commission', 'shipping_fee', 'adjustments', 'difference', 'order_count', 'return_count', 'status', 'settled_at', 'notes', 'created_at'],
      srcSettlements.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.period as string,
        toInt(r.expectedAmount),
        toInt(r.actualAmount),
        toInt(r.commission),
        toInt(r.shippingFee),
        toInt(r.adjustments),
        toInt(r.difference),
        (r.orderCount as number) ?? 0,
        (r.returnCount as number) ?? 0,
        r.status ?? 'pending',
        toTimestamptz(r.settledAt),
        r.notes ?? null,
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
      ]),
    );

    // ── DeliveryRules ──────────────────────────────────────────────────────
    log('Migrating DeliveryRule...');
    await bulkInsert(
      'delivery_rules',
      ['id', 'company_id', 'name', 'priority', 'condition_type', 'condition_value', 'courier_code', 'courier_name', 'warehouse_id', 'is_active', 'created_at'],
      srcDeliveryRules.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.name as string,
        (r.priority as number) ?? 0,
        r.conditionType as string,
        r.conditionValue ?? null,
        r.courierCode ?? null,
        r.courierName ?? null,
        mapFK(idMap, r.warehouseId as string),
        toBool(r.isActive),
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
      ]),
    );

    // ── NotificationLogs ───────────────────────────────────────────────────
    log('Migrating NotificationLog...');
    await bulkInsert(
      'notification_logs',
      ['id', 'company_id', 'type', 'recipient', 'title', 'message', 'order_id', 'product_id', 'status', 'sent_at'],
      srcNotificationLogs.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.type as string,
        r.recipient ?? null,
        r.title ?? null,
        r.message as string,
        r.orderId ?? null,
        r.productId ?? null,
        r.status ?? 'sent',
        toTimestamptz(r.sentAt) ?? new Date().toISOString(),
      ]),
    );

    // ── CategoryMappings ───────────────────────────────────────────────────
    log('Migrating CategoryMapping...');
    await bulkInsert(
      'category_mappings',
      ['id', 'company_id', 'internal_category', 'coupang_category_id', 'coupang_category_name', 'keywords', 'is_active', 'created_at', 'updated_at'],
      srcCategoryMappings.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.internalCategory as string,
        r.coupangCategoryId ?? null,
        r.coupangCategoryName ?? null,
        r.keywords ?? null,
        toBool(r.isActive),
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        toTimestamptz(r.updatedAt) ?? new Date().toISOString(),
      ]),
    );

    // ── FilterPresets ──────────────────────────────────────────────────────
    log('Migrating FilterPreset...');
    await bulkInsert(
      'filter_presets',
      ['id', 'company_id', 'name', 'page', 'conditions', 'is_pinned', 'created_at', 'updated_at'],
      srcFilterPresets.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.name as string,
        r.page as string,
        r.conditions as string,
        toBool(r.isPinned),
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        toTimestamptz(r.updatedAt) ?? new Date().toISOString(),
      ]),
    );

    // ── NotificationTemplates ──────────────────────────────────────────────
    log('Migrating NotificationTemplate...');
    await bulkInsert(
      'notification_templates',
      ['id', 'company_id', 'name', 'type', 'trigger', 'template', 'is_active', 'created_at'],
      srcNotificationTemplates.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.name as string,
        r.type as string,
        r.trigger as string,
        r.template as string,
        toBool(r.isActive),
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
      ]),
    );

    // ── CommonCodes ────────────────────────────────────────────────────────
    log('Migrating CommonCode...');
    await bulkInsert(
      'common_codes',
      ['id', 'company_id', 'group_code', 'code', 'name', 'sort_order', 'is_active', 'extra', 'created_at'],
      srcCommonCodes.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.groupCode as string,
        r.code as string,
        r.name as string,
        (r.sortOrder as number) ?? 0,
        toBool(r.isActive),
        r.extra ?? null,
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
      ]),
    );

    // ── OptionMasters ──────────────────────────────────────────────────────
    log('Migrating OptionMaster...');
    await bulkInsert(
      'option_masters',
      ['id', 'company_id', 'name', 'values', 'is_active', 'created_at', 'updated_at'],
      srcOptionMasters.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.name as string,
        r.values as string,
        toBool(r.isActive),
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        toTimestamptz(r.updatedAt) ?? new Date().toISOString(),
      ]),
    );

    // ── CommissionRates ────────────────────────────────────────────────────
    log('Migrating CommissionRate...');
    await bulkInsert(
      'commission_rates',
      ['id', 'company_id', 'category', 'rate', 'marketplace', 'notes', 'updated_at'],
      srcCommissionRates.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.category as string,
        toDecimal(r.rate, '0'),
        r.marketplace ?? 'coupang',
        r.notes ?? null,
        toTimestamptz(r.updatedAt) ?? new Date().toISOString(),
      ]),
    );

    // ── ProductTemplates ───────────────────────────────────────────────────
    log('Migrating ProductTemplate...');
    await bulkInsert(
      'product_templates',
      ['id', 'company_id', 'name', 'html', 'category', 'is_default', 'created_at', 'updated_at'],
      srcProductTemplates.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.name as string,
        r.html as string,
        r.category ?? null,
        toBool(r.isDefault),
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        toTimestamptz(r.updatedAt) ?? new Date().toISOString(),
      ]),
    );

    // ── Announcements ──────────────────────────────────────────────────────
    log('Migrating Announcement...');
    await bulkInsert(
      'announcements',
      ['id', 'company_id', 'title', 'content', 'author', 'is_pinned', 'is_active', 'created_at', 'updated_at'],
      srcAnnouncements.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.title as string,
        r.content as string,
        r.author ?? null,
        toBool(r.isPinned),
        toBool(r.isActive),
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        toTimestamptz(r.updatedAt) ?? new Date().toISOString(),
      ]),
    );

    // ── SalesPlans ─────────────────────────────────────────────────────────
    log('Migrating SalesPlan...');
    await bulkInsert(
      'sales_plans',
      ['id', 'company_id', 'period', 'target_revenue', 'target_orders', 'target_profit', 'actual_revenue', 'actual_orders', 'actual_profit', 'notes', 'created_at', 'updated_at'],
      srcSalesPlans.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.period as string,
        toInt(r.targetRevenue),
        (r.targetOrders as number) ?? 0,
        toInt(r.targetProfit),
        toInt(r.actualRevenue),
        (r.actualOrders as number) ?? 0,
        toInt(r.actualProfit),
        r.notes ?? null,
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        toTimestamptz(r.updatedAt) ?? new Date().toISOString(),
      ]),
    );

    // ── AuditLogs ──────────────────────────────────────────────────────────
    log('Migrating AuditLog...');
    await bulkInsert(
      'audit_logs',
      ['id', 'company_id', 'user_id', 'user_name', 'action', 'resource', 'resource_id', 'details', 'ip_address', 'created_at'],
      srcAuditLogs.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.userId ?? null,
        r.userName ?? null,
        r.action as string,
        r.resource as string,
        r.resourceId ?? null,
        r.details ?? null,
        r.ipAddress ?? null,
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
      ]),
    );

    // ── ProductSamples ─────────────────────────────────────────────────────
    log('Migrating ProductSample...');
    await bulkInsert(
      'product_samples',
      ['id', 'company_id', 'name', 'supplier', 'cost_price', 'expected_price', 'category', 'status', 'notes', 'image_url', 'product_id', 'reviewed_by', 'created_at', 'updated_at'],
      srcProductSamples.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.name as string,
        r.supplier ?? null,
        toInt(r.costPrice),
        toInt(r.expectedPrice),
        r.category ?? null,
        r.status ?? 'reviewing',
        r.notes ?? null,
        r.imageUrl ?? null,
        mapFK(idMap, r.productId as string),
        r.reviewedBy ?? null,
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        toTimestamptz(r.updatedAt) ?? new Date().toISOString(),
      ]),
    );

    // ── PriceHistories ─────────────────────────────────────────────────────
    log('Migrating PriceHistory...');
    await bulkInsert(
      'price_histories',
      ['id', 'product_id', 'type', 'old_price', 'new_price', 'reason', 'changed_by', 'created_at'],
      srcPriceHistories
        .filter((r) => mapFK(idMap, r.productId as string) !== null)
        .map((r) => [
          toUUID(r.id as string),
          mapFK(idMap, r.productId as string)!,
          r.type as string,
          toInt(r.oldPrice),
          toInt(r.newPrice),
          r.reason ?? null,
          r.changedBy ?? null,
          toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        ]),
    );

    // ── ProductNameMappings ────────────────────────────────────────────────
    log('Migrating ProductNameMapping...');
    await bulkInsert(
      'product_name_mappings',
      ['id', 'product_id', 'marketplace', 'marketplace_name', 'internal_name', 'created_at'],
      srcProductNameMappings
        .filter((r) => mapFK(idMap, r.productId as string) !== null)
        .map((r) => [
          toUUID(r.id as string),
          mapFK(idMap, r.productId as string)!,
          r.marketplace ?? 'coupang',
          r.marketplaceName as string,
          r.internalName as string,
          toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        ]),
    );

    // ── StockTransfers ─────────────────────────────────────────────────────
    log('Migrating StockTransfer...');
    await bulkInsert(
      'stock_transfers',
      ['id', 'company_id', 'product_id', 'product_name', 'from_warehouse_id', 'to_warehouse_id', 'quantity', 'status', 'requested_by', 'completed_at', 'notes', 'created_at'],
      srcStockTransfers
        .filter(
          (r) =>
            mapFK(idMap, r.productId as string) !== null &&
            mapFK(idMap, r.fromWarehouseId as string) !== null &&
            mapFK(idMap, r.toWarehouseId as string) !== null,
        )
        .map((r) => [
          toUUID(r.id as string),
          defaultCompanyId,
          mapFK(idMap, r.productId as string)!,
          r.productName ?? null,
          mapFK(idMap, r.fromWarehouseId as string)!,
          mapFK(idMap, r.toWarehouseId as string)!,
          (r.quantity as number) ?? 0,
          r.status ?? 'pending',
          r.requestedBy ?? null,
          toTimestamptz(r.completedAt),
          r.notes ?? null,
          toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        ]),
    );

    // ── ProductMemos ───────────────────────────────────────────────────────
    log('Migrating ProductMemo...');
    await bulkInsert(
      'product_memos',
      ['id', 'product_id', 'content', 'author', 'memo_type', 'is_resolved', 'created_at'],
      srcProductMemos
        .filter((r) => mapFK(idMap, r.productId as string) !== null)
        .map((r) => [
          toUUID(r.id as string),
          mapFK(idMap, r.productId as string)!,
          r.content as string,
          r.author ?? null,
          r.memoType ?? 'general',
          toBool(r.isResolved),
          toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        ]),
    );

    // ── StockAudits ────────────────────────────────────────────────────────
    log('Migrating StockAudit...');
    await bulkInsert(
      'stock_audits',
      ['id', 'company_id', 'audit_number', 'status', 'total_products', 'matched_count', 'diff_count', 'audited_by', 'completed_at', 'notes', 'items', 'created_at'],
      srcStockAudits.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.auditNumber as string,
        r.status ?? 'in_progress',
        (r.totalProducts as number) ?? 0,
        (r.matchedCount as number) ?? 0,
        (r.diffCount as number) ?? 0,
        r.auditedBy ?? null,
        toTimestamptz(r.completedAt),
        r.notes ?? null,
        r.items ? JSON.parse(r.items as string) : null,
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
      ]),
    );

    // ── ReturnTransfers ────────────────────────────────────────────────────
    log('Migrating ReturnTransfer...');
    await bulkInsert(
      'return_transfers',
      ['id', 'company_id', 'rt_number', 'order_id', 'product_id', 'product_name', 'quantity', 'status', 'condition', 'restocked_qty', 'disposed_qty', 'notes', 'processed_by', 'created_at', 'completed_at'],
      srcReturnTransfers
        .filter((r) => mapFK(idMap, r.productId as string) !== null)
        .map((r) => [
          toUUID(r.id as string),
          defaultCompanyId,
          r.rtNumber as string,
          r.orderId ?? null,
          mapFK(idMap, r.productId as string)!,
          r.productName ?? null,
          (r.quantity as number) ?? 0,
          r.status ?? 'received',
          r.condition ?? 'good',
          (r.restockedQty as number) ?? 0,
          (r.disposedQty as number) ?? 0,
          r.notes ?? null,
          r.processedBy ?? null,
          toTimestamptz(r.createdAt) ?? new Date().toISOString(),
          toTimestamptz(r.completedAt),
        ]),
    );

    // ── StockTransactions ──────────────────────────────────────────────────
    log('Migrating StockTransaction...');
    await bulkInsert(
      'stock_transactions',
      ['id', 'company_id', 'product_id', 'product_name', 'type', 'quantity', 'unit_cost', 'total_cost', 'related_id', 'related_type', 'warehouse_id', 'note', 'created_by', 'created_at'],
      srcStockTransactions
        .filter((r) => mapFK(idMap, r.productId as string) !== null)
        .map((r) => [
          toUUID(r.id as string),
          defaultCompanyId,
          mapFK(idMap, r.productId as string)!,
          r.productName ?? null,
          r.type as string,
          (r.quantity as number) ?? 0,
          toInt(r.unitCost),
          toInt(r.totalCost),
          r.relatedId ?? null,
          r.relatedType ?? null,
          mapFK(idMap, r.warehouseId as string),
          r.note ?? null,
          r.createdBy ?? null,
          toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        ]),
    );

    // ── ManualLedgers ──────────────────────────────────────────────────────
    log('Migrating ManualLedger...');
    await bulkInsert(
      'manual_ledgers',
      ['id', 'company_id', 'date', 'type', 'category', 'counterpart', 'description', 'amount', 'tax', 'memo', 'created_by', 'created_at'],
      srcManualLedgers.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        toDate(r.date) ?? new Date().toISOString().slice(0, 10),
        r.type as string,
        r.category as string,
        r.counterpart ?? null,
        r.description ?? null,
        toInt(r.amount),
        toInt(r.tax),
        r.memo ?? null,
        r.createdBy ?? null,
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
      ]),
    );

    // ── ProcessingCosts ────────────────────────────────────────────────────
    log('Migrating ProcessingCost...');
    await bulkInsert(
      'processing_costs',
      ['id', 'company_id', 'product_id', 'product_name', 'vendor', 'process_type', 'unit_cost', 'quantity', 'total_cost', 'date', 'status', 'notes', 'created_at'],
      srcProcessingCosts.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        mapFK(idMap, r.productId as string),
        r.productName ?? null,
        r.vendor ?? null,
        r.processType as string,
        toInt(r.unitCost),
        (r.quantity as number) ?? 0,
        toInt(r.totalCost),
        toDate(r.date) ?? new Date().toISOString().slice(0, 10),
        r.status ?? 'pending',
        r.notes ?? null,
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
      ]),
    );

    // ── SupplierPayments ───────────────────────────────────────────────────
    log('Migrating SupplierPayment...');
    await bulkInsert(
      'supplier_payments',
      ['id', 'company_id', 'supplier_id', 'supplier_name', 'amount', 'paid_amount', 'status', 'due_date', 'paid_date', 'purchase_order_id', 'notes', 'created_at'],
      srcSupplierPayments
        .filter((r) => mapFK(idMap, r.supplierId as string) !== null)
        .map((r) => [
          toUUID(r.id as string),
          defaultCompanyId,
          mapFK(idMap, r.supplierId as string)!,
          r.supplierName ?? null,
          toInt(r.amount),
          toInt(r.paidAmount),
          r.status ?? 'unpaid',
          toDate(r.dueDate),
          toDate(r.paidDate),
          mapFK(idMap, r.purchaseOrderId as string),
          r.notes ?? null,
          toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        ]),
    );

    // ── GradeHistories ─────────────────────────────────────────────────────
    log('Migrating GradeHistory...');
    await bulkInsert(
      'grade_histories',
      ['id', 'product_id', 'old_grade', 'new_grade', 'score', 'revenue_score', 'margin_score', 'velocity_score', 'reason', 'calculated_at'],
      srcGradeHistories
        .filter((r) => mapFK(idMap, r.productId as string) !== null)
        .map((r) => [
          toUUID(r.id as string),
          mapFK(idMap, r.productId as string)!,
          r.oldGrade ?? null,
          r.newGrade as string,
          toDecimal(r.score, '0'),
          toDecimal(r.revenueScore, '0'),
          toDecimal(r.marginScore, '0'),
          toDecimal(r.velocityScore, '0'),
          r.reason ?? 'auto',
          toTimestamptz(r.calculatedAt) ?? new Date().toISOString(),
        ]),
    );

    // ── TrafficStats ───────────────────────────────────────────────────────
    log('Migrating TrafficStats...');
    await bulkInsert(
      'traffic_stats',
      ['id', 'product_id', 'date', 'period_days', 'visitors', 'views', 'cart_adds', 'orders', 'sales_qty', 'revenue', 'conversion_rate'],
      srcTrafficStats
        .filter((r) => mapFK(idMap, r.productId as string) !== null)
        .map((r) => {
          // Dashboard TrafficStats.date is a String "YYYY-MM-DD"
          const dateVal = typeof r.date === 'string' ? r.date : toDate(r.date);
          return [
            toUUID(r.id as string),
            mapFK(idMap, r.productId as string)!,
            dateVal ?? new Date().toISOString().slice(0, 10),
            (r.periodDays as number) ?? 7,
            (r.visitors as number) ?? 0,
            (r.views as number) ?? 0,
            (r.cartAdds as number) ?? 0,
            (r.orders as number) ?? 0,
            (r.salesQty as number) ?? 0,
            toInt(r.revenue),
            toDecimal(Math.max(-9.9999, Math.min(9.9999, Number(r.conversionRate ?? 0) / 100)), '0'),
          ];
        }),
    );

    // ── CSRecords ──────────────────────────────────────────────────────────
    log('Migrating CSRecord...');
    await bulkInsert(
      'cs_records',
      ['id', 'company_id', 'order_id', 'product_id', 'cs_type', 'cs_status', 'priority', 'assignee', 'content', 'resolution', 'created_by', 'created_at', 'updated_at'],
      srcCSRecords.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.orderId ?? null,
        r.productId ?? null,
        r.csType as string,
        r.csStatus ?? '접수',
        r.priority ?? 'normal',
        r.assignee ?? null,
        r.content as string,
        r.resolution ?? null,
        r.createdBy ?? null,
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        toTimestamptz(r.updatedAt) ?? new Date().toISOString(),
      ]),
    );

    // ── CompanyInfo ─────────────────────────────────────────────────────────
    log('Migrating CompanyInfo...');
    await bulkInsert(
      'company_info',
      ['id', 'company_id', 'company_name', 'ceo_name', 'phone', 'fax', 'business_number', 'business_type', 'business_item', 'zip_code', 'address', 'address_detail', 'logo_url', 'default_options', 'updated_at'],
      srcCompanyInfo.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.companyName as string,
        r.ceoName ?? null,
        r.phone ?? null,
        r.fax ?? null,
        r.businessNumber ?? null,
        r.businessType ?? null,
        r.businessItem ?? null,
        r.zipCode ?? null,
        r.address ?? null,
        r.addressDetail ?? null,
        r.logoUrl ?? null,
        r.defaultOptions ?? null,
        toTimestamptz(r.updatedAt) ?? new Date().toISOString(),
      ]),
    );

    // ── GiftRules ──────────────────────────────────────────────────────────
    log('Migrating GiftRule...');
    await bulkInsert(
      'gift_rules',
      ['id', 'company_id', 'rule_type', 'condition', 'gift_product_id', 'gift_name', 'quantity', 'is_active', 'created_at', 'updated_at'],
      srcGiftRules.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.ruleType as string,
        r.condition as string,
        r.giftProductId ?? null,
        r.giftName as string,
        (r.quantity as number) ?? 1,
        toBool(r.isActive),
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        toTimestamptz(r.updatedAt) ?? new Date().toISOString(),
      ]),
    );

    // ── StockAllocations ───────────────────────────────────────────────────
    log('Migrating StockAllocation...');
    await bulkInsert(
      'stock_allocations',
      ['id', 'company_id', 'order_id', 'product_id', 'quantity', 'warehouse_id', 'status', 'allocated_at', 'shipped_at'],
      srcStockAllocations
        .filter((r) => mapFK(idMap, r.productId as string) !== null)
        .map((r) => [
          toUUID(r.id as string),
          defaultCompanyId,
          r.orderId as string,
          mapFK(idMap, r.productId as string)!,
          (r.quantity as number) ?? 0,
          mapFK(idMap, r.warehouseId as string),
          r.status ?? 'allocated',
          toTimestamptz(r.allocatedAt) ?? new Date().toISOString(),
          toTimestamptz(r.shippedAt),
        ]),
    );

    // ── PackGroups ─────────────────────────────────────────────────────────
    log('Migrating PackGroup...');
    await bulkInsert(
      'pack_groups',
      ['id', 'company_id', 'group_number', 'receiver_name', 'receiver_addr', 'order_count', 'item_count', 'tracking_no', 'courier_name', 'status', 'created_at', 'shipped_at'],
      srcPackGroups.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.groupNumber as string,
        r.receiverName ?? null,
        r.receiverAddr ?? null,
        (r.orderCount as number) ?? 0,
        (r.itemCount as number) ?? 0,
        r.trackingNo ?? null,
        r.courierName ?? null,
        r.status ?? 'pending',
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        toTimestamptz(r.shippedAt),
      ]),
    );

    // ── UnshippedItems ─────────────────────────────────────────────────────
    log('Migrating UnshippedItem...');
    await bulkInsert(
      'unshipped_items',
      ['id', 'company_id', 'order_id', 'product_id', 'product_name', 'quantity', 'order_date', 'delay_days', 'reason', 'is_notified', 'notified_at', 'created_at'],
      srcUnshippedItems
        .filter((r) => mapFK(idMap, r.productId as string) !== null)
        .map((r) => [
          toUUID(r.id as string),
          defaultCompanyId,
          r.orderId as string,
          mapFK(idMap, r.productId as string)!,
          r.productName as string,
          (r.quantity as number) ?? 0,
          toTimestamptz(r.orderDate) ?? new Date().toISOString(),
          (r.delayDays as number) ?? 0,
          r.reason ?? null,
          toBool(r.isNotified),
          toTimestamptz(r.notifiedAt),
          toTimestamptz(r.createdAt) ?? new Date().toISOString(),
        ]),
    );

    // ── StockMovementSummaries ─────────────────────────────────────────────
    log('Migrating StockMovementSummary...');
    await bulkInsert(
      'stock_movement_summaries',
      ['id', 'company_id', 'date', 'product_id', 'product_name', 'warehouse_id', 'in_qty', 'out_qty', 'in_amount', 'out_amount', 'type'],
      srcStockMovementSummaries.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        toDate(r.date) ?? new Date().toISOString().slice(0, 10),
        mapFK(idMap, r.productId as string) ?? toUUID(r.productId as string),
        r.productName ?? null,
        mapFK(idMap, r.warehouseId as string),
        (r.inQty as number) ?? 0,
        (r.outQty as number) ?? 0,
        toInt(r.inAmount),
        toInt(r.outAmount),
        r.type ?? null,
      ]),
    );

    // ── SalesAnalyses ──────────────────────────────────────────────────────
    log('Migrating SalesAnalysis...');
    await bulkInsert(
      'sales_analyses',
      ['id', 'company_id', 'period', 'channel_name', 'channel_type', 'total_orders', 'total_qty', 'total_revenue', 'total_cost', 'total_profit', 'return_count', 'return_rate', 'avg_order_value', 'created_at'],
      srcSalesAnalyses.map((r) => [
        toUUID(r.id as string),
        defaultCompanyId,
        r.period as string,
        r.channelName as string,
        r.channelType ?? 'online',
        (r.totalOrders as number) ?? 0,
        (r.totalQty as number) ?? 0,
        toInt(r.totalRevenue),
        toInt(r.totalCost),
        toInt(r.totalProfit),
        (r.returnCount as number) ?? 0,
        toDecimal(r.returnRate, '0'),
        toInt(r.avgOrderValue),
        toTimestamptz(r.createdAt) ?? new Date().toISOString(),
      ]),
    );

    // ── Commit ─────────────────────────────────────────────────────────────
    await pg.query('COMMIT');

    log('═══════════════════════════════════════════════');
    log('Migration complete!');
    log(`Total IDs mapped: ${idMap.size}`);
    log('═══════════════════════════════════════════════');
  } catch (err) {
    await pg.query('ROLLBACK');
    console.error('[migrate] ERROR — rolled back transaction');
    throw err;
  } finally {
    pg.release();
    await pool.end();
    sqlite.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
