import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcurementService } from '../application/service/procurement.service';
import { BadRequestException } from '@nestjs/common';

function makePrisma() {
  return {
    purchaseOrder: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
  };
}

const MOCK_ORDER_DRAFT = {
  id: 'po-1',
  companyId: 'company-1',
  supplierName: 'Test Supplier',
  supplierId: null,
  status: 'draft',
  totalAmountCny: 500,
  orderDate: new Date(),
  expectedDeliveryDate: null,
  receivedAt: null,
};

describe('ProcurementService — PO status lifecycle', () => {
  let service: ProcurementService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ProcurementService(prisma as any);
  });

  it('create PO → prisma.purchaseOrder.create called with draft status', async () => {
    const created = { ...MOCK_ORDER_DRAFT, items: [], supplier: null };
    prisma.purchaseOrder.create.mockResolvedValue(created);

    const result = await service.create('company-1', {
      supplierName: 'Test Supplier',
      items: [{ productName: 'Widget', quantity: 10, unitPriceCny: 50 }],
    });

    expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 'company-1',
          supplierName: 'Test Supplier',
          status: 'draft',
          totalAmountCny: 500,
        }),
      }),
    );
    expect(result).toEqual(created);
  });

  it('updateStatus draft→pending → valid transition', async () => {
    prisma.purchaseOrder.findFirst
      .mockResolvedValueOnce({ ...MOCK_ORDER_DRAFT, status: 'draft' })
      .mockResolvedValueOnce({ ...MOCK_ORDER_DRAFT, status: 'pending', items: [], supplier: null });
    prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.updateStatus('company-1', 'po-1', 'pending');
    expect(prisma.purchaseOrder.findFirst).toHaveBeenCalledWith({ where: { id: 'po-1', companyId: 'company-1' } });
    expect(prisma.purchaseOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'po-1', companyId: 'company-1' },
        data: expect.objectContaining({ status: 'pending' }),
      }),
    );
    expect((result as any).status).toBe('pending');
  });

  it('updateStatus pending→ordered → valid transition', async () => {
    prisma.purchaseOrder.findFirst
      .mockResolvedValueOnce({ ...MOCK_ORDER_DRAFT, status: 'pending' })
      .mockResolvedValueOnce({ ...MOCK_ORDER_DRAFT, status: 'ordered', items: [], supplier: null });
    prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });

    await service.updateStatus('company-1', 'po-1', 'ordered');
    expect(prisma.purchaseOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ordered' }) }),
    );
  });

  it('updateStatus ordered→shipped → valid transition', async () => {
    prisma.purchaseOrder.findFirst
      .mockResolvedValueOnce({ ...MOCK_ORDER_DRAFT, status: 'ordered' })
      .mockResolvedValueOnce({ ...MOCK_ORDER_DRAFT, status: 'shipped', items: [], supplier: null });
    prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });

    await service.updateStatus('company-1', 'po-1', 'shipped');
    expect(prisma.purchaseOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'shipped' }) }),
    );
  });

  it('updateStatus shipped→received → valid transition, sets receivedAt', async () => {
    prisma.purchaseOrder.findFirst
      .mockResolvedValueOnce({ ...MOCK_ORDER_DRAFT, status: 'shipped' })
      .mockResolvedValueOnce({ ...MOCK_ORDER_DRAFT, status: 'received', items: [], supplier: null });
    prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });

    await service.updateStatus('company-1', 'po-1', 'received');
    expect(prisma.purchaseOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'received', receivedAt: expect.any(Date) }),
      }),
    );
  });

  it('invalid transition draft→received → throws BadRequestException', async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue({ ...MOCK_ORDER_DRAFT, status: 'draft' });

    await expect(service.updateStatus('company-1', 'po-1', 'received')).rejects.toThrow(BadRequestException);
    expect(prisma.purchaseOrder.updateMany).not.toHaveBeenCalled();
  });

  it('updateStatus wrong company → not found, no mutation', async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue(null);
    prisma.purchaseOrder.findUnique.mockResolvedValue({ ...MOCK_ORDER_DRAFT, companyId: 'company-2', status: 'draft' });

    await expect(service.updateStatus('company-1', 'po-1', 'pending')).rejects.toThrow(BadRequestException);

    expect(prisma.purchaseOrder.updateMany).not.toHaveBeenCalled();
    expect(prisma.purchaseOrder.update).not.toHaveBeenCalled();
  });

  it('delete draft PO → ok', async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue({ ...MOCK_ORDER_DRAFT, status: 'draft' });
    prisma.purchaseOrder.deleteMany.mockResolvedValue({ count: 1 });

    await service.delete('company-1', 'po-1');
    expect(prisma.purchaseOrder.deleteMany).toHaveBeenCalledWith({ where: { id: 'po-1', companyId: 'company-1' } });
  });

  it('delete non-draft PO → throws BadRequestException', async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue({ ...MOCK_ORDER_DRAFT, status: 'shipped' });

    await expect(service.delete('company-1', 'po-1')).rejects.toThrow(BadRequestException);
    expect(prisma.purchaseOrder.deleteMany).not.toHaveBeenCalled();
  });

  it('delete wrong company → not found, no mutation', async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue(null);
    prisma.purchaseOrder.findUnique.mockResolvedValue({ ...MOCK_ORDER_DRAFT, companyId: 'company-2', status: 'draft' });

    await expect(service.delete('company-1', 'po-1')).rejects.toThrow(BadRequestException);

    expect(prisma.purchaseOrder.deleteMany).not.toHaveBeenCalled();
    expect(prisma.purchaseOrder.delete).not.toHaveBeenCalled();
  });
});
