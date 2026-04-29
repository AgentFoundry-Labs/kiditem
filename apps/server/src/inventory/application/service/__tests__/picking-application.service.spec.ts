import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PickingApplicationService } from '../picking-application.service';
import type { PickingPersistence } from '../../../adapter/out/prisma/picking.persistence';

function makePersistence() {
  return {
    listPickingLists: vi.fn().mockResolvedValue([]),
    findConfirmedOrdersForPicking: vi.fn().mockResolvedValue([]),
    createPickingList: vi.fn(),
    findPickingListOwnerId: vi.fn(),
    findPickingItemInList: vi.fn(),
    updatePickingItem: vi.fn(),
    countPickedItems: vi.fn().mockResolvedValue(0),
    writePickedCount: vi.fn().mockResolvedValue(undefined),
    completePickingList: vi.fn(),
  } satisfies Record<keyof PickingPersistence, ReturnType<typeof vi.fn>>;
}

describe('PickingApplicationService — confirmed orders → picking → verification', () => {
  let service: PickingApplicationService;
  let persistence: ReturnType<typeof makePersistence>;

  beforeEach(() => {
    persistence = makePersistence();
    service = new PickingApplicationService(persistence as unknown as PickingPersistence);
  });

  describe('generate', () => {
    it('throws BadRequest when no confirmed orders', async () => {
      persistence.findConfirmedOrdersForPicking.mockResolvedValue([]);
      await expect(service.generate('c-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(persistence.createPickingList).not.toHaveBeenCalled();
    });

    it('creates a picking list from confirmed orders', async () => {
      persistence.findConfirmedOrdersForPicking.mockResolvedValue([
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
      persistence.createPickingList.mockResolvedValue(created);

      const result = await service.generate('c-1');

      expect(persistence.findConfirmedOrdersForPicking).toHaveBeenCalledWith('c-1');
      expect(persistence.createPickingList).toHaveBeenCalledWith(
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
      persistence.findConfirmedOrdersForPicking.mockResolvedValue([
        {
          id: 'order-1',
          lineItems: [
            { optionId: null, productName: 'Mystery', sku: null, quantity: 1, option: null },
          ],
        },
      ]);
      await expect(service.generate('c-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(persistence.createPickingList).not.toHaveBeenCalled();
    });
  });

  describe('updateItem', () => {
    it('records pickedAt and updates picked count', async () => {
      persistence.findPickingListOwnerId.mockResolvedValue({ id: 'pl-1' });
      persistence.findPickingItemInList.mockResolvedValue({ id: 'it-1', pickingListId: 'pl-1' });
      persistence.updatePickingItem.mockResolvedValue({ id: 'it-1', isPicked: true });
      persistence.countPickedItems.mockResolvedValue(3);

      await service.updateItem('pl-1', 'it-1', 'c-1', { isPicked: true });

      expect(persistence.findPickingListOwnerId).toHaveBeenCalledWith('pl-1', 'c-1');
      expect(persistence.updatePickingItem).toHaveBeenCalledWith(
        'it-1',
        expect.objectContaining({ isPicked: true, pickedAt: expect.any(Date) }),
      );
      expect(persistence.writePickedCount).toHaveBeenCalledWith('pl-1', 3);
    });

    it('records verifiedAt when isVerified=true', async () => {
      persistence.findPickingListOwnerId.mockResolvedValue({ id: 'pl-1' });
      persistence.findPickingItemInList.mockResolvedValue({ id: 'it-1', pickingListId: 'pl-1' });
      persistence.updatePickingItem.mockResolvedValue({ id: 'it-1', isVerified: true });

      await service.updateItem('pl-1', 'it-1', 'c-1', { isVerified: true });

      expect(persistence.updatePickingItem).toHaveBeenCalledWith(
        'it-1',
        expect.objectContaining({ isVerified: true, verifiedAt: expect.any(Date) }),
      );
    });

    it('throws BadRequest when item not in list', async () => {
      persistence.findPickingListOwnerId.mockResolvedValue({ id: 'pl-1' });
      persistence.findPickingItemInList.mockResolvedValue(null);

      await expect(
        service.updateItem('pl-1', 'it-x', 'c-1', { isPicked: true }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(persistence.updatePickingItem).not.toHaveBeenCalled();
    });

    it('throws NotFound on cross-tenant list (IDOR guard)', async () => {
      persistence.findPickingListOwnerId.mockResolvedValue(null);

      await expect(
        service.updateItem('pl-1', 'it-1', 'c-1', { isPicked: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(persistence.findPickingItemInList).not.toHaveBeenCalled();
      expect(persistence.updatePickingItem).not.toHaveBeenCalled();
    });
  });

  describe('complete', () => {
    it('delegates to persistence with companyId', async () => {
      persistence.completePickingList.mockResolvedValue({ id: 'pl-1', status: 'completed' });
      await service.complete('pl-1', 'c-1');
      expect(persistence.completePickingList).toHaveBeenCalledWith('pl-1', 'c-1');
    });

    it('propagates NotFound from persistence when list missing or cross-tenant', async () => {
      persistence.completePickingList.mockRejectedValue(
        new NotFoundException('피킹 리스트를 찾을 수 없습니다'),
      );
      await expect(service.complete('pl-1', 'c-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
