import { z } from 'zod';

export const TrafficDataSchema = z.object({
  visitors: z.number(),
  views: z.number(),
  cartAdds: z.number(),
  orders: z.number(),
  salesQty: z.number(),
  revenue: z.number(),
});

// GET /api/products 응답의 각 item (enrichProduct 반환값)
// 출처: products.service.ts enrichProduct() line 280-314
export const ProductListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  sku: z.string().nullable(),
  category: z.string().nullable(),
  brand: z.string().nullable(),
  company: z.string(),
  companyId: z.string(),
  costPrice: z.number(),
  sellPrice: z.number(),
  commissionRate: z.number(),
  shippingCost: z.number(),
  status: z.string(),
  abcGrade: z.string().nullable(),
  adTier: z.string().nullable(),
  currentStock: z.number(),
  reorderPoint: z.number(),
  avgDailySales: z.number(),
  revenue: z.number(),
  netProfit: z.number(),
  profitRate: z.number(),
  adRate: z.number(),
  reviewCount: z.number(),
  orderCount: z.number(),
  thumbnailCTR: z.number(),
  traffic: TrafficDataSchema.nullable(),
  t14: z.object({
    revenue: z.number(),
    salesQty: z.number(),
    orders: z.number(),
    conversionRate: z.number(),
    date: z.string(),
  }).nullable(),
  t14prev: z.object({
    revenue: z.number(),
    salesQty: z.number(),
    orders: z.number(),
    date: z.string(),
  }).nullable(),
  thumbnailUrl: z.string().nullable(),
  imageUrl: z.string().nullable(),
  coupangProductId: z.string().nullable(),
  createdAt: z.string(),
  gradeScore: z.number().nullable(),
  healthScore: z.number().nullable().optional(),
  masterProductId: z.string().nullable().optional(),
  isCostMissing: z.boolean().optional(),
  pipelineStep: z.string().nullable().optional(),
});

// GET /api/products/:id 응답 (Prisma Product + company + inventory)
// 출처: products.service.ts findOne() — Prisma Product 직접 반환
// ⚠️ Date fields: healthUpdatedAt, deletedAt, createdAt, updatedAt — Prisma Date → JSON string 자동 변환
// satisfies 미적용: Prisma 모델 직접 반환 (Date ≠ string 불일치)
export const ProductDetailSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  name: z.string(),
  description: z.string(),
  sku: z.string().nullable(),
  barcode: z.string().nullable(),
  status: z.string(),
  category: z.string().nullable(),
  brand: z.string().nullable(),
  tags: z.unknown(),
  thumbnailUrl: z.string().nullable(),
  // Sourcing
  sourceUrl: z.string().nullable(),
  sourcePlatform: z.string().nullable(),
  costCny: z.number().nullable(),
  marginRate: z.number().nullable(),
  rawData: z.unknown().nullable(),
  processedData: z.unknown().nullable(),
  draftContent: z.unknown().nullable(),
  pipelineStep: z.string().nullable(),
  detailPageUrl: z.string().nullable(),
  // Pricing
  costPrice: z.number().nullable(),
  sellPrice: z.number().nullable(),
  commissionRate: z.number().nullable(),
  shippingCost: z.number().nullable(),
  otherCost: z.number().nullable(),
  abcGrade: z.string().nullable(),
  adTier: z.string().nullable(),
  adBudgetLimit: z.number().nullable(),
  // Coupang
  coupangProductId: z.string().nullable(),
  // Delivery
  deliveryChargeType: z.string().nullable(),
  freeShipOverAmount: z.number().nullable(),
  returnCharge: z.number().nullable(),
  deliveryInfo: z.unknown().nullable(),
  images: z.unknown().nullable(),
  imageUrl: z.string().nullable(),
  thumbnailStrategy: z.string(),
  // Health
  healthScore: z.number().nullable(),
  healthUpdatedAt: z.string().nullable(),
  // Meta
  isDeleted: z.boolean(),
  deletedAt: z.string().nullable(),
  memo: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  isCostMissing: z.boolean().optional(),
  // Master Product
  masterProductId: z.string().nullable().optional(),
  masterProduct: z.object({
    id: z.string(),
    sku: z.string(),
    name: z.string(),
    costPrice: z.number().nullable(),
    sellPrice: z.number().nullable(),
  }).nullable().optional(),
  // Include relations (optional)
  company: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    businessNumber: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
  }).optional(),
  inventory: z.object({
    id: z.string(),
    companyId: z.string(),
    productId: z.string(),
    currentStock: z.number(),
    reservedStock: z.number(),
    safetyStock: z.number(),
    reorderPoint: z.number(),
    reorderQuantity: z.number(),
    leadTimeDays: z.number().nullable(),
    dailySalesAvg: z.unknown(),
  }).nullable().optional(),
});

// GET /api/products/pipeline-stats 응답
// 출처: products.service.ts getPipelineStats() — gradeA/gradeB/gradeC 키로 반환
export const PipelineCountsSchema = z.object({
  total: z.number(),
  gradeA: z.number(),
  gradeB: z.number(),
  gradeC: z.number(),
  minus: z.number(),
  low: z.number(),
  gradeChangeA: z.number(),
  gradeChangeB: z.number(),
  gradeChangeC: z.number(),
  adCount: z.number(),
  noAdCount: z.number(),
});

// 타입 export
export type TrafficData = z.infer<typeof TrafficDataSchema>;
export type ProductListItem = z.infer<typeof ProductListItemSchema>;
export type ProductDetail = z.infer<typeof ProductDetailSchema>;
export type PipelineCounts = z.infer<typeof PipelineCountsSchema>;
