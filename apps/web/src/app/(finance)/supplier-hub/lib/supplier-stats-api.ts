import {
  SupplierHistoryReportSchema,
  SupplierProductSalesReportSchema,
  SupplierSalesReportSchema,
} from '@kiditem/shared/supplier-stats';
import { apiClient } from '@/lib/api-client';
import type {
  SupplierHistoryReport,
  SupplierProductSalesReport,
  SupplierSalesReport,
} from '@kiditem/shared/supplier-stats';

export async function fetchSupplierSalesReport(): Promise<SupplierSalesReport> {
  return apiClient.getParsed('/api/supplier-stats?type=sales', SupplierSalesReportSchema);
}

export async function fetchSupplierProductSalesReport(
  supplierId: string,
): Promise<SupplierProductSalesReport> {
  const query = new URLSearchParams({ type: 'productSales', supplierId });
  return apiClient.getParsed(`/api/supplier-stats?${query}`, SupplierProductSalesReportSchema);
}

export async function fetchSupplierHistoryReport(supplierId: string): Promise<SupplierHistoryReport> {
  const query = new URLSearchParams({ type: 'history', supplierId });
  return apiClient.getParsed(`/api/supplier-stats?${query}`, SupplierHistoryReportSchema);
}
