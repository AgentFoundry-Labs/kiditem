// Anti-corruption outgoing port: sourcing's rising-product detector reads
// Coupang momentum evidence (daily SERP + Wing sales-rank facts) owned by the
// advertising domain. The concrete adapter in
// `adapter/out/advertising/coupang-momentum.adapter.ts` binds this to
// advertising's published `COUPANG_MOMENTUM_READ_CAPABILITY_PORT`. Application
// services depend only on this local contract.

export const COUPANG_MOMENTUM_PORT = Symbol('CoupangMomentumPort');

export interface CoupangSerpItem {
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

export interface CoupangSerpSnapshot {
  keyword: string;
  /** KST business date, `YYYY-MM-DD`. */
  businessDate: string;
  capturedAt: string;
  itemCount: number;
  items: CoupangSerpItem[];
}

export interface CoupangWingSalesRow {
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

export interface CoupangMomentumPort {
  readSerpMomentum(
    organizationId: string,
    days: number,
  ): Promise<CoupangSerpSnapshot[]>;
  readWingSalesMomentum(
    organizationId: string,
    days: number,
  ): Promise<CoupangWingSalesRow[]>;
}
