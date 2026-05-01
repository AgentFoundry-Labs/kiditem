import { z } from 'zod';
import { apiClient } from '@/lib/api-client';

const NullableDateSchema = z.string().nullable();

export const SupplierPaymentReportItemSchema = z.object({
  id: z.string(),
  supplierId: z.string(),
  supplierName: z.string(),
  amount: z.number().int(),
  paidAmount: z.number().int(),
  status: z.string(),
  dueDate: NullableDateSchema,
  paidDate: NullableDateSchema.optional(),
  purchaseOrderId: z.string().nullable().optional(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type SupplierPaymentReportItem = z.infer<typeof SupplierPaymentReportItemSchema>;

export const SupplierPaymentSummarySchema = z.object({
  totalAmount: z.number().int(),
  totalPaid: z.number().int(),
  totalUnpaid: z.number().int(),
});
export type SupplierPaymentSummary = z.infer<typeof SupplierPaymentSummarySchema>;

export const SupplierPaymentCountsSchema = z.object({
  all: z.number().int(),
  unpaid: z.number().int(),
  partial: z.number().int(),
  paid: z.number().int(),
});
export type SupplierPaymentCounts = z.infer<typeof SupplierPaymentCountsSchema>;

export const SupplierSettlementRowSchema = z.object({
  supplierId: z.string(),
  supplierName: z.string(),
  totalOrdered: z.number().int(),
  totalPaid: z.number().int(),
  unpaid: z.number().int(),
  orderCount: z.number().int(),
  receivedCount: z.number().int(),
  status: z.enum(['unpaid', 'partial', 'paid']),
});
export type SupplierSettlementRow = z.infer<typeof SupplierSettlementRowSchema>;

export const SupplierPaymentReportSchema = z.object({
  summary: SupplierPaymentSummarySchema,
  counts: SupplierPaymentCountsSchema,
  settlements: z.array(SupplierSettlementRowSchema),
  items: z.array(SupplierPaymentReportItemSchema),
});
export type SupplierPaymentReport = z.infer<typeof SupplierPaymentReportSchema>;

export async function fetchSupplierPaymentReport(): Promise<SupplierPaymentReport> {
  return apiClient.getParsed('/api/supplier-payments/report', SupplierPaymentReportSchema);
}
