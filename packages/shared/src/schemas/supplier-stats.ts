import { z } from 'zod';

/**
 * Supplier stats response schemas — Plan B2c.orders T10.
 *
 * Backend `SupplierStatsService` 의 `getSalesBySupplier` / `getProductSales` return literal 에
 * `satisfies SupplierSalesRow[]` / `satisfies SupplierProductSalesRow[]` 바인딩.
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
