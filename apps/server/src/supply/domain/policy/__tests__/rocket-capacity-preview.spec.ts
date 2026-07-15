import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { previewRocketCapacity } from '../rocket-capacity-preview';

const earlierRow = {
  poLineId: 'line-earlier',
  poNumber: '1001',
  productNo: 'P-1',
  productName: 'Earlier',
  plannedDeliveryDate: '2026-07-20',
  orderQuantity: 4,
  channelSkuId: 'sku-1',
  components: [{
    masterProductId: 'master-1',
    quantity: 1,
    currentStock: 5,
    isActive: true,
  }],
};
const laterRow = {
  ...earlierRow,
  poLineId: 'line-later',
  poNumber: '1002',
  productName: 'Later',
  plannedDeliveryDate: '2026-07-21',
};

describe('previewRocketCapacity', () => {
  it('allocates a shared component in stable ETA, PO, line order', () => {
    const rows = previewRocketCapacity({ rows: [laterRow, earlierRow], editedQuantities: {} });
    expect(rows.map((row) => [row.poLineId, row.recommendedQuantity])).toEqual([
      ['line-earlier', 4],
      ['line-later', 1],
    ]);
    expect(rows[1]?.reason).toBe('insufficient_capacity');
  });

  it('returns mapping and inactive reasons without allocating capacity', () => {
    const rows = previewRocketCapacity({
      editedQuantities: {},
      rows: [
        { ...earlierRow, poLineId: 'unmapped', channelSkuId: null, components: [] },
        {
          ...laterRow,
          poLineId: 'inactive',
          components: [{ ...laterRow.components[0]!, isActive: false }],
        },
      ],
    });
    expect(rows.map((row) => row.reason)).toEqual([
      'mapping_required',
      'component_inactive',
    ]);
  });

  it.each([
    {
      name: 'unmapped',
      row: { ...earlierRow, channelSkuId: null, components: [] },
      quantity: 1,
    },
    {
      name: 'inactive',
      row: {
        ...earlierRow,
        components: [{ ...earlierRow.components[0]!, isActive: false }],
      },
      quantity: 1,
    },
    {
      name: 'zero capacity',
      row: {
        ...earlierRow,
        components: [{ ...earlierRow.components[0]!, currentStock: 0 }],
      },
      quantity: 1,
    },
  ])('rejects a positive edit for a $name row whose recomputed max is zero', ({ row, quantity }) => {
    expect(() => previewRocketCapacity({
      rows: [row],
      editedQuantities: { 'line-earlier': quantity },
    })).toThrowError(expect.objectContaining({
      name: 'RocketPreviewQuantityExceededError',
      maxQuantity: 0,
    }));
  });

  it('rejects an edited quantity above recomputed remaining component capacity', () => {
    expect(() => previewRocketCapacity({
      rows: [earlierRow],
      editedQuantities: { 'line-earlier': 6 },
    })).toThrowError(expect.objectContaining({
      name: 'RocketPreviewQuantityExceededError',
      maxQuantity: 5,
    }));
  });

  it('keeps the domain policy independent of NestJS', () => {
    const source = readFileSync(
      new URL('../rocket-capacity-preview.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toContain('@nestjs/common');
  });
});
