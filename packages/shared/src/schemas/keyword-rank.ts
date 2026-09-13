import { z } from "zod";
import { zIsoDate } from "./common.js";
import { ProductAbcGradeSchema } from "./product-abc.js";

export const RepresentativeKeywordSourceSchema = z.enum([
  "manual_override",
  "wing_performance",
  "coupang_category",
  "product_name",
]);

export const RepresentativeKeywordCandidateSchema = z.object({
  keyword: z.string(),
  origin: z.enum(["coupang_category", "product_name"]),
  score: z.number().nullable(),
  salesRank: z.number().int().nullable(),
  keywordSalesLast28d: z.number().nullable(),
  keywordViewsLast28d: z.number().nullable(),
  keywordConversionRate28d: z.number().nullable(),
  observed: z.boolean(),
});

export const ProductKeywordRankHistoryPointSchema = z.object({
  businessDate: z.string().date(),
  salesRank: z.number().int().nullable(),
  salesLast28d: z.number().nullable(),
});

export const ProductKeywordRankRowSchema = z.object({
  keyword: z.string(),
  keywordSource: RepresentativeKeywordSourceSchema,
  keywordScore: z.number().nullable(),
  recommendationReason: z.string(),
  automaticKeyword: z.string(),
  category: z.string().nullable(),
  candidates: z.array(RepresentativeKeywordCandidateSchema),
  vendorItemId: z.string(),
  groupedVendorItemIds: z.array(z.string()),
  groupedOptionCount: z.number().int(),
  skuId: z.string().nullable(),
  productName: z.string().nullable(),
  abcGrades: z.array(ProductAbcGradeSchema),
  currentSalesRank: z.number().int().nullable(),
  previousSalesRank: z.number().int().nullable(),
  salesLast28d: z.number().nullable(),
  viewsLast28d: z.number().nullable(),
  revenueLast28d: z.number().nullable(),
  conversionRate28d: z.number().nullable(),
  salePrice: z.number().nullable(),
  reviewCount: z.number().int().nullable(),
  collectedCount: z.number().int().nullable(),
  totalResults: z.number().int().nullable(),
  businessDate: z.string().date().nullable(),
  capturedAt: zIsoDate.nullable(),
  history: z.array(ProductKeywordRankHistoryPointSchema),
});

export const ProductKeywordRankOverviewSummarySchema = z.object({
  productCount: z.number().int(),
  optionCount: z.number().int(),
  duplicateOptionCount: z.number().int(),
  representativeKeywordCount: z.number().int(),
  rankedCount: z.number().int(),
  top20Count: z.number().int(),
  risingCount: z.number().int(),
  fallingCount: z.number().int(),
  outOfRangeCount: z.number().int(),
  notCollectedCount: z.number().int(),
});

export const ProductKeywordRankOverviewResponseSchema = z.object({
  periodDays: z.number().int(),
  summary: ProductKeywordRankOverviewSummarySchema,
  rows: z.array(ProductKeywordRankRowSchema),
});

export type RepresentativeKeywordSource = z.infer<
  typeof RepresentativeKeywordSourceSchema
>;
export type RepresentativeKeywordCandidate = z.infer<
  typeof RepresentativeKeywordCandidateSchema
>;
export type ProductKeywordRankHistoryPoint = z.infer<
  typeof ProductKeywordRankHistoryPointSchema
>;
export type ProductKeywordRankRow = z.infer<typeof ProductKeywordRankRowSchema>;
export type ProductKeywordRankOverviewSummary = z.infer<
  typeof ProductKeywordRankOverviewSummarySchema
>;
export type ProductKeywordRankOverviewResponse = z.infer<
  typeof ProductKeywordRankOverviewResponseSchema
>;
