import { describe, expect, it } from 'vitest';
import {
  AdjustStockInputSchema,
  InventoryListResponseSchema,
  IssueStockInputSchema,
  ReceiveStockInputSchema,
  StockOperationResultSchema,
  TransactionListResponseSchema,
  TransactionSummarySchema,
  UpdateInventoryMetadataInputSchema,
} from './inventory.js';

const inventoryRow = {
  id: '00000000-0000-4000-8000-000000000001',
  optionId: '00000000-0000-4000-8000-000000000002',
  masterId: '00000000-0000-4000-8000-000000000003',
  sku: 'SKU-1',
  masterName: '테스트 상품',
  optionName: '블루',
  kind: 'SIMPLE',
  currentStock: 10,
  availableStock: 10,
  safetyStock: 3,
  reorderPoint: 5,
  leadTimeDays: null,
  warehouseLocation: null,
  status: 'healthy',
};

describe('inventory shared schemas', () => {
  it('parses inventory list response', () => {
    expect(() =>
      InventoryListResponseSchema.parse({
        items: [inventoryRow],
        total: 1,
        page: 1,
        limit: 50,
        summary: { total: 1, healthy: 1, low: 0, out: 0 },
      }),
    ).not.toThrow();
  });

  it('rejects invalid inventory status', () => {
    expect(() =>
      InventoryListResponseSchema.parse({
        items: [{ ...inventoryRow, status: 'warning' }],
        total: 1,
        page: 1,
        limit: 50,
        summary: { total: 1, healthy: 0, low: 1, out: 0 },
      }),
    ).toThrow();
  });

  it('parses stock operation result', () => {
    expect(() =>
      StockOperationResultSchema.parse({
        inventory: {
          id: inventoryRow.id,
          optionId: inventoryRow.optionId,
          companyId: '00000000-0000-4000-8000-000000000004',
          currentStock: 15,
          reservedStock: 0,
          safetyStock: 3,
          reorderPoint: 5,
          reorderQuantity: 20,
          leadTimeDays: null,
          dailySalesAvg: 0,
          warehouseLocation: null,
          lastRestockedAt: '2026-04-25T00:00:00.000Z',
          createdAt: '2026-04-25T00:00:00.000Z',
          updatedAt: '2026-04-25T00:00:00.000Z',
        },
        transaction: {
          id: '00000000-0000-4000-8000-000000000005',
          optionId: inventoryRow.optionId,
          type: 'RECEIVE',
          quantity: 5,
          stockDelta: 5,
          unitCost: 1000,
          createdAt: '2026-04-25T00:00:00.000Z',
        },
        recomputedBundleOptionIds: [],
      }),
    ).not.toThrow();
  });

  it('parses transaction list and summary', () => {
    expect(() =>
      TransactionListResponseSchema.parse({
        items: [
          {
            id: '00000000-0000-4000-8000-000000000006',
            optionId: inventoryRow.optionId,
            optionName: '블루',
            type: 'ISSUE',
            quantity: 2,
            stockDelta: -2,
            unitCost: 0,
            totalCost: 0,
            warehouseId: null,
            relatedId: null,
            relatedType: null,
            note: null,
            createdBy: 'user-1',
            createdAt: '2026-04-25T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
      }),
    ).not.toThrow();

    expect(() =>
      TransactionSummarySchema.parse({
        inQty: 5,
        outQty: 2,
        adjustQty: 1,
        inAmount: 5000,
        outAmount: 0,
      }),
    ).not.toThrow();
  });

  it('validates mutation inputs', () => {
    expect(ReceiveStockInputSchema.parse({ quantity: 1, unitCost: 0 })).toEqual({
      quantity: 1,
      unitCost: 0,
    });
    expect(IssueStockInputSchema.parse({ quantity: 1, relatedType: 'manual' })).toEqual({
      quantity: 1,
      relatedType: 'manual',
    });
    expect(AdjustStockInputSchema.safeParse({ delta: 0, reason: 'bad' }).success).toBe(false);
    expect(AdjustStockInputSchema.safeParse({ delta: 1, reason: '' }).success).toBe(false);
    expect(AdjustStockInputSchema.parse({ delta: -3, reason: 'damage' })).toEqual({
      delta: -3,
      reason: 'damage',
    });
    expect(
      UpdateInventoryMetadataInputSchema.parse({ safetyStock: 3, warehouseLocation: null }),
    ).toEqual({ safetyStock: 3, warehouseLocation: null });
  });
});
