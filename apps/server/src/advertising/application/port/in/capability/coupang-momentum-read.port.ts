// Incoming capability port published by advertising for cross-domain consumers
// (currently sourcing's rising-product detector). Exposes read-only Coupang
// momentum evidence — daily SERP snapshots and Wing sales-rank snapshots — in a
// normalized, envelope-free shape so consumers never depend on advertising's
// internal SERP JSON layout. The Prisma-backed reader lives in
// `application/service/coupang-momentum-read.service.ts`.

export const COUPANG_MOMENTUM_READ_CAPABILITY_PORT = Symbol(
  'CoupangMomentumReadCapabilityPort',
);

/** One product row inside a daily SERP snapshot (DOM order, ads included). */
export interface CoupangSerpMomentumItem {
  rank: number | null;
  page: number | null;
  positionInPage: number | null;
  isAd: boolean;
  productId: string | null;
  itemId: string | null;
  vendorItemId: string | null;
  name: string | null;
  priceKrw: number | null;
  reviewCount: number | null;
  ratingScore: number | null;
  link: string | null;
}

/** One keyword's full daily SERP (all products, own + competitor). */
export interface CoupangSerpMomentumSnapshot {
  keyword: string;
  /** KST business date, `YYYY-MM-DD`. */
  businessDate: string;
  capturedAt: string;
  itemCount: number;
  items: CoupangSerpMomentumItem[];
}

/** One Wing sales-rank daily fact — real 28-day sales quantity per product. */
export interface CoupangWingSalesMomentumRow {
  keyword: string;
  /** KST business date, `YYYY-MM-DD`. */
  businessDate: string;
  vendorItemId: string;
  productName: string | null;
  categoryHierarchy: string | null;
  salesRank: number | null;
  salesLast28d: number | null;
  viewsLast28d: number | null;
  revenueLast28d: number | null;
  conversionRate28d: number | null;
  salePrice: number | null;
  reviewCount: number | null;
  capturedAt: string;
}

export interface CoupangMomentumReadCapabilityPort {
  /** Recent daily SERP snapshots for all tracked keywords, newest-first. */
  readSerpMomentum(
    organizationId: string,
    days: number,
  ): Promise<CoupangSerpMomentumSnapshot[]>;
  /** Recent Wing sales-rank facts (own vendorItemIds), newest-first. */
  readWingSalesMomentum(
    organizationId: string,
    days: number,
  ): Promise<CoupangWingSalesMomentumRow[]>;
}
