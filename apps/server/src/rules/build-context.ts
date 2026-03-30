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
  const hasPL = latestPL !== null;
  const costPrice = product.costPrice ?? 0;
  const sellPrice = product.sellPrice ?? 0;

  const revenue = hasPL ? (latestPL.revenue ?? 0) : null;
  const netProfit = hasPL ? (latestPL.netProfit ?? 0) : null;
  const profitRate = hasPL ? toNumber(latestPL.profitRate) * 100 : null;
  const adCost = hasPL ? (latestPL.adCost ?? 0) : null;
  const orderCount = hasPL ? (latestPL.orderCount ?? 0) : null;
  const returnCount = hasPL ? (latestPL.returnCount ?? 0) : null;

  const adRate = (revenue !== null && revenue > 0 && adCost !== null)
    ? (adCost / revenue) * 100 : (hasPL ? 0 : null);
  const margin = sellPrice > 0 ? ((sellPrice - costPrice) / sellPrice) * 100 : null;
  const costRate = sellPrice > 0 ? (costPrice / sellPrice) * 100 : null;
  const cancelRate = (orderCount !== null && orderCount > 0 && returnCount !== null)
    ? (returnCount / orderCount) * 100 : (hasPL ? 0 : null);

  const inv = product.inventory;
  const currentStock = inv?.currentStock ?? 0;
  const reorderPoint = inv?.reorderPoint ?? 0;
  const avgDailySales = toNumber(inv?.dailySalesAvg);
  const daysOfStock = currentStock === 0 ? 0
    : avgDailySales > 0 ? currentStock / avgDailySales
    : 999;

  const reviewCount = product.reviews.length;
  const hasThumbnail = (product.thumbnails?.length ?? 0) > 0;
  const thumbnailCTR = hasThumbnail ? toNumber(product.thumbnails![0].ctr) * 100 : null;

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
