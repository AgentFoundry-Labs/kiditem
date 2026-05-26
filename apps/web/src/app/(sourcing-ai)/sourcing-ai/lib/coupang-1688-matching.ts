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
  { terms: ['슬라임'], query: '儿童史莱姆玩具' },
  { terms: ['잔디인형', '인형'], query: '儿童毛绒玩具' },
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
  };
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

function stripCoupangNoise(value: string): string {
  return value
    .replace(/\b(쿠팡|로켓배송|무료배송|당일배송|신상|인기|정품)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}
