import { describe, expect, it } from 'vitest';
import { buildBarcodePrintHtml, escapeHtml } from './barcode-print';
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
