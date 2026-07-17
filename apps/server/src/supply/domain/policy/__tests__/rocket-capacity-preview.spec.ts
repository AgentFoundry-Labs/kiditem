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
  masterProductId: 'master-1',
  productVariantId: 'variant-1',
  recipeStatus: 'matched' as const,
  components: [{
    sellpiaInventorySkuId: 'sellpia-sku-1',
    quantity: 1,
    currentStock: 5,
    activeCommitmentQuantity: 0,
    availableStock: 5,
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
    expect(rows[0]?.plannedDeliveryDate).toBe('2026-07-20');
  });

  it('uses Inventory available stock without subtracting commitments twice', () => {
    const rows = previewRocketCapacity({
      rows: [{
        ...earlierRow,
        orderQuantity: 100,
        components: [{
          ...earlierRow.components[0]!,
          currentStock: 100,
          activeCommitmentQuantity: 20,
          availableStock: 80,
        }],
      }],
      editedQuantities: {},
    });

    expect(rows[0]).toMatchObject({
      maxQuantity: 80,
      recommendedQuantity: 80,
      reason: 'insufficient_capacity',
    });
  });

  it('uses numeric PO order and then line ID as same-date tie breakers', () => {
    const rows = previewRocketCapacity({
      rows: [
        { ...earlierRow, poLineId: 'line-10', poNumber: '10', orderQuantity: 1 },
        { ...earlierRow, poLineId: 'line-2-b', poNumber: '2', orderQuantity: 1 },
        { ...earlierRow, poLineId: 'line-2-a', poNumber: '2', orderQuantity: 1 },
      ].map((row) => ({
        ...row,
        components: [{
          ...row.components[0]!,
          currentStock: 1,
          availableStock: 1,
        }],
      })),
      editedQuantities: {},
    });

    expect(rows.map(({ poLineId, recommendedQuantity }) => [
      poLineId,
      recommendedQuantity,
    ])).toEqual([
      ['line-2-a', 1],
      ['line-2-b', 0],
      ['line-10', 0],
    ]);
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
      'review_required',
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
        components: [{
          ...earlierRow.components[0]!,
          currentStock: 0,
          availableStock: 0,
        }],
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

  it('rejects an edited quantity above the PO order quantity even when stock is higher', () => {
    expect(() => previewRocketCapacity({
      rows: [earlierRow],
      editedQuantities: { 'line-earlier': 5 },
    })).toThrowError(expect.objectContaining({
      name: 'RocketPreviewQuantityExceededError',
      maxQuantity: 4,
    }));
  });

  it('jointly clamps retained edits in stable allocation order when explicitly requested', () => {
    const sharedStock = 10;
    const rows = previewRocketCapacity({
      rows: [
        {
          ...earlierRow,
          orderQuantity: 1,
          components: [{
            ...earlierRow.components[0]!,
            currentStock: sharedStock,
            availableStock: sharedStock,
          }],
        },
        {
          ...laterRow,
          orderQuantity: 1,
          components: [{
            ...laterRow.components[0]!,
            currentStock: sharedStock,
            availableStock: sharedStock,
          }],
        },
      ],
      editedQuantities: {
        'line-earlier': 10,
        'line-later': 9,
      },
      clampEditedQuantities: true,
    } as Parameters<typeof previewRocketCapacity>[0] & {
      clampEditedQuantities: boolean;
    });

    expect(rows.map((row) => ({
      poLineId: row.poLineId,
      maxQuantity: row.maxQuantity,
      editedQuantity: row.editedQuantity,
      recommendedQuantity: row.recommendedQuantity,
    }))).toEqual([
      {
        poLineId: 'line-earlier',
        maxQuantity: 1,
        editedQuantity: 1,
        recommendedQuantity: 1,
      },
      {
        poLineId: 'line-later',
        maxQuantity: 1,
        editedQuantity: 1,
        recommendedQuantity: 1,
      },
    ]);
  });

  it('keeps the domain policy independent of NestJS', () => {
    const source = readFileSync(
      new URL('../rocket-capacity-preview.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toContain('@nestjs/common');
    expect(source).not.toContain('committedQuantities');
  });
});
