import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBarcodePrintHtml, escapeHtml, printBarcodeWindow } from './barcode-print';
import type { InventorySkuSnapshotItem } from '@kiditem/shared/inventory';

const item: InventorySkuSnapshotItem = {
  id: '00000000-0000-4000-8000-000000000001',
  sellpiaProductCode: 'SP-<script>',
  name: '상품 <img src=x onerror=alert(1)>',
  optionName: '빨강',
  barcode: '8801234567890',
  currentStock: 7,
  purchasePrice: 100,
  salePrice: 200,
  stockValue: 700,
  lastImportRunId: '00000000-0000-4000-8000-000000000002',
  lastImportedAt: '2026-07-11T01:00:00.000Z',
};

describe('barcode print html', () => {
  it('escapes html special characters', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('prints the real barcode and Sellpia identity without raw HTML injection', () => {
    const html = buildBarcodePrintHtml([item], new Date('2026-07-12T00:00:00.000Z'));
    expect(html).toContain('8801234567890');
    expect(html).toContain('SP-&lt;script&gt;');
    expect(html).toContain('상품 &lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('SP-<script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  });
});

describe('printBarcodeWindow', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not open an empty print window', () => {
    const openSpy = vi.spyOn(window, 'open');
    expect(printBarcodeWindow([])).toBe('empty');
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('reports a blocked popup', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    expect(printBarcodeWindow([item])).toBe('popup-blocked');
  });
});
