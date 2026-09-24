import { describe, expect, it, vi } from 'vitest';
import { ProductExportUseCase } from './product-export.usecase';
import type { ProductSourceSnapshotPort } from '../port/in/product-source-snapshot.port';
import type { ProductSourceExportRendererPort } from '../port/out/documents/product-source-export-renderer.port';

describe('ProductExportUseCase', () => {
  it('passes source snapshot rows to the document adapter', async () => {
    const listSnapshotForExport = vi.fn().mockResolvedValue({
      items: [{
        code: 'P-1',
        name: '상품',
        optionName: null,
        barcode: null,
        currentStock: 0,
        purchasePrice: null,
        stockValue: null,
        lastImportedAt: null,
      }],
      total: 1,
    });
    const snapshots = { listSnapshotForExport } as unknown as ProductSourceSnapshotPort;
    const renderer: ProductSourceExportRendererPort = {
      render: vi.fn().mockReturnValue({
        buffer: Buffer.from('xlsx'),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    };
    const useCase = new ProductExportUseCase(snapshots, renderer);

    await expect(useCase.export('org-1', { stockStatus: 'all' }))
      .resolves.toMatchObject({ rowCount: 1, buffer: Buffer.from('xlsx') });
    expect(renderer.render).toHaveBeenCalledWith([{
      셀피아상품코드: 'P-1',
      상품명: '상품',
      옵션: '',
      바코드: '',
      현재고: 0,
      매입가: '',
      재고자산: '',
      최종가져오기: '',
    }]);
    expect(listSnapshotForExport).toHaveBeenCalledWith('org-1', {
      stockStatus: 'all',
      query: undefined,
      linkStatus: undefined,
    });
  });
});
