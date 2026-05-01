import { z } from 'zod';
import { zIsoDate } from './common.js';

/**
 * Supplier stats response schemas — Plan B2c.orders T10.
 *
 * Backend `SupplierStatsService` 의 `getSalesBySupplier` / `getProductSales` / `getHistory`
 * 리포트 응답과 프론트 supplier-hub 화면 파싱 계약을 함께 고정한다.
 * optionId-based aggregation (ADR-0013 SupplierProduct(optionId) + MasterSupplierProduct(masterId)).
 * MasterSupplierProduct 경로는 schema 상 `supplyPrice` 필드 없으므로 nullable.
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
});
export type SupplierSalesSummary = z.infer<typeof SupplierSalesSummarySchema>;

export const SupplierSalesReportSchema = z.object({
  summary: SupplierSalesSummarySchema,
  items: z.array(SupplierSalesRowSchema),
});
export type SupplierSalesReport = z.infer<typeof SupplierSalesReportSchema>;

export const SupplierProductSalesRowSchema = z.object({
  optionId: z.string().uuid(),
  sku: z.string().nullable(),
  optionName: z.string().nullable(),
  masterId: z.string().uuid(),
  masterCode: z.string(),
  masterName: z.string(),
  supplyPrice: z.number().int().nullable(),
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
