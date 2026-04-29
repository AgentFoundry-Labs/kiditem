import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SupplierPaymentsService } from '../supplier-payments.service';

/**
 * Tenant boundary regression — Phase 3 finance rewrite.
 *
 * Coverage:
 *   findAll  — companyId in WHERE with supplier include; status filter composes
 *   create   — companyId in INSERT; supplier FK supplied from DTO
 *   update   — scoped updateMany (id + companyId);
 *              count === 0 → BadRequestException (cross-company denial);
 *              re-read uses scoped findFirstOrThrow (id + companyId)
 *
 * Limitation: mock Prisma cannot prove DB-level isolation. The tests assert
 * call-shape (WHERE includes companyId) and behavior (count===0 → throw).
 * Runtime DB isolation is enforced by the surrounding scanner gates
 * (`check:tenant-scope`, `check:idor`).
 */

const COMPANY_A = '00000000-0000-4000-8000-00000000000a';
const COMPANY_B = '00000000-0000-4000-8000-00000000000b';
const ROW_ID = '44444444-4444-4444-8444-444444444444';
const SUPPLIER_ID = '55555555-5555-4555-8555-555555555555';

function makePrisma() {
  return {
    supplierPayment: {
      findMany: vi.fn(),
      findFirstOrThrow: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
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
    it('always scopes by companyId with supplier include', async () => {
      prisma.supplierPayment.findMany.mockResolvedValue([]);
      await service.findAll(COMPANY_A);
      expect(prisma.supplierPayment.findMany).toHaveBeenCalledWith({
        where: { companyId: COMPANY_A },
        include: { supplier: true },
        orderBy: { dueDate: 'asc' },
      });
    });

    it('composes status filter without dropping companyId', async () => {
      prisma.supplierPayment.findMany.mockResolvedValue([]);
      await service.findAll(COMPANY_A, 'unpaid');
      expect(prisma.supplierPayment.findMany).toHaveBeenCalledWith({
        where: { companyId: COMPANY_A, status: 'unpaid' },
        include: { supplier: true },
        orderBy: { dueDate: 'asc' },
      });
    });
  });

  describe('create', () => {
    it('writes companyId from argument; supplierId comes from DTO', async () => {
      prisma.supplierPayment.create.mockResolvedValue({ id: ROW_ID });
      await service.create(COMPANY_A, {
        supplierId: SUPPLIER_ID,
        amount: 250_000,
        dueDate: '2026-05-30',
      });
      const callArg = prisma.supplierPayment.create.mock.calls[0][0];
      expect(callArg.data.companyId).toBe(COMPANY_A);
      expect(callArg.data.supplierId).toBe(SUPPLIER_ID);
      expect(callArg.data.amount).toBe(250_000);
      expect(callArg.include).toEqual({ supplier: true });
    });
  });

  describe('update', () => {
    it('updates via scoped updateMany (id + companyId) and re-reads scoped', async () => {
      prisma.supplierPayment.updateMany.mockResolvedValue({ count: 1 });
      prisma.supplierPayment.findFirstOrThrow.mockResolvedValue({
        id: ROW_ID,
        companyId: COMPANY_A,
        status: 'paid',
        paidAmount: 250_000,
      });

      const out = await service.update(ROW_ID, COMPANY_A, {
        paidAmount: 250_000,
        status: 'paid',
        paidDate: '2026-04-29',
      });

      const updateArg = prisma.supplierPayment.updateMany.mock.calls[0][0];
      expect(updateArg.where).toEqual({ id: ROW_ID, companyId: COMPANY_A });
      expect(updateArg.data).toMatchObject({
        paidAmount: 250_000,
        status: 'paid',
      });
      expect(updateArg.data.paidDate).toBeInstanceOf(Date);

      expect(prisma.supplierPayment.findFirstOrThrow).toHaveBeenCalledWith({
        where: { id: ROW_ID, companyId: COMPANY_A },
        include: { supplier: true },
      });
      expect(out.status).toBe('paid');
    });

    it('cross-company denial: throws and never re-reads when count === 0', async () => {
      // Caller is COMPANY_B targeting a row that belongs to COMPANY_A.
      // updateMany(WHERE id + companyId=B) matches 0 rows → service must reject
      // and must NOT issue a re-read (which would otherwise leak existence).
      prisma.supplierPayment.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update(ROW_ID, COMPANY_B, { status: 'paid' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.supplierPayment.updateMany).toHaveBeenCalledWith({
        where: { id: ROW_ID, companyId: COMPANY_B },
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
      expect(callArg.where).toEqual({ id: ROW_ID, companyId: COMPANY_A });
    });
  });
});
