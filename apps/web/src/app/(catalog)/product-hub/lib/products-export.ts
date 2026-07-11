import { apiClient } from '@/lib/api-client';
import type { ProductListItem as Product } from './product-types';
import type { GradeMap } from './abc-grading';
import { gradeOf } from './abc-grading';

interface ExportFilters {
  gradeFilter: string;
  statusFilter: string;
  submittedSearch: string;
}

export async function downloadProductsExcel(
  filters: ExportFilters,
  gradeMap: GradeMap,
): Promise<void> {
  const { gradeFilter, statusFilter, submittedSearch } = filters;
  const params = new URLSearchParams();
  if (gradeFilter !== 'all') params.set('grade', gradeFilter);
  if (statusFilter !== 'all') params.set('status', statusFilter);
  if (submittedSearch) params.set('search', submittedSearch);
  params.set('enriched', 'true');
  params.set('period', '14');
  params.set('limit', '10000');

  const data = await apiClient.get<{ items: Product[] }>(`/api/products/masters?${params}`);
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(
    data.items.map(p => ({
      등급: gradeOf(p, gradeMap),
      상품명: p.name,
      SKU: p.sku,
      카테고리: p.category,
      회사: p.company,
      매입가: p.costPrice,
      판매가: p.sellPrice,
      수수료율: p.commissionRate,
      배송비: p.shippingCost,
      매출: p.revenue,
      순이익: p.netProfit,
      이익률: p.profitRate,
      광고비율: p.adRate,
      상태: p.status === 'active' ? '판매중' : p.status === 'inactive' ? '중지' : p.status === 'unknown' ? '상태미수집' : '정리',
    })),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '상품목록');
  XLSX.writeFile(wb, `상품목록_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
