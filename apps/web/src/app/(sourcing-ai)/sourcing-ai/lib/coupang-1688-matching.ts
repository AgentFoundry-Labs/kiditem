import type { Search1688ImageResultItem } from './1688-image-search-api';
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
  matchScore: number;
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

interface QueryRule {
  terms: string[];
  query: string;
}

const queryRules: QueryRule[] = [
  { terms: ['말랑이', '스퀴시', '스트레스볼', '악뿌볼'], query: '解压玩具捏捏乐' },
  { terms: ['슬라임'], query: '儿童史莱姆玩具' },
  { terms: ['잔디인형', '인형'], query: '儿童毛绒玩具' },
  { terms: ['도장'], query: '儿童印章玩具' },
  { terms: ['레고', '블록'], query: '积木玩具' },
  { terms: ['우산'], query: '儿童雨伞' },
  { terms: ['물총'], query: '儿童水枪玩具' },
  { terms: ['목욕놀이', '목욕'], query: '儿童洗澡玩具' },
  { terms: ['필통'], query: '儿童笔袋文具盒' },
  { terms: ['선글라스'], query: '儿童太阳镜' },
  { terms: ['쿨매트', '냉감매트'], query: '婴儿凉席垫' },
  { terms: ['보드게임'], query: '儿童桌游玩具' },
  { terms: ['물놀이', '스프링 매트', '매트'], query: '儿童喷水戏水垫' },
  { terms: ['헤어핀', '머리핀'], query: '儿童发夹' },
  { terms: ['양말'], query: '儿童袜子' },
  { terms: ['모래놀이'], query: '儿童沙滩玩具' },
  { terms: ['스티커북', '스티커'], query: '儿童贴纸书' },
  { terms: ['앞치마'], query: '儿童围裙' },
  { terms: ['물컵', '빨대컵'], query: '儿童水杯' },
  { terms: ['방수팩'], query: '儿童防水袋' },
  { terms: ['캐리어'], query: '儿童行李箱' },
  { terms: ['퍼즐'], query: '儿童拼图玩具' },
  { terms: ['캠핑의자', '의자'], query: '儿童露营椅' },
  { terms: ['젤리슈즈', '샌들', '신발'], query: '儿童洞洞鞋凉鞋' },
  { terms: ['베개', '枕'], query: '儿童凉感枕套' },
  { terms: ['선풍기', '팬'], query: '婴儿车夹扇USB风扇' },
  { terms: ['주차번호판'], query: '汽车临时停车号码牌' },
  { terms: ['강아지계단'], query: '宠物楼梯' },
  { terms: ['안전벨트클립'], query: '汽车安全带夹' },
  { terms: ['식탁매트'], query: '儿童餐垫' },
];

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
        id: `${row.productId}:${row.itemId ?? ''}:${row.vendorItemId ?? ''}`,
        coupangProduct: row,
        searchQuery,
        searchUrl: build1688SearchUrl(searchQuery),
        targetSalePriceKrw,
        estimatedFeeKrw: Math.round(targetSalePriceKrw * COUPANG_FEE_RATE),
      };
    });
}

export function buildImageSearchOffer(
  item: Search1688ImageResultItem,
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
    matchScore: Math.round(item.score),
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

export function selectBestImageSearchOffer(offers: ImageSearchOffer[]): ImageSearchOffer | null {
  return offers
    .slice()
    .sort((a, b) => scoreImageSearchOffer(b) - scoreImageSearchOffer(a))
    [0] ?? null;
}

export function scoreImageSearchOffer(offer: ImageSearchOffer): number {
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
  const haystack = normalizeText([row.productName, row.primaryKeyword, ...row.keywords].join(' '));
  const rule = queryRules.find((candidate) => candidate.terms.some((term) => haystack.includes(normalizeText(term))));
  if (rule) return rule.query;
  return stripCoupangNoise(row.primaryKeyword || row.keywords[0] || row.productName).slice(0, 40);
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

function stripCoupangNoise(value: string): string {
  return value
    .replace(/\b(쿠팡|로켓배송|무료배송|당일배송|신상|인기|정품)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}
