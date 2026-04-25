import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBarcodePrintHtml, escapeHtml, printBarcodeWindow } from './barcode-print';
import type { InventoryListItem } from '@kiditem/shared';

const item: InventoryListItem = {
  id: '00000000-0000-4000-8000-000000000001',
  optionId: '00000000-0000-4000-8000-000000000002',
  masterId: '00000000-0000-4000-8000-000000000003',
  sku: 'SKU-<script>',
  masterName: '상품 <img src=x onerror=alert(1)>',
  optionName: null,
  kind: 'SIMPLE',
  currentStock: 7,
  availableStock: 7,
  safetyStock: 2,
  reorderPoint: 3,
  leadTimeDays: null,
  warehouseLocation: null,
  status: 'healthy',
};

describe('barcode print html', () => {
  it('escapes html special characters', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('does not inject raw item fields into the print html', () => {
    const html = buildBarcodePrintHtml([item], new Date('2026-04-25T00:00:00.000Z'));
    expect(html).toContain('SKU-&lt;script&gt;');
    expect(html).toContain('상품 &lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('SKU-<script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  });
});

describe('printBarcodeWindow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "empty" when no items provided and never opens a window', () => {
    const openSpy = vi.spyOn(window, 'open');
    expect(printBarcodeWindow([])).toBe('empty');
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('returns "popup-blocked" when window.open returns null', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    expect(printBarcodeWindow([item])).toBe('popup-blocked');
  });

  it('returns "opened" and writes escaped html to the new window', () => {
    const writeMock = vi.fn();
    const closeMock = vi.fn();
    const fakeWindow = {
      document: { write: writeMock, close: closeMock },
    } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(fakeWindow);

    expect(printBarcodeWindow([item])).toBe('opened');
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
    const writtenHtml = writeMock.mock.calls[0][0] as string;
    // XSS hardening — user-supplied fields must arrive as escaped HTML entities,
    // never as raw payload. The page's own `<script>window.print()</script>` is
    // expected and unrelated.
    expect(writtenHtml).toContain('SKU-&lt;script&gt;');
    expect(writtenHtml).not.toContain('SKU-<script>');
  });
});
