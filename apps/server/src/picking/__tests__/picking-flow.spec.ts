import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PickingService } from '../picking.service';
import { BadRequestException } from '@nestjs/common';

function makePrisma() {
  return {
    order: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    pickingList: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    pickingItem: {
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
  };
}

describe('PickingService — 확정 주문 → 피킹 → 검수 상태 전이', () => {
  let service: PickingService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new PickingService(prisma as any);
  });

  describe('generate', () => {
    it('status=confirmed 주문이 없으면 BadRequestException 을 던진다', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await expect(service.generate('c-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.pickingList.create).not.toHaveBeenCalled();
    });

    it('confirmed 주문들로 PickingList + Item 들을 생성한다', async () => {
      prisma.order.findMany.mockResolvedValue([
        {
          id: 'order-1',
          productId: 'prod-1',
          productName: 'Widget',
          quantity: 2,
          product: { sku: 'WDG-001' },
        },
        {
          id: 'order-2',
          productId: 'prod-2',
          productName: 'Gadget',
          quantity: 5,
          product: { sku: 'GDG-001' },
        },
      ]);
      const created = { id: 'pl-1', listNumber: 'PK-1', totalItems: 2, items: [] };
      prisma.pickingList.create.mockResolvedValue(created);

      const result = await service.generate('c-1');

      expect(prisma.order.findMany).toHaveBeenCalledWith({
        where: { companyId: 'c-1', status: 'confirmed' },
        include: { product: true },
      });
      expect(prisma.pickingList.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'c-1',
            totalItems: 2,
            items: {
              create: [
                expect.objectContaining({ orderId: 'order-1', productId: 'prod-1', quantity: 2, sku: 'WDG-001' }),
                expect.objectContaining({ orderId: 'order-2', productId: 'prod-2', quantity: 5, sku: 'GDG-001' }),
              ],
            },
          }),
        }),
      );
      expect(result).toBe(created);
    });
  });

  describe('updateItem', () => {
    it('isPicked=true 설정 시 pickedAt 타임스탬프 기록 + 집계 갱신', async () => {
      prisma.pickingItem.findFirst.mockResolvedValue({ id: 'it-1', pickingListId: 'pl-1' });
      prisma.pickingItem.update.mockResolvedValue({ id: 'it-1', isPicked: true });
      prisma.pickingItem.count.mockResolvedValue(3);

      await service.updateItem('pl-1', 'it-1', { isPicked: true });

      expect(prisma.pickingItem.update).toHaveBeenCalledWith({
        where: { id: 'it-1' },
        data: expect.objectContaining({ isPicked: true, pickedAt: expect.any(Date) }),
      });
      expect(prisma.pickingList.update).toHaveBeenCalledWith({
        where: { id: 'pl-1' },
        data: { pickedItems: 3 },
      });
    });

    it('isVerified=true 설정 시 verifiedAt 기록', async () => {
      prisma.pickingItem.findFirst.mockResolvedValue({ id: 'it-1', pickingListId: 'pl-1' });
      prisma.pickingItem.update.mockResolvedValue({ id: 'it-1', isVerified: true });

      await service.updateItem('pl-1', 'it-1', { isVerified: true });

      expect(prisma.pickingItem.update).toHaveBeenCalledWith({
        where: { id: 'it-1' },
        data: expect.objectContaining({ isVerified: true, verifiedAt: expect.any(Date) }),
      });
    });

    it('존재하지 않는 아이템이면 BadRequestException', async () => {
      prisma.pickingItem.findFirst.mockResolvedValue(null);

      await expect(service.updateItem('pl-1', 'it-x', { isPicked: true })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.pickingItem.update).not.toHaveBeenCalled();
    });
  });

  describe('complete', () => {
    it('완료 처리 시 status=completed + completedAt 기록', async () => {
      prisma.pickingList.findUnique.mockResolvedValue({ id: 'pl-1', status: 'active' });
      prisma.pickingList.update.mockResolvedValue({ id: 'pl-1', status: 'completed' });

      await service.complete('pl-1');

      expect(prisma.pickingList.update).toHaveBeenCalledWith({
        where: { id: 'pl-1' },
        data: expect.objectContaining({ status: 'completed', completedAt: expect.any(Date) }),
        include: { items: true },
      });
    });

    it('리스트 없으면 BadRequestException', async () => {
      prisma.pickingList.findUnique.mockResolvedValue(null);

      await expect(service.complete('pl-x')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.pickingList.update).not.toHaveBeenCalled();
    });
  });
});
