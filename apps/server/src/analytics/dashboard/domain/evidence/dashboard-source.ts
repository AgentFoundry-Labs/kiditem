/**
 * The source vocabulary dashboard evidence names.
 *
 * Every published basis identifies its sources with one of these words, so a
 * card that says "orders + Coupang ads" means the same thing on the sales
 * card, the trend chart and the Sellpia sales panel. The names were string
 * literals repeated across three services before this module existed.
 */
export type DashboardSourceName =
  | 'orders'
  | 'profit'
  | 'wing_traffic'
  | 'coupang_ads'
  | 'sellpia_sales'
  | 'products'
  | 'product_abc'
  | 'channel_listings'
  | 'sellpia_inventory'
  | 'alerts';

/** Admitted order rows — `OrderLineItem` revenue and settlement costs. */
export const ORDERS_SOURCE = 'orders' satisfies DashboardSourceName;

/**
 * The order-side profit calculation. It reads orders *and* the published ad
 * rows, so it can fail on its own while the raw order-row read succeeds —
 * which is why the trend chart names it separately from `orders` when a read
 * throws. It is a reader, not a collected source, so it appears in
 * `queryFailedSources` rather than in a value's `sources`.
 */
export const PROFIT_CALCULATION_SOURCE = 'profit' satisfies DashboardSourceName;

/** Wing/Drive replay daily traffic facts. */
export const WING_TRAFFIC_SOURCE = 'wing_traffic' satisfies DashboardSourceName;

/** Advertising's published account daily KPI rows. */
export const COUPANG_ADS_SOURCE = 'coupang_ads' satisfies DashboardSourceName;

/** Sellpia `sale_summary` published daily snapshots. */
export const SELLPIA_SALES_SOURCE = 'sellpia_sales' satisfies DashboardSourceName;

/**
 * Products' master catalogue rows — the active product set and the stored
 * `MasterProduct.abcGrade` Products publishes. Reading a grade is naming this
 * source; deciding how old that grade is names `product_abc` as well.
 */
export const PRODUCTS_SOURCE = 'products' satisfies DashboardSourceName;

/**
 * The ABC evaluation snapshot behind a stored grade — the owner-published
 * evaluation rows and the profitability evidence cutoff they were computed
 * through. It is what gives a grade count an as-of at all.
 */
export const PRODUCT_ABC_SOURCE = 'product_abc' satisfies DashboardSourceName;

/**
 * Channel listing rows and their option/inventory mapping, including the
 * per-listing `adSpend` carried on channel listing daily snapshots. This is
 * listing-side advertising spend, deliberately not `coupang_ads`, which names
 * Advertising's account-level daily KPI rows.
 */
export const CHANNEL_LISTINGS_SOURCE = 'channel_listings' satisfies DashboardSourceName;

/** Sellpia inventory SKU rows — current stock and SKU activity. */
export const SELLPIA_INVENTORY_SOURCE = 'sellpia_inventory' satisfies DashboardSourceName;

/** Alert rows published by the alert owner. */
export const ALERTS_SOURCE = 'alerts' satisfies DashboardSourceName;
