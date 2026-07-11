import { fetchAllSellpiaInventorySkus } from '../../_shared/inventory-api';
import type {
  InventorySkuSnapshotItem,
  InventorySkuStockStatus,
} from '@kiditem/shared/inventory';

export async function fetchAllInventoryForExport(
  stockStatus?: InventorySkuStockStatus,
  query?: string,
): Promise<InventorySkuSnapshotItem[]> {
  return fetchAllSellpiaInventorySkus({ stockStatus, query });
}

export function toInventoryExportRows(items: InventorySkuSnapshotItem[]) {
  return items.map((item) => ({
    셀피아상품코드: item.sellpiaProductCode,
    상품명: item.name,
    옵션: item.optionName ?? '',
    바코드: item.barcode ?? '',
    현재고: item.currentStock,
    매입가: item.purchasePrice ?? '',
    판매가: item.salePrice ?? '',
    재고자산: item.stockValue ?? '',
    최종가져오기: item.lastImportedAt ?? '',
  }));
}
