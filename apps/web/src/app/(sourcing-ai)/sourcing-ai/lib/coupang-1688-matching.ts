import {
  buildSourcing1688TargetId,
  deriveSourcing1688SearchQuery,
  type Sourcing1688SearchItem,
} from '@kiditem/shared/sourcing';
import type { TodayRecommendationRow } from '../recommendations/lib/today-recommendations';

const CNY_TO_KRW = 190;
const COUPANG_FEE_RATE = 0.108;
const DOMESTIC_SHIPPING_KRW = 3000;
const DEFAULT_INTERNATIONAL_SHIPPING_KRW = 1200;
const DEFAULT_SERVICE_FEE_KRW = 300;
const DEFAULT_INSPECTION_FEE_KRW = 300;
const DEFAULT_TARGET_SALE_PRICE_KRW = 15900;

export interface CoupangImageSearchRow {
  id: string;
  coupangProduct: TodayRecommendationRow;
  searchQuery: string;
  searchUrl: string;
  targetSalePriceKrw: number;
  estimatedFeeKrw: number;
}

export interface ImageSearchOffer {
  id: string;
  title: string;
  sourceUrl: string;
  imageUrl: string | null;
  priceCny: number | null;
  landedCostKrw: number | null;
  matchScore: number | null;
  estimatedProfitKrw: number | null;
  estimatedMarginRate: number | null;
  salesText?: string | null;
  salesNum?: number | null;
  supplierName?: string | null;
  supplierFactoryUrl?: string | null;
  supplierTags?: string[];
  purchaseTags?: string[];
  minOrderQuantity?: number | null;
  shippingFulfillmentRate?: string | null;
  shippingPickupRate?: string | null;
  shipFrom?: string | null;
  serviceScore?: number | null;
  repurchaseRate?: string | null;
}

interface BuildImageSearchRowsInput {
  coupangRows: TodayRecommendationRow[];
  limit?: number;
}

export function buildCoupangImageSearchRows({
  coupangRows,
  limit = 24,
}: BuildImageSearchRowsInput): CoupangImageSearchRow[] {
  return coupangRows
    .slice()
    .sort((a, b) => (
      (b.salesLast3d ?? 0) - (a.salesLast3d ?? 0) ||
      b.score - a.score
    ))
    .slice(0, limit)
    .map((row) => {
      const searchQuery = derive1688SearchQuery(row);
      const targetSalePriceKrw = resolveTargetSalePrice(row);

      return {
        id: buildSourcing1688TargetId(row),
        coupangProduct: row,
        searchQuery,
        searchUrl: build1688SearchUrl(searchQuery),
        targetSalePriceKrw,
        estimatedFeeKrw: Math.round(targetSalePriceKrw * COUPANG_FEE_RATE),
      };
    });
}

export function buildImageSearchOffer(
  item: Wholesale1688OfferItem,
  targetSalePriceKrw: number,
): ImageSearchOffer {
  const landedCostKrw = estimateLandedCostKrw(item.priceCny);
  const estimatedFeeKrw = Math.round(targetSalePriceKrw * COUPANG_FEE_RATE);
  const estimatedProfitKrw = landedCostKrw == null
    ? null
    : targetSalePriceKrw - landedCostKrw - estimatedFeeKrw - DOMESTIC_SHIPPING_KRW;
  const estimatedMarginRate = estimatedProfitKrw == null || targetSalePriceKrw <= 0
    ? null
    : Math.round((estimatedProfitKrw / targetSalePriceKrw) * 1000) / 10;

  return {
    id: item.sourceUrl,
    title: item.title,
    sourceUrl: item.sourceUrl,
    imageUrl: item.imageUrl,
    priceCny: item.priceCny,
    landedCostKrw,
    matchScore: item.score == null ? null : Math.round(item.score),
    estimatedProfitKrw,
    estimatedMarginRate,
    salesText: item.salesText,
    salesNum: item.salesNum,
    supplierName: item.supplierName,
    supplierFactoryUrl: item.supplierFactoryUrl,
    supplierTags: item.supplierTags,
    purchaseTags: item.purchaseTags,
    minOrderQuantity: item.minOrderQuantity,
    shippingFulfillmentRate: item.shippingFulfillmentRate,
    shippingPickupRate: item.shippingPickupRate,
    shipFrom: item.shipFrom,
    serviceScore: item.serviceScore,
    repurchaseRate: item.repurchaseRate,
  };
}

type Wholesale1688OfferItem = Pick<
  Sourcing1688SearchItem,
  'title' | 'priceCny' | 'sourceUrl' | 'imageUrl' | 'score'
> & Partial<Pick<
  Sourcing1688SearchItem,
  | 'salesText'
  | 'supplierName'
  | 'supplierFactoryUrl'
  | 'supplierTags'
  | 'purchaseTags'
  | 'minOrderQuantity'
  | 'shippingFulfillmentRate'
  | 'shippingPickupRate'
  | 'shipFrom'
  | 'serviceScore'
  | 'repurchaseRate'
>> & { salesNum?: number | null };

export function selectBestImageSearchOffer(offers: ImageSearchOffer[]): ImageSearchOffer | null {
  return offers
    .slice()
    .sort((a, b) => (scoreImageSearchOffer(b) ?? -1) - (scoreImageSearchOffer(a) ?? -1))
    [0] ?? null;
}

export function scoreImageSearchOffer(offer: ImageSearchOffer): number | null {
  if (offer.matchScore == null) return null;
  let score = offer.matchScore * 0.34;
  score += scoreMargin(offer) * 0.22;
  score += scoreShipping(offer) * 0.18;
  score += scoreSupplier(offer) * 0.14;
  score += scoreDemand(offer) * 0.08;
  score += scorePrice(offer) * 0.04;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function build1688SearchUrl(query: string): string {
  const params = new URLSearchParams({ keywords: query });
  return `https://s.1688.com/selloffer/offer_search.htm?${params.toString()}`;
}

export function derive1688SearchQuery(row: Pick<TodayRecommendationRow, 'productName' | 'primaryKeyword' | 'keywords'>): string {
  return deriveSourcing1688SearchQuery(row);
}

function resolveTargetSalePrice(row: TodayRecommendationRow): number {
  if (row.salePrice != null && row.salePrice > 0) return row.salePrice;
  return DEFAULT_TARGET_SALE_PRICE_KRW;
}

function estimateLandedCostKrw(priceCny: number | null): number | null {
  if (priceCny == null || priceCny <= 0) return null;
  return Math.round(
    priceCny * CNY_TO_KRW +
    DEFAULT_INTERNATIONAL_SHIPPING_KRW +
    DEFAULT_SERVICE_FEE_KRW +
    DEFAULT_INSPECTION_FEE_KRW,
  );
}

function scoreMargin(offer: ImageSearchOffer): number {
  const profit = offer.estimatedProfitKrw;
  const margin = offer.estimatedMarginRate;
  let score = 35;
  if (profit != null) {
    if (profit >= 7000) score += 34;
    else if (profit >= 4500) score += 26;
    else if (profit >= 2500) score += 18;
    else if (profit >= 1000) score += 8;
    else score -= 16;
  }
  if (margin != null) {
    if (margin >= 35) score += 30;
    else if (margin >= 24) score += 22;
    else if (margin >= 14) score += 10;
    else score -= 12;
  }
  return clampScore(score);
}

function scoreShipping(offer: ImageSearchOffer): number {
  const fulfillment = parsePercent(offer.shippingFulfillmentRate);
  const pickup = parsePercent(offer.shippingPickupRate);
  let score = 40;
  if (fulfillment != null) score += fulfillment >= 98 ? 28 : fulfillment >= 95 ? 22 : fulfillment >= 90 ? 12 : -8;
  if (pickup != null) score += pickup >= 98 ? 28 : pickup >= 95 ? 22 : pickup >= 90 ? 12 : -8;
  return clampScore(score);
}

function scoreSupplier(offer: ImageSearchOffer): number {
  let score = 42;
  if (offer.supplierName) score += 10;
  if ((offer.supplierTags ?? []).some((tag) => /원천|공장|factory|源头|实力/i.test(tag))) score += 24;
  if (offer.repurchaseRate) score += 8;
  if (offer.serviceScore != null) score += Math.min(16, offer.serviceScore);
  return clampScore(score);
}

function scoreDemand(offer: ImageSearchOffer): number {
  const sales = offer.salesNum ?? null;
  if (sales == null) return 45;
  if (sales >= 1000) return 86;
  if (sales >= 300) return 76;
  if (sales >= 50) return 62;
  if (sales >= 10) return 52;
  return 42;
}

function scorePrice(offer: ImageSearchOffer): number {
  if (offer.priceCny == null) return 35;
  if (offer.priceCny <= 20) return 88;
  if (offer.priceCny <= 50) return 76;
  if (offer.priceCny <= 100) return 58;
  return 34;
}

function parsePercent(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/[%\s,]/g, ''));
  if (!Number.isFinite(parsed)) return null;
  return parsed <= 1 ? parsed * 100 : parsed;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
