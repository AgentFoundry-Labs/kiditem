import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryApplicationService } from '../inventory-application.service';
import type { InventoryQuery } from '../../../adapter/out/prisma/inventory.query';
import type { InventoryPersistence } from '../../../adapter/out/prisma/inventory.persistence';
import type { BundleStockService } from '../../../../products/application/service/bundle-stock.service';

// Stub for InventoryPersistence — mocks the run-in-transaction callback by
// invoking it immediately with a fake `tx` and the seeded locked inventory row.
function makePersistence(initialStock: number, lastRestockedAt: Date | null = null) {
  const lockedRow = {
    id: 'i1', optionId: 'o1', companyId: 'c1',
    currentStock: initialStock,
    reservedStock: 0, safetyStock: 0, reorderPoint: 0, reorderQuantity: 0,
    leadTimeDays: null, dailySalesAvg: 0, warehouseLocation: null,
    lastRestockedAt,
    createdAt: new Date(), updatedAt: new Date(),
  };
  const tx = Symbol('tx');

  const persistence = {
    updateInventoryMetadata: vi.fn(),
    runInventoryStockMutation: vi.fn(async (
      _id: string,
      _companyId: string,
      op: (tx: any, row: any) => Promise<unknown>,
    ) => op(tx, lockedRow)),
    applyStockDelta: vi.fn(),
    findOptionNameForLedger: vi.fn(),
    appendStockLedger: vi.fn(),
  };
  return { persistence, lockedRow, tx };
}

describe('InventoryApplicationService — mutations (receive/issue/adjust)', () => {
  let service: InventoryApplicationService;
  let persistence: ReturnType<typeof makePersistence>['persistence'];
  let bundleStock: { recomputeForComponent: ReturnType<typeof vi.fn> };
  let tx: symbol;

  function bind(initialStock: number, lastRestockedAt: Date | null = null) {
    const made = makePersistence(initialStock, lastRestockedAt);
    persistence = made.persistence;
    tx = made.tx;
    bundleStock = { recomputeForComponent: vi.fn().mockResolvedValue([]) };
    service = new InventoryApplicationService(
      {} as InventoryQuery,
      persistence as unknown as InventoryPersistence,
      bundleStock as unknown as BundleStockService,
    );
  }

  describe('receive', () => {
    it('atomic sequence: lock → update → ledger → fan-out', async () => {
      bind(10);
      persistence.applyStockDelta.mockResolvedValue({
        id: 'i1', optionId: 'o1', companyId: 'c1', currentStock: 15,
      });
      persistence.findOptionNameForLedger.mockResolvedValue('Red');
      persistence.appendStockLedger.mockResolvedValue({
        id: 'tx1', optionId: 'o1', type: 'RECEIVE', quantity: 5, unitCost: 100,
        createdAt: new Date(),
      });
      bundleStock.recomputeForComponent.mockResolvedValue(['bundle-A']);

      const result = await service.receive('i1', { quantity: 5, unitCost: 100 }, 'c1', 'user-1');

      expect(persistence.runInventoryStockMutation).toHaveBeenCalledWith('i1', 'c1', expect.any(Function));
      expect(persistence.applyStockDelta).toHaveBeenCalledWith(tx, 'i1', 5, true, null);
      expect(persistence.findOptionNameForLedger).toHaveBeenCalledWith(tx, 'o1', 'c1');
      expect(persistence.appendStockLedger).toHaveBeenCalledWith(tx, expect.objectContaining({
        companyId: 'c1', optionId: 'o1', type: 'RECEIVE',
        quantity: 5, unitCost: 100, totalCost: 500,
        optionName: 'Red', createdBy: 'user-1',
      }));
      expect(bundleStock.recomputeForComponent).toHaveBeenCalledWith('c1', 'o1', tx);
      expect(result.recomputedBundleOptionIds).toEqual(['bundle-A']);
      expect(result.transaction.type).toBe('RECEIVE');
    });

    it('unitCost defaults to 0', async () => {
      bind(10);
      persistence.applyStockDelta.mockResolvedValue({ id: 'i1', optionId: 'o1', companyId: 'c1' });
      persistence.findOptionNameForLedger.mockResolvedValue(null);
      persistence.appendStockLedger.mockResolvedValue({
        id: 'tx1', optionId: 'o1', type: 'RECEIVE', quantity: 5, unitCost: 0,
        createdAt: new Date(),
      });

      await service.receive('i1', { quantity: 5 }, 'c1', 'user-1');

      const call = persistence.appendStockLedger.mock.calls[0][1];
      expect(call.unitCost).toBe(0);
      expect(call.totalCost).toBe(0);
      expect(call.optionName).toBeNull();
    });

    it('NotFound from persistence layer propagates (cross-tenant guard inside lock)', async () => {
      bind(10);
      persistence.runInventoryStockMutation.mockRejectedValue(new NotFoundException('Inventory not found'));
      await expect(service.receive('i1', { quantity: 5 }, 'c2', 'user-1'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('issue', () => {
    it('decrements stock; carries relatedId/relatedType', async () => {
      bind(10);
      persistence.applyStockDelta.mockResolvedValue({ id: 'i1', optionId: 'o1', companyId: 'c1' });
      persistence.findOptionNameForLedger.mockResolvedValue(null);
      persistence.appendStockLedger.mockResolvedValue({
        id: 'tx1', optionId: 'o1', type: 'ISSUE', quantity: 3, unitCost: 0,
        createdAt: new Date(),
      });

      await service.issue('i1', { quantity: 3, relatedId: 'order-1', relatedType: 'Order' }, 'c1', 'user-1');

      expect(persistence.applyStockDelta).toHaveBeenCalledWith(tx, 'i1', -3, false, null);
      const ledger = persistence.appendStockLedger.mock.calls[0][1];
      expect(ledger.type).toBe('ISSUE');
      expect(ledger.quantity).toBe(3); // absolute amount stored; direction implied by type
      expect(ledger.relatedId).toBe('order-1');
      expect(ledger.relatedType).toBe('Order');
    });

    it('insufficient stock → BadRequest, no writes', async () => {
      bind(2);
      await expect(service.issue('i1', { quantity: 5 }, 'c1', 'user-1'))
        .rejects.toThrow(BadRequestException);
      expect(persistence.applyStockDelta).not.toHaveBeenCalled();
      expect(persistence.appendStockLedger).not.toHaveBeenCalled();
    });

    it('does not bump lastRestockedAt', async () => {
      const existing = new Date('2024-01-01T00:00:00Z');
      bind(10, existing);
      persistence.applyStockDelta.mockResolvedValue({ id: 'i1', optionId: 'o1', companyId: 'c1' });
      persistence.findOptionNameForLedger.mockResolvedValue(null);
      persistence.appendStockLedger.mockResolvedValue({
        id: 'tx1', optionId: 'o1', type: 'ISSUE', quantity: 3, unitCost: 0, createdAt: new Date(),
      });

      await service.issue('i1', { quantity: 3 }, 'c1', 'user-1');

      expect(persistence.applyStockDelta).toHaveBeenCalledWith(tx, 'i1', -3, false, existing);
    });
  });

  describe('adjust', () => {
    it('positive delta increments; signed quantity stored in ledger', async () => {
      bind(10);
      persistence.applyStockDelta.mockResolvedValue({ id: 'i1', optionId: 'o1', companyId: 'c1' });
      persistence.findOptionNameForLedger.mockResolvedValue(null);
      persistence.appendStockLedger.mockResolvedValue({
        id: 'tx1', optionId: 'o1', type: 'ADJUST', quantity: 4, unitCost: 0, createdAt: new Date(),
      });

      await service.adjust('i1', { delta: 4, reason: 'recount' }, 'c1', 'user-1');

      expect(persistence.applyStockDelta).toHaveBeenCalledWith(tx, 'i1', 4, false, null);
      const ledger = persistence.appendStockLedger.mock.calls[0][1];
      expect(ledger.type).toBe('ADJUST');
      expect(ledger.quantity).toBe(4);
      expect(ledger.note).toBe('recount');
    });

    it('negative delta stores signed quantity', async () => {
      bind(10);
      persistence.applyStockDelta.mockResolvedValue({ id: 'i1', optionId: 'o1', companyId: 'c1' });
      persistence.findOptionNameForLedger.mockResolvedValue(null);
      persistence.appendStockLedger.mockResolvedValue({
        id: 'tx1', optionId: 'o1', type: 'ADJUST', quantity: -4, unitCost: 0, createdAt: new Date(),
      });

      await service.adjust('i1', { delta: -4, reason: 'shrinkage' }, 'c1', 'user-1');

      const ledger = persistence.appendStockLedger.mock.calls[0][1];
      expect(ledger.quantity).toBe(-4); // signed delta survives in the ledger
    });

    it('exceeding stock → BadRequest', async () => {
      bind(3);
      await expect(service.adjust('i1', { delta: -5, reason: 'shrinkage' }, 'c1', 'user-1'))
        .rejects.toThrow(BadRequestException);
      expect(persistence.applyStockDelta).not.toHaveBeenCalled();
    });
  });
});
