import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAllSellpiaInventorySkus } from '../../_shared/inventory-api';
import { fetchAllInventoryForExport, toInventoryExportRows } from './inventory-export';

vi.mock('../../_shared/inventory-api', () => ({
  fetchAllSellpiaInventorySkus: vi.fn(),
}));

describe('Sellpia inventory export', () => {
  beforeEach(() => {
    vi.mocked(fetchAllSellpiaInventorySkus).mockReset();
    vi.mocked(fetchAllSellpiaInventorySkus).mockResolvedValue([]);
  });

  it('uses the visible search, stock, active, and link filters for every exported page', async () => {
    await fetchAllInventoryForExport({
      query: 'SP-1001',
      stockStatus: 'all',
      activeStatus: 'inactive',
      linkStatus: 'unlinked',
    });

    expect(fetchAllSellpiaInventorySkus).toHaveBeenCalledWith({
      query: 'SP-1001',
      stockStatus: 'all',
      activeStatus: 'inactive',
      linkStatus: 'unlinked',
    });
  });

  it('exports only authoritative snapshot fields and preserves unpriced rows', () => {
    expect(toInventoryExportRows([{
      masterProductId: '00000000-0000-4000-8000-000000000001',
      code: 'SP-1',
      name: '말랑이',
      optionName: null,
      barcode: null,
      currentStock: 8,
      purchasePrice: null,
      salePrice: 3000,
      isActive: true,
      stockValue: null,
      lastImportRunId: null,
      lastImportedAt: null,
    }])).toEqual([{
      셀피아상품코드: 'SP-1',
      상품명: '말랑이',
      옵션: '',
      바코드: '',
      현재고: 8,
      매입가: '',
      판매가: 3000,
      재고자산: '',
      최종가져오기: '',
    }]);
  });
});
