import { z } from 'zod';
import { zIsoDate } from './common.js';

/**
 * Supplier stats response schemas — Plan B2c.orders T10.
 *
 * Backend `SupplierStatsService` 의 `getSalesBySupplier` / `getProductSales` / `getHistory`
 * 리포트 응답 계약을 고정한다.
 * ChannelListingOption recipe -> physical MasterProduct -> primary SupplierProduct
 * aggregation contract. Bundle revenue is cost-weighted once; lines without a
 * complete primary-supplier/cost policy are exposed as unallocated revenue.
 */

export const SupplierSalesRowSchema = z.object({
  supplierId: z.string().uuid(),
  supplierName: z.string(),
  productCount: z.number().int(),
  totalOrders: z.number().int(),
  totalQuantity: z.number().int(),
  totalRevenue: z.number().int(),
});
export type SupplierSalesRow = z.infer<typeof SupplierSalesRowSchema>;

export const SupplierSalesSummarySchema = z.object({
  supplierCount: z.number().int(),
  productCount: z.number().int(),
  totalOrders: z.number().int(),
  totalQuantity: z.number().int(),
  totalRevenue: z.number().int(),
  unallocatedRevenue: z.number().int(),
});
export type SupplierSalesSummary = z.infer<typeof SupplierSalesSummarySchema>;

export const SupplierSalesReportSchema = z.object({
  summary: SupplierSalesSummarySchema,
  items: z.array(SupplierSalesRowSchema),
});
export type SupplierSalesReport = z.infer<typeof SupplierSalesReportSchema>;

export const SupplierProductSalesRowSchema = z.object({
  masterId: z.string().uuid(),
  masterCode: z.string(),
  masterName: z.string(),
  optionName: z.string().nullable(),
  supplyPrice: z.number().int(),
  minOrderQty: z.number().int(),
  totalOrders: z.number().int(),
  totalQuantity: z.number().int(),
  totalRevenue: z.number().int(),
});
export type SupplierProductSalesRow = z.infer<typeof SupplierProductSalesRowSchema>;

export const SupplierProductSalesSummarySchema = z.object({
  productCount: z.number().int(),
  totalOrders: z.number().int(),
  totalQuantity: z.number().int(),
  totalRevenue: z.number().int(),
});
export type SupplierProductSalesSummary = z.infer<typeof SupplierProductSalesSummarySchema>;

export const SupplierProductSalesReportSchema = z.object({
  summary: SupplierProductSalesSummarySchema,
  items: z.array(SupplierProductSalesRowSchema),
});
export type SupplierProductSalesReport = z.infer<typeof SupplierProductSalesReportSchema>;

export const SupplierHistoryItemSchema = z.object({
  type: z.enum(['purchaseOrder', 'payment']),
  id: z.string().uuid(),
  date: zIsoDate,
  amount: z.number(),
  status: z.string(),
  description: z.string(),
});
export type SupplierHistoryItem = z.infer<typeof SupplierHistoryItemSchema>;

export const SupplierHistorySummarySchema = z.object({
  totalOrdered: z.number(),
  totalPaid: z.number().int(),
  unpaid: z.number(),
  orderCount: z.number().int(),
  paymentCount: z.number().int(),
});
export type SupplierHistorySummary = z.infer<typeof SupplierHistorySummarySchema>;

export const SupplierHistoryReportSchema = z.object({
  summary: SupplierHistorySummarySchema,
  items: z.array(SupplierHistoryItemSchema),
});
export type SupplierHistoryReport = z.infer<typeof SupplierHistoryReportSchema>;
