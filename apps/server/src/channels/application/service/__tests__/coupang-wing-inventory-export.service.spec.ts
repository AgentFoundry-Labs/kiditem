import { describe, expect, it } from 'vitest';
import {
  CoupangWingInventoryExportService,
} from '../coupang-wing-inventory-export.service';

describe('CoupangWingInventoryExportService', () => {
  it('preserves the browser workbook metadata, priority columns, and escaping', () => {
    const service = new CoupangWingInventoryExportService();
    const result = service.convert([
      {
        상품명: '첫 상품',
        등록상품ID: 'P-1',
        가격: 1000,
      },
      {
        이미지URL: 'https://cdn.example/image?a=1&b=2',
        상품명: '<두 상품>',
        메모: '"따옴표"',
      },
    ], new Date(2026, 6, 31, 14, 5));

    const workbook = result.buffer.toString('utf8');
    expect(result.fileName).toBe('wing-inventory_2026-07-31_14.05.xls');
    expect(result.contentType).toBe('application/vnd.ms-excel;charset=utf-8');
    expect(result.rowCount).toBe(2);
    expect(result.columns).toEqual(['등록상품ID', '이미지URL', '상품명', '가격', '메모']);
    expect(workbook).toContain('\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office"');
    expect(workbook).toContain('<x:Name>상품목록</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>');
    expect(workbook).toContain('<th style="background:#f0f0f0;font-weight:bold;padding:4px 8px;">등록상품ID</th><th style="background:#f0f0f0;font-weight:bold;padding:4px 8px;">이미지URL</th><th style="background:#f0f0f0;font-weight:bold;padding:4px 8px;">상품명</th><th style="background:#f0f0f0;font-weight:bold;padding:4px 8px;">가격</th><th style="background:#f0f0f0;font-weight:bold;padding:4px 8px;">메모</th>');
    expect(workbook).toContain('https://cdn.example/image?a=1&amp;b=2');
    expect(workbook).toContain('&lt;두 상품&gt;');
    expect(workbook).toContain('&quot;따옴표&quot;');
    expect(workbook.startsWith('\uFEFF')).toBe(true);
  });

  it('rejects an empty or malformed transient export payload', () => {
    const service = new CoupangWingInventoryExportService();

    expect(() => service.convert([])).toThrow('다운로드할 Wing 상품이 없습니다.');
    expect(() => service.convert([null])).toThrow('Wing 상품 행 1이 유효하지 않습니다.');
  });
});
