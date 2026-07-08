import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryService } from '../inventory.service';
import type { InventoryQueryRepositoryPort } from '../../port/out/repository/inventory-query.repository.port';
import type { InventoryRepositoryPort } from '../../port/out/repository/inventory.repository.port';
import type { BundleStockPort } from '../../port/out/cross-domain/bundle-stock.port';

// Stub for InventoryRepositoryPort — mocks the run-in-transaction callback by
// invoking it immediately with a fake `tx` and the seeded locked inventory row.
function makeRepository(
  initialStock: number,
  lastRestockedAt: Date | null = null,
  reservedStock = 0,
) {
  const lockedRow = {
    id: 'i1', optionId: 'o1', organizationId: 'c1',
    currentStock: initialStock,
    reservedStock, safetyStock: 0, reorderPoint: 0, reorderQuantity: 0,
    leadTimeDays: null, dailySalesAvg: 0, warehouseLocation: null,
    lastRestockedAt,
    createdAt: new Date(), updatedAt: new Date(),
  };
  const tx = Symbol('tx');

  const repository = {
    updateInventoryMetadata: vi.fn(),
    runInventoryStockMutation: vi.fn(async (
      _id: string,
      _organizationId: string,
      op: (tx: any, row: any) => Promise<unknown>,
    ) => op(tx, lockedRow)),
    applyStockDelta: vi.fn(),
    findOptionNameForLedger: vi.fn(),
    appendStockLedger: vi.fn(),
    findRocketLedgerBySource: vi.fn(),
    applyStockAndReservedDeltas: vi.fn(),
    appendRocketLedger: vi.fn(),
  };
  return { repository, lockedRow, tx };
}

describe('InventoryService — mutations (receive/issue/adjust)', () => {
  let service: InventoryService;
  let repository: ReturnType<typeof makeRepository>['repository'];
  let bundleStock: { recomputeForComponent: ReturnType<typeof vi.fn> };
  let tx: symbol;

  function bind(
    initialStock: number,
    lastRestockedAt: Date | null = null,
    reservedStock = 0,
  ) {
    const made = makeRepository(initialStock, lastRestockedAt, reservedStock);
    repository = made.repository;
    tx = made.tx;
    bundleStock = { recomputeForComponent: vi.fn().mockResolvedValue([]) };
    service = new InventoryService(
      {} as InventoryQueryRepositoryPort,
      repository as unknown as InventoryRepositoryPort,
      bundleStock as unknown as BundleStockPort,
    );
  }

  describe('receive', () => {
    it('atomic sequence: lock → update → ledger → fan-out', async () => {
      bind(10);
      repository.applyStockDelta.mockResolvedValue({
        id: 'i1', optionId: 'o1', organizationId: 'c1', currentStock: 15,
      });
      repository.findOptionNameForLedger.mockResolvedValue('Red');
      repository.appendStockLedger.mockResolvedValue({
        id: 'tx1', optionId: 'o1', type: 'RECEIVE', quantity: 5, unitCost: 100,
        createdAt: new Date(),
      });
      bundleStock.recomputeForComponent.mockResolvedValue(['bundle-A']);

      const result = await service.receive('i1', { quantity: 5, unitCost: 100 }, 'c1', 'user-1');

      expect(repository.runInventoryStockMutation).toHaveBeenCalledWith('i1', 'c1', expect.any(Function));
      expect(repository.applyStockDelta).toHaveBeenCalledWith(tx, 'i1', 5, true, null);
      expect(repository.findOptionNameForLedger).toHaveBeenCalledWith(tx, 'o1', 'c1');
      expect(repository.appendStockLedger).toHaveBeenCalledWith(tx, expect.objectContaining({
        organizationId: 'c1', optionId: 'o1', type: 'RECEIVE',
        quantity: 5, unitCost: 100, totalCost: 500,
        optionName: 'Red', createdBy: 'user-1',
      }));
      expect(bundleStock.recomputeForComponent).toHaveBeenCalledWith('c1', 'o1', tx);
      expect(result.recomputedBundleOptionIds).toEqual(['bundle-A']);
      expect(result.transaction.type).toBe('RECEIVE');
    });

    it('unitCost defaults to 0', async () => {
      bind(10);
      repository.applyStockDelta.mockResolvedValue({ id: 'i1', optionId: 'o1', organizationId: 'c1' });
      repository.findOptionNameForLedger.mockResolvedValue(null);
      repository.appendStockLedger.mockResolvedValue({
        id: 'tx1', optionId: 'o1', type: 'RECEIVE', quantity: 5, unitCost: 0,
        createdAt: new Date(),
      });

      await service.receive('i1', { quantity: 5 }, 'c1', 'user-1');

      const call = repository.appendStockLedger.mock.calls[0][1];
      expect(call.unitCost).toBe(0);
      expect(call.totalCost).toBe(0);
      expect(call.optionName).toBeNull();
    });

    it('NotFound from repository propagates (cross-tenant guard inside lock)', async () => {
      bind(10);
      repository.runInventoryStockMutation.mockRejectedValue(new NotFoundException('Inventory not found'));
      await expect(service.receive('i1', { quantity: 5 }, 'c2', 'user-1'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('issue', () => {
    it('decrements stock; carries relatedId/relatedType', async () => {
      bind(10);
      repository.applyStockDelta.mockResolvedValue({ id: 'i1', optionId: 'o1', organizationId: 'c1' });
      repository.findOptionNameForLedger.mockResolvedValue(null);
      repository.appendStockLedger.mockResolvedValue({
        id: 'tx1', optionId: 'o1', type: 'ISSUE', quantity: 3, unitCost: 0,
        createdAt: new Date(),
      });

      await service.issue('i1', { quantity: 3, relatedId: 'order-1', relatedType: 'Order' }, 'c1', 'user-1');

      expect(repository.applyStockDelta).toHaveBeenCalledWith(tx, 'i1', -3, false, null);
      const ledger = repository.appendStockLedger.mock.calls[0][1];
      expect(ledger.type).toBe('ISSUE');
      expect(ledger.quantity).toBe(3); // absolute amount stored; direction implied by type
      expect(ledger.relatedId).toBe('order-1');
      expect(ledger.relatedType).toBe('Order');
    });

    it('insufficient stock → BadRequest, no writes', async () => {
      bind(2);
      await expect(service.issue('i1', { quantity: 5 }, 'c1', 'user-1'))
        .rejects.toThrow(BadRequestException);
      expect(repository.applyStockDelta).not.toHaveBeenCalled();
      expect(repository.appendStockLedger).not.toHaveBeenCalled();
    });

    it('does not bump lastRestockedAt', async () => {
      const existing = new Date('2024-01-01T00:00:00Z');
      bind(10, existing);
      repository.applyStockDelta.mockResolvedValue({ id: 'i1', optionId: 'o1', organizationId: 'c1' });
      repository.findOptionNameForLedger.mockResolvedValue(null);
      repository.appendStockLedger.mockResolvedValue({
        id: 'tx1', optionId: 'o1', type: 'ISSUE', quantity: 3, unitCost: 0, createdAt: new Date(),
      });

      await service.issue('i1', { quantity: 3 }, 'c1', 'user-1');

      expect(repository.applyStockDelta).toHaveBeenCalledWith(tx, 'i1', -3, false, existing);
    });
  });

  describe('adjust', () => {
    it('positive delta increments; signed quantity stored in ledger', async () => {
      bind(10);
      repository.applyStockDelta.mockResolvedValue({ id: 'i1', optionId: 'o1', organizationId: 'c1' });
      repository.findOptionNameForLedger.mockResolvedValue(null);
      repository.appendStockLedger.mockResolvedValue({
        id: 'tx1', optionId: 'o1', type: 'ADJUST', quantity: 4, unitCost: 0, createdAt: new Date(),
      });

      await service.adjust('i1', { delta: 4, reason: 'recount' }, 'c1', 'user-1');

      expect(repository.applyStockDelta).toHaveBeenCalledWith(tx, 'i1', 4, false, null);
      const ledger = repository.appendStockLedger.mock.calls[0][1];
      expect(ledger.type).toBe('ADJUST');
      expect(ledger.quantity).toBe(4);
      expect(ledger.note).toBe('recount');
    });

    it('negative delta stores signed quantity', async () => {
      bind(10);
      repository.applyStockDelta.mockResolvedValue({ id: 'i1', optionId: 'o1', organizationId: 'c1' });
      repository.findOptionNameForLedger.mockResolvedValue(null);
      repository.appendStockLedger.mockResolvedValue({
        id: 'tx1', optionId: 'o1', type: 'ADJUST', quantity: -4, unitCost: 0, createdAt: new Date(),
      });

      await service.adjust('i1', { delta: -4, reason: 'shrinkage' }, 'c1', 'user-1');

      const ledger = repository.appendStockLedger.mock.calls[0][1];
      expect(ledger.quantity).toBe(-4); // signed delta survives in the ledger
    });

    it('exceeding stock → BadRequest', async () => {
      bind(3);
      await expect(service.adjust('i1', { delta: -5, reason: 'shrinkage' }, 'c1', 'user-1'))
        .rejects.toThrow(BadRequestException);
      expect(repository.applyStockDelta).not.toHaveBeenCalled();
    });
  });

  describe('Rocket inventory events', () => {
    it('reserves Rocket stock without stock transaction or bundle fan-out', async () => {
      bind(10, null, 0);
      repository.findRocketLedgerBySource.mockResolvedValue(null);
      repository.applyStockAndReservedDeltas.mockResolvedValue({
        id: 'i1',
        optionId: 'o1',
        organizationId: 'c1',
        currentStock: 10,
        reservedStock: 4,
      });
      repository.appendRocketLedger.mockResolvedValue({ id: 'rocket-ledger-1' });

      const result = await service.applyRocketInventoryEvent({
        organizationId: 'c1',
        userId: 'user-1',
        inventoryId: 'i1',
        optionId: 'o1',
        eventType: 'reserve',
        quantity: 4,
        sourceActionId: 'rocket-confirm:PO-1:8800:4',
        sourceType: 'rocket_confirm',
        sourceRef: 'PO-1/8800',
      });

      expect(result).toEqual({ ledgerId: 'rocket-ledger-1', alreadyApplied: false });
      expect(repository.applyStockAndReservedDeltas).toHaveBeenCalledWith(tx, 'i1', {
        reservedDelta: 4,
        stockDelta: 0,
        overReservationQty: 0,
      });
      expect(repository.appendStockLedger).not.toHaveBeenCalled();
      expect(bundleStock.recomputeForComponent).not.toHaveBeenCalled();
      expect(repository.appendRocketLedger).toHaveBeenCalledWith(tx, expect.objectContaining({
        eventType: 'reserve',
        quantity: 4,
        reservedDelta: 4,
        stockDelta: 0,
        sourceActionId: 'rocket-confirm:PO-1:8800:4',
      }));
    });

    it('issues Rocket shipment by reducing current and reserved stock', async () => {
      bind(10, null, 5);
      repository.findRocketLedgerBySource.mockResolvedValue(null);
      repository.applyStockAndReservedDeltas.mockResolvedValue({
        id: 'i1',
        optionId: 'o1',
        organizationId: 'c1',
        currentStock: 7,
        reservedStock: 2,
      });
      repository.findOptionNameForLedger.mockResolvedValue('Red');
      repository.appendStockLedger.mockResolvedValue({
        id: 'stock-tx-1',
        optionId: 'o1',
        type: 'ISSUE',
        quantity: 3,
        unitCost: 0,
        createdAt: new Date(),
      });
      repository.appendRocketLedger.mockResolvedValue({ id: 'rocket-ledger-2' });
      bundleStock.recomputeForComponent.mockResolvedValue(['bundle-A']);

      await service.applyRocketInventoryEvent({
        organizationId: 'c1',
        userId: 'user-1',
        inventoryId: 'i1',
        optionId: 'o1',
        eventType: 'issue',
        quantity: 3,
        sourceActionId: 'rocket-shipment:SHIP-1',
        sourceType: 'rocket_shipment',
        sourceRef: 'SHIP-1',
      });

      expect(repository.applyStockAndReservedDeltas).toHaveBeenCalledWith(tx, 'i1', {
        reservedDelta: -3,
        stockDelta: -3,
        overReservationQty: 0,
      });
      expect(repository.appendStockLedger).toHaveBeenCalledWith(tx, expect.objectContaining({
        type: 'ISSUE',
        quantity: 3,
        relatedId: 'rocket-shipment:SHIP-1',
        relatedType: 'rocket_shipment',
      }));
      expect(bundleStock.recomputeForComponent).toHaveBeenCalledWith('c1', 'o1', tx);
    });

    it('returns alreadyApplied when source action was already recorded', async () => {
      bind(10, null, 0);
      repository.findRocketLedgerBySource.mockResolvedValue({
        id: 'existing-ledger',
        inventoryId: 'i1',
        optionId: 'o1',
        quantity: 4,
      });

      const result = await service.applyRocketInventoryEvent({
        organizationId: 'c1',
        userId: 'user-1',
        inventoryId: 'i1',
        optionId: 'o1',
        eventType: 'reserve',
        quantity: 4,
        sourceActionId: 'rocket-confirm:PO-1:8800:4',
        sourceType: 'rocket_confirm',
        sourceRef: 'PO-1/8800',
      });

      expect(result).toEqual({ ledgerId: 'existing-ledger', alreadyApplied: true });
      expect(repository.runInventoryStockMutation).not.toHaveBeenCalled();
      expect(repository.appendRocketLedger).not.toHaveBeenCalled();
    });

    it('rejects a repeated source action with a different quantity', async () => {
      bind(10, null, 0);
      repository.findRocketLedgerBySource.mockResolvedValue({
        id: 'existing-ledger',
        inventoryId: 'i1',
        optionId: 'o1',
        quantity: 3,
      });

      await expect(service.applyRocketInventoryEvent({
        organizationId: 'c1',
        userId: 'user-1',
        inventoryId: 'i1',
        optionId: 'o1',
        eventType: 'reserve',
        quantity: 4,
        sourceActionId: 'rocket-confirm:PO-1:SKU-1:8800',
        sourceType: 'rocket_confirm',
        sourceRef: 'PO-1/SKU-1/8800',
      })).rejects.toThrow(BadRequestException);

      expect(repository.runInventoryStockMutation).not.toHaveBeenCalled();
      expect(repository.appendRocketLedger).not.toHaveBeenCalled();
    });

    it('requires override reason when issuing over open reservation', async () => {
      bind(10, null, 2);
      repository.findRocketLedgerBySource.mockResolvedValue(null);

      await expect(service.applyRocketInventoryEvent({
        organizationId: 'c1',
        userId: 'user-1',
        inventoryId: 'i1',
        optionId: 'o1',
        eventType: 'issue',
        quantity: 3,
        sourceActionId: 'rocket-shipment:SHIP-2',
        sourceType: 'rocket_shipment',
        sourceRef: 'SHIP-2',
      })).rejects.toThrow(BadRequestException);

      expect(repository.applyStockAndReservedDeltas).not.toHaveBeenCalled();
      expect(repository.appendRocketLedger).not.toHaveBeenCalled();
    });
  });
});
