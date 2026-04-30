import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PickingService } from '../picking.service';
import type { PickingRepositoryPort } from '../../port/out/picking.repository.port';
import type { ConfirmedOrdersPort } from '../../port/out/confirmed-orders.port';

function makeRepository() {
  return {
    listPickingLists: vi.fn().mockResolvedValue([]),
    createPickingList: vi.fn(),
    findPickingListOwnerId: vi.fn(),
    findPickingItemInList: vi.fn(),
    updatePickingItem: vi.fn(),
    countPickedItems: vi.fn().mockResolvedValue(0),
    writePickedCount: vi.fn().mockResolvedValue(undefined),
    completePickingList: vi.fn(),
  } satisfies Record<keyof PickingRepositoryPort, ReturnType<typeof vi.fn>>;
}

function makeConfirmedOrders() {
  return {
    findConfirmedOrdersForPicking: vi.fn().mockResolvedValue([]),
  } satisfies Record<keyof ConfirmedOrdersPort, ReturnType<typeof vi.fn>>;
}

describe('PickingService — confirmed orders → picking → verification', () => {
  let service: PickingService;
  let repository: ReturnType<typeof makeRepository>;
  let confirmedOrders: ReturnType<typeof makeConfirmedOrders>;

  beforeEach(() => {
    repository = makeRepository();
    confirmedOrders = makeConfirmedOrders();
    service = new PickingService(
      repository as unknown as PickingRepositoryPort,
      confirmedOrders as unknown as ConfirmedOrdersPort,
    );
  });

  describe('generate', () => {
    it('throws BadRequest when no confirmed orders', async () => {
      confirmedOrders.findConfirmedOrdersForPicking.mockResolvedValue([]);
      await expect(service.generate('c-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createPickingList).not.toHaveBeenCalled();
    });

    it('creates a picking list from confirmed orders', async () => {
      confirmedOrders.findConfirmedOrdersForPicking.mockResolvedValue([
        {
          id: 'order-1',
          lineItems: [
            {
              optionId: 'opt-1',
              productName: 'Widget',
              sku: 'WDG-001',
              quantity: 2,
              option: { sku: 'WDG-001' },
            },
          ],
        },
        {
          id: 'order-2',
          lineItems: [
            {
              optionId: 'opt-2',
              productName: 'Gadget',
              sku: 'GDG-001',
              quantity: 5,
              option: { sku: 'GDG-001' },
            },
          ],
        },
      ]);
      const created = { id: 'pl-1', listNumber: 'PK-1', totalItems: 2, items: [] };
      repository.createPickingList.mockResolvedValue(created);

      const result = await service.generate('c-1');

      expect(confirmedOrders.findConfirmedOrdersForPicking).toHaveBeenCalledWith('c-1');
      expect(repository.createPickingList).toHaveBeenCalledWith(
        'c-1',
        expect.stringMatching(/^PK-\d+$/),
        [
          expect.objectContaining({ orderId: 'order-1', optionId: 'opt-1', quantity: 2, sku: 'WDG-001' }),
          expect.objectContaining({ orderId: 'order-2', optionId: 'opt-2', quantity: 5, sku: 'GDG-001' }),
        ],
      );
      expect(result).toBe(created);
    });

    it('skips line items without optionId; throws BadRequest when all skipped', async () => {
      confirmedOrders.findConfirmedOrdersForPicking.mockResolvedValue([
        {
          id: 'order-1',
          lineItems: [
            { optionId: null, productName: 'Mystery', sku: null, quantity: 1, option: null },
          ],
        },
      ]);
      await expect(service.generate('c-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createPickingList).not.toHaveBeenCalled();
    });
  });

  describe('updateItem', () => {
    it('records pickedAt and updates picked count', async () => {
      repository.findPickingListOwnerId.mockResolvedValue({ id: 'pl-1' });
      repository.findPickingItemInList.mockResolvedValue({ id: 'it-1', pickingListId: 'pl-1' });
      repository.updatePickingItem.mockResolvedValue({ id: 'it-1', isPicked: true });
      repository.countPickedItems.mockResolvedValue(3);

      await service.updateItem('pl-1', 'it-1', 'c-1', { isPicked: true });

      expect(repository.findPickingListOwnerId).toHaveBeenCalledWith('pl-1', 'c-1');
      expect(repository.updatePickingItem).toHaveBeenCalledWith(
        'it-1',
        expect.objectContaining({ isPicked: true, pickedAt: expect.any(Date) }),
      );
      expect(repository.writePickedCount).toHaveBeenCalledWith('pl-1', 3);
    });

    it('records verifiedAt when isVerified=true', async () => {
      repository.findPickingListOwnerId.mockResolvedValue({ id: 'pl-1' });
      repository.findPickingItemInList.mockResolvedValue({ id: 'it-1', pickingListId: 'pl-1' });
      repository.updatePickingItem.mockResolvedValue({ id: 'it-1', isVerified: true });

      await service.updateItem('pl-1', 'it-1', 'c-1', { isVerified: true });

      expect(repository.updatePickingItem).toHaveBeenCalledWith(
        'it-1',
        expect.objectContaining({ isVerified: true, verifiedAt: expect.any(Date) }),
      );
    });

    it('throws BadRequest when item not in list', async () => {
      repository.findPickingListOwnerId.mockResolvedValue({ id: 'pl-1' });
      repository.findPickingItemInList.mockResolvedValue(null);

      await expect(
        service.updateItem('pl-1', 'it-x', 'c-1', { isPicked: true }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.updatePickingItem).not.toHaveBeenCalled();
    });

    it('throws NotFound on cross-tenant list (IDOR guard)', async () => {
      repository.findPickingListOwnerId.mockResolvedValue(null);

      await expect(
        service.updateItem('pl-1', 'it-1', 'c-1', { isPicked: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.findPickingItemInList).not.toHaveBeenCalled();
      expect(repository.updatePickingItem).not.toHaveBeenCalled();
    });
  });

  describe('complete', () => {
    it('delegates to repository with companyId', async () => {
      repository.completePickingList.mockResolvedValue({ id: 'pl-1', status: 'completed' });
      await service.complete('pl-1', 'c-1');
      expect(repository.completePickingList).toHaveBeenCalledWith('pl-1', 'c-1');
    });

    it('propagates NotFound from repository when list missing or cross-tenant', async () => {
      repository.completePickingList.mockRejectedValue(
        new NotFoundException('피킹 리스트를 찾을 수 없습니다'),
      );
      await expect(service.complete('pl-1', 'c-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
