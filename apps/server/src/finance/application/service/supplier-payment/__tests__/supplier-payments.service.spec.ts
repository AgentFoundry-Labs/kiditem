import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SupplierPaymentsService } from '../supplier-payments.service';

/**
 * Tenant boundary regression — Phase 3 finance rewrite.
 *
 * Coverage:
 *   findAll  — organizationId in WHERE with supplier include; status filter composes
 *   create   — supplier/purchaseOrder FK pre-checks are organization-scoped;
 *              organizationId in INSERT; supplier FK supplied from DTO
 *   update   — scoped updateMany (id + organizationId);
 *              count === 0 → BadRequestException (cross-organization denial);
 *              re-read uses scoped findFirstOrThrow (id + organizationId)
 *
 * Limitation: mock Prisma cannot prove DB-level isolation. The tests assert
 * call-shape (WHERE includes organizationId) and behavior (count===0 → throw).
 * Runtime DB isolation is enforced by the surrounding scanner gates
 * (`check:tenant-scope`, `check:idor`).
 */

const COMPANY_A = '00000000-0000-4000-8000-00000000000a';
const COMPANY_B = '00000000-0000-4000-8000-00000000000b';
const ROW_ID = '44444444-4444-4444-8444-444444444444';
const SUPPLIER_ID = '55555555-5555-4555-8555-555555555555';
const PURCHASE_ORDER_ID = '66666666-6666-4666-8666-666666666666';

function makePrisma() {
  return {
    supplierPayment: {
      findMany: vi.fn(),
      findFirstOrThrow: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    supplier: {
      findFirst: vi.fn(),
    },
    purchaseOrder: {
      findFirst: vi.fn(),
    },
  };
}

describe('SupplierPaymentsService', () => {
  let service: SupplierPaymentsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new SupplierPaymentsService(prisma as never);
  });

  describe('findAll', () => {
    it('always scopes by organizationId with supplier include', async () => {
      prisma.supplierPayment.findMany.mockResolvedValue([]);
      await service.findAll(COMPANY_A);
      expect(prisma.supplierPayment.findMany).toHaveBeenCalledWith({
        where: { organizationId: COMPANY_A },
        include: { supplier: true },
        orderBy: { dueDate: 'asc' },
      });
    });

    it('composes status filter without dropping organizationId', async () => {
      prisma.supplierPayment.findMany.mockResolvedValue([]);
      await service.findAll(COMPANY_A, 'unpaid');
      expect(prisma.supplierPayment.findMany).toHaveBeenCalledWith({
        where: { organizationId: COMPANY_A, status: 'unpaid' },
        include: { supplier: true },
        orderBy: { dueDate: 'asc' },
      });
    });
  });

  describe('getReport', () => {
    it('returns official payment summary, status counts, and supplier settlement rows', async () => {
      prisma.supplierPayment.findMany.mockResolvedValue([
        {
          id: 'pay-1',
          supplierId: SUPPLIER_ID,
          supplierName: null,
          amount: 100_000,
          paidAmount: 40_000,
          status: 'partial',
          dueDate: null,
          paidDate: null,
          purchaseOrderId: null,
          notes: null,
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          supplier: { id: SUPPLIER_ID, name: 'Supplier A' },
        },
        {
          id: 'pay-2',
          supplierId: SUPPLIER_ID,
          supplierName: null,
          amount: 50_000,
          paidAmount: 50_000,
          status: 'paid',
          dueDate: null,
          paidDate: null,
          purchaseOrderId: null,
          notes: null,
          createdAt: new Date('2026-04-02T00:00:00.000Z'),
          supplier: { id: SUPPLIER_ID, name: 'Supplier A' },
        },
      ]);

      const report = await service.getReport(COMPANY_A);

      expect(report.summary).toEqual({
        totalAmount: 150_000,
        totalPaid: 90_000,
        totalUnpaid: 60_000,
      });
      expect(report.counts).toEqual({ all: 2, unpaid: 0, partial: 1, paid: 1 });
      expect(report.settlements).toEqual([
        {
          supplierId: SUPPLIER_ID,
          supplierName: 'Supplier A',
          totalOrdered: 150_000,
          totalPaid: 90_000,
          unpaid: 60_000,
          orderCount: 2,
          receivedCount: 1,
          status: 'partial',
        },
      ]);
      expect(report.items[0].supplierName).toBe('Supplier A');
    });
  });

  describe('create', () => {
    it('writes organizationId from argument; supplierId comes from DTO', async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: SUPPLIER_ID });
      prisma.supplierPayment.create.mockResolvedValue({ id: ROW_ID });
      await service.create(COMPANY_A, {
        supplierId: SUPPLIER_ID,
        amount: 250_000,
        dueDate: '2026-05-30',
      });
      expect(prisma.supplier.findFirst).toHaveBeenCalledWith({
        where: { id: SUPPLIER_ID, organizationId: COMPANY_A },
        select: { id: true },
      });
      expect(prisma.purchaseOrder.findFirst).not.toHaveBeenCalled();
      const callArg = prisma.supplierPayment.create.mock.calls[0][0];
      expect(callArg.data.organizationId).toBe(COMPANY_A);
      expect(callArg.data.supplierId).toBe(SUPPLIER_ID);
      expect(callArg.data.amount).toBe(250_000);
      expect(callArg.include).toEqual({ supplier: true });
    });

    it('scopes purchaseOrderId before inserting the payment', async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: SUPPLIER_ID });
      prisma.purchaseOrder.findFirst.mockResolvedValue({ id: PURCHASE_ORDER_ID });
      prisma.supplierPayment.create.mockResolvedValue({ id: ROW_ID });

      await service.create(COMPANY_A, {
        supplierId: SUPPLIER_ID,
        purchaseOrderId: PURCHASE_ORDER_ID,
        amount: 250_000,
      });

      expect(prisma.purchaseOrder.findFirst).toHaveBeenCalledWith({
        where: { id: PURCHASE_ORDER_ID, organizationId: COMPANY_A },
        select: { id: true },
      });
      expect(prisma.supplierPayment.create).toHaveBeenCalled();
    });

    it('cross-organization denial: rejects when supplierId is not owned by caller organization', async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_B, {
          supplierId: SUPPLIER_ID,
          amount: 250_000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.supplier.findFirst).toHaveBeenCalledWith({
        where: { id: SUPPLIER_ID, organizationId: COMPANY_B },
        select: { id: true },
      });
      expect(prisma.purchaseOrder.findFirst).not.toHaveBeenCalled();
      expect(prisma.supplierPayment.create).not.toHaveBeenCalled();
    });

    it('cross-organization denial: rejects when purchaseOrderId is not owned by caller organization', async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: SUPPLIER_ID });
      prisma.purchaseOrder.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_B, {
          supplierId: SUPPLIER_ID,
          purchaseOrderId: PURCHASE_ORDER_ID,
          amount: 250_000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.purchaseOrder.findFirst).toHaveBeenCalledWith({
        where: { id: PURCHASE_ORDER_ID, organizationId: COMPANY_B },
        select: { id: true },
      });
      expect(prisma.supplierPayment.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates via scoped updateMany (id + organizationId) and re-reads scoped', async () => {
      prisma.supplierPayment.updateMany.mockResolvedValue({ count: 1 });
      prisma.supplierPayment.findFirstOrThrow.mockResolvedValue({
        id: ROW_ID,
        organizationId: COMPANY_A,
        status: 'paid',
        paidAmount: 250_000,
      });

      const out = await service.update(ROW_ID, COMPANY_A, {
        paidAmount: 250_000,
        status: 'paid',
        paidDate: '2026-04-29',
      });

      const updateArg = prisma.supplierPayment.updateMany.mock.calls[0][0];
      expect(updateArg.where).toEqual({ id: ROW_ID, organizationId: COMPANY_A });
      expect(updateArg.data).toMatchObject({
        paidAmount: 250_000,
        status: 'paid',
      });
      expect(updateArg.data.paidDate).toBeInstanceOf(Date);

      expect(prisma.supplierPayment.findFirstOrThrow).toHaveBeenCalledWith({
        where: { id: ROW_ID, organizationId: COMPANY_A },
        include: { supplier: true },
      });
      expect(out.status).toBe('paid');
    });

    it('cross-organization denial: throws and never re-reads when count === 0', async () => {
      // Caller is COMPANY_B targeting a row that belongs to COMPANY_A.
      // updateMany(WHERE id + organizationId=B) matches 0 rows → service must reject
      // and must NOT issue a re-read (which would otherwise leak existence).
      prisma.supplierPayment.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update(ROW_ID, COMPANY_B, { status: 'paid' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.supplierPayment.updateMany).toHaveBeenCalledWith({
        where: { id: ROW_ID, organizationId: COMPANY_B },
        data: { status: 'paid' },
      });
      expect(prisma.supplierPayment.findFirstOrThrow).not.toHaveBeenCalled();
    });

    it('builds partial data set when only some optional fields are provided', async () => {
      prisma.supplierPayment.updateMany.mockResolvedValue({ count: 1 });
      prisma.supplierPayment.findFirstOrThrow.mockResolvedValue({ id: ROW_ID });
      await service.update(ROW_ID, COMPANY_A, { notes: 'partial update only' });
      const callArg = prisma.supplierPayment.updateMany.mock.calls[0][0];
      expect(callArg.data).toEqual({ notes: 'partial update only' });
      expect(callArg.where).toEqual({ id: ROW_ID, organizationId: COMPANY_A });
    });
  });
});
