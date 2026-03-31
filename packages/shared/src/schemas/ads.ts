import { z } from 'zod';

// GET /api/ads 응답의 각 item + GET /api/ads/hub의 products 각 item
export const AdsListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  sku: z.string().nullable(),
  company: z.string(),
  grade: z.string(),
  adTier: z.string().nullable(),
  spend: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  conversions: z.number(),
  adRevenue: z.number(),
  ctr: z.number(),
  convRate: z.number(),
  roas: z.number(),
  acos: z.number(),
  adRate: z.number(),
  revenue: z.number(),
  netProfit: z.number(),
  profitRate: z.number(),
});

// GET /api/ads/hub 응답
export const AdsHubDataSchema = z.object({
  products: z.array(AdsListItemSchema),
  summary: z.object({
    totalSpend: z.number(),
    totalAdRevenue: z.number(),
    totalRevenue: z.number(),
    overallAdRate: z.number(),
    overallRoas: z.number(),
    highAdCount: z.number(),
    gradeSpend: z.record(z.number()),
    tierSpend: z.record(z.number()),
    gradeSpendPercent: z.record(z.number()),
  }),
});

export type AdsListItem = z.infer<typeof AdsListItemSchema>;
export type AdsHubData = z.infer<typeof AdsHubDataSchema>;
export type AdsSummary = AdsHubData['summary'];
