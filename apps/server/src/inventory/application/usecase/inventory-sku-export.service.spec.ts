import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import {
  InventorySkuExportService,
} from './inventory-sku-export.service';

describe('InventorySkuExportService', () => {
  it('builds the same transient sheet, columns, and authoritative fields as the old UI export', async () => {
    const snapshots = {
      listSnapshotForExport: vi.fn().mockResolvedValue({
        items: [{
          sellpiaInventorySkuId: 'sku-1',
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
          linkedChannelOptionCount: 0,
          linkedProductCount: 0,
          linkedProducts: [],
          linkedChannelOptions: [],
          linkStatus: 'unlinked',
        }],
        total: 1,
        page: 1,
        limit: 1,
        summary: {},
        latestImport: null,
      }),
    };
    const service = new InventorySkuExportService(snapshots as never);

    const result = await service.export('org-1', {
      query: 'SP-1',
      stockStatus: 'all',
      linkStatus: 'unlinked',
    });

    expect(snapshots.listSnapshotForExport).toHaveBeenCalledWith('org-1', {
      query: 'SP-1',
      stockStatus: 'all',
      linkStatus: 'unlinked',
    });
    expect(result.fileName).toMatch(/^Sellpia_현재재고_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(result.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const workbook = XLSX.read(result.buffer, { type: 'buffer' });
    expect(workbook.SheetNames).toEqual(['Sellpia 현재재고']);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets['Sellpia 현재재고'], {
      header: 1,
      defval: '',
    })).toEqual([
      ['셀피아상품코드', '상품명', '옵션', '바코드', '현재고', '매입가', '판매가', '재고자산', '최종가져오기'],
      ['SP-1', '말랑이', '', '', 8, '', 3000, '', ''],
    ]);
  });

  it('rejects a snapshot whose row count does not match its total', async () => {
    const snapshots = {
      listSnapshotForExport: vi.fn().mockResolvedValue({
        items: [{
          sellpiaInventorySkuId: 'sku-1',
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
          linkedChannelOptionCount: 0,
          linkedProductCount: 0,
          linkedProducts: [],
          linkedChannelOptions: [],
          linkStatus: 'unlinked',
        }],
        total: 0,
        page: 1,
        limit: 1,
        summary: {},
        latestImport: null,
      }),
    };
    const service = new InventorySkuExportService(snapshots);

    await expect(service.export('org-1', {})).rejects.toThrow(
      '재고 엑셀 데이터를 끝까지 조회하지 못했습니다. 다시 시도해주세요.',
    );
  });
});
