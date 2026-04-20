import { z } from 'zod';

/**
 * P&L row — listingId-primary (Plan B2c.orders T10).
 *
 * Source: `profit-loss.service.ts` + statistics `products()` return shape.
 * ADR-0013 (3-layer schema) 반영: `productId`/`sku`/`company` 등 stale 필드 제거,
 * ChannelListing(`listingId`) + MasterProduct(`masterId`) + 채널/외부ID 를 1급 필드로.
 *
 * Frontend consumers (`apps/web/src/app/profit-loss/**`) 는 Plan D 에서 재배선한다.
 * 이 plan 은 backend `satisfies PLData` 로 drift 감지만 제공.
 */
export const PLDataSchema = z.object({
  listingId: z.string().uuid(),
  externalId: z.string(),
  channelName: z.string().nullable(),
  masterId: z.string().uuid(),
  masterCode: z.string(),
  masterName: z.string(),
  category: z.string().nullable(),
  grade: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  revenue: z.number().int(),
  cogs: z.number().int(),
  commission: z.number().int(),
  shippingCost: z.number().int(),
  adCost: z.number().int(),
  otherCost: z.number().int(),
  netProfit: z.number().int(),
  profitRate: z.number(),
  orderCount: z.number().int(),
  returnCount: z.number().int(),
});

export type PLData = z.infer<typeof PLDataSchema>;
