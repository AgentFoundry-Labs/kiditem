import { ProductContext } from './types';

interface ProductWithRelations {
  id: string;
  companyId: string;
  name: string;
  costPrice: number | null;
  sellPrice: number | null;
  abcGrade: string | null;
  adTier: string | null;
  inventory: {
    currentStock: number;
    reorderPoint: number;
    dailySalesAvg: { toNumber(): number } | number;
  } | null;
  profitLoss: Array<{
    revenue: number;
    netProfit: number;
    profitRate: { toNumber(): number } | number | null;
    adCost: number;
    orderCount: number;
    returnCount: number;
  }>;
  ads: Array<{
    spend: number;
  }>;
  reviews: Array<{
    id: string;
  }>;
  thumbnails?: Array<{
    ctr: { toNumber(): number } | number | null;
  }>;
}

function toNumber(val: { toNumber(): number } | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  return val.toNumber();
}

export function buildContext(product: ProductWithRelations): ProductContext {
  const latestPL = product.profitLoss[0] ?? null;
  const costPrice = product.costPrice ?? 0;
  const sellPrice = product.sellPrice ?? 0;
  const revenue = latestPL?.revenue ?? 0;
  const netProfit = latestPL?.netProfit ?? 0;
  const profitRate = toNumber(latestPL?.profitRate) * 100;
  const adCost = latestPL?.adCost ?? 0;
  const orderCount = latestPL?.orderCount ?? 0;
  const returnCount = latestPL?.returnCount ?? 0;
  const adRate = revenue > 0 ? (adCost / revenue) * 100 : 0;
  const margin = sellPrice > 0 ? ((sellPrice - costPrice) / sellPrice) * 100 : 0;
  const costRate = sellPrice > 0 ? (costPrice / sellPrice) * 100 : 0;
  const cancelRate = orderCount > 0 ? (returnCount / orderCount) * 100 : 0;

  const inv = product.inventory;
  const currentStock = inv?.currentStock ?? 0;
  const reorderPoint = inv?.reorderPoint ?? 0;
  const avgDailySales = toNumber(inv?.dailySalesAvg);
  const daysOfStock = avgDailySales > 0 ? currentStock / avgDailySales : 999;

  const reviewCount = product.reviews.length;
  const thumbnailCTR = toNumber(product.thumbnails?.[0]?.ctr) * 100;

  return {
    productId: product.id,
    productName: product.name,
    companyId: product.companyId,
    profitRate,
    netProfit,
    revenue,
    costPrice,
    sellPrice,
    margin,
    costRate,
    adRate,
    adTier: product.adTier,
    adCostRate: adRate,
    abcGrade: product.abcGrade,
    currentStock,
    reorderPoint,
    avgDailySales,
    daysOfStock,
    reviewCount,
    thumbnailCTR,
    orderCount,
    cancelRate,
    returnRate: cancelRate,
  };
}
