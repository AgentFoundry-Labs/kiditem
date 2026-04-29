import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ProcessingCostsService } from '../processing-costs.service';

/**
 * Tenant boundary regression — Phase 3 finance rewrite.
 *
 * Coverage:
 *   findAll  — companyId in WHERE; status filter composes
 *   create   — master FK pre-check is company-scoped; companyId + masterId in
 *              INSERT; totalCost = unitCost * quantity
 *   update   — scoped updateMany (id + companyId);
 *              count === 0 → BadRequestException (cross-company denial);
 *              re-read uses scoped findFirstOrThrow (id + companyId)
 *   monthly  — companyId in WHERE
 *
 * Limitation: mock Prisma cannot prove DB-level isolation. The tests assert
 * call-shape (WHERE includes companyId) and behavior (count===0 → throw).
 * Runtime DB isolation is enforced by the surrounding scanner gates
 * (`check:tenant-scope`, `check:idor`).
 */

const COMPANY_A = '00000000-0000-4000-8000-00000000000a';
const COMPANY_B = '00000000-0000-4000-8000-00000000000b';
const ROW_ID = '22222222-2222-4222-8222-222222222222';
const MASTER_ID = '33333333-3333-4333-8333-333333333333';

function makePrisma() {
  return {
    processingCost: {
      findMany: vi.fn(),
      findFirstOrThrow: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    masterProduct: {
      findFirst: vi.fn(),
    },
  };
}

describe('ProcessingCostsService', () => {
  let service: ProcessingCostsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ProcessingCostsService(prisma as never);
  });

  describe('findAll', () => {
    it('always scopes by companyId with master include', async () => {
      prisma.processingCost.findMany.mockResolvedValue([]);
      await service.findAll(COMPANY_A);
      expect(prisma.processingCost.findMany).toHaveBeenCalledWith({
        where: { companyId: COMPANY_A },
        include: { master: true },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('composes status filter without dropping companyId', async () => {
      prisma.processingCost.findMany.mockResolvedValue([]);
      await service.findAll(COMPANY_A, 'pending');
      expect(prisma.processingCost.findMany).toHaveBeenCalledWith({
        where: { companyId: COMPANY_A, status: 'pending' },
        include: { master: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('create', () => {
    it('writes companyId from argument and computes totalCost', async () => {
      prisma.masterProduct.findFirst.mockResolvedValue({ id: MASTER_ID });
      prisma.processingCost.create.mockResolvedValue({ id: ROW_ID });
      await service.create(COMPANY_A, {
        masterId: MASTER_ID,
        processType: 'packaging',
        unitCost: 1500,
        quantity: 10,
      });
      expect(prisma.masterProduct.findFirst).toHaveBeenCalledWith({
        where: { id: MASTER_ID, companyId: COMPANY_A, isDeleted: false },
        select: { id: true },
      });
      const callArg = prisma.processingCost.create.mock.calls[0][0];
      expect(callArg.data.companyId).toBe(COMPANY_A);
      expect(callArg.data.masterId).toBe(MASTER_ID);
      expect(callArg.data.totalCost).toBe(15_000);
      expect(callArg.include).toEqual({ master: true });
    });

    it('cross-company denial: rejects when masterId is not owned by caller company', async () => {
      prisma.masterProduct.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_B, {
          masterId: MASTER_ID,
          processType: 'packaging',
          unitCost: 1500,
          quantity: 10,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.masterProduct.findFirst).toHaveBeenCalledWith({
        where: { id: MASTER_ID, companyId: COMPANY_B, isDeleted: false },
        select: { id: true },
      });
      expect(prisma.processingCost.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates via scoped updateMany (id + companyId) and re-reads scoped', async () => {
      prisma.processingCost.updateMany.mockResolvedValue({ count: 1 });
      prisma.processingCost.findFirstOrThrow.mockResolvedValue({
        id: ROW_ID,
        companyId: COMPANY_A,
        status: 'completed',
      });

      const out = await service.update(ROW_ID, COMPANY_A, { status: 'completed' });

      expect(prisma.processingCost.updateMany).toHaveBeenCalledWith({
        where: { id: ROW_ID, companyId: COMPANY_A },
        data: { status: 'completed' },
      });
      expect(prisma.processingCost.findFirstOrThrow).toHaveBeenCalledWith({
        where: { id: ROW_ID, companyId: COMPANY_A },
        include: { master: true },
      });
      expect(out.status).toBe('completed');
    });

    it('cross-company denial: throws and never re-reads when count === 0', async () => {
      // Caller is COMPANY_B targeting a row that belongs to COMPANY_A.
      // updateMany(WHERE id + companyId=B) matches 0 rows → service must reject
      // and must NOT issue a re-read (which would otherwise leak existence).
      prisma.processingCost.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update(ROW_ID, COMPANY_B, { status: 'completed' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.processingCost.updateMany).toHaveBeenCalledWith({
        where: { id: ROW_ID, companyId: COMPANY_B },
        data: { status: 'completed' },
      });
      expect(prisma.processingCost.findFirstOrThrow).not.toHaveBeenCalled();
    });

    it('builds partial data set when only some optional fields are provided', async () => {
      prisma.processingCost.updateMany.mockResolvedValue({ count: 1 });
      prisma.processingCost.findFirstOrThrow.mockResolvedValue({ id: ROW_ID });
      await service.update(ROW_ID, COMPANY_A, { notes: 'updated note' });
      const callArg = prisma.processingCost.updateMany.mock.calls[0][0];
      expect(callArg.data).toEqual({ notes: 'updated note' });
      expect(callArg.where).toEqual({ id: ROW_ID, companyId: COMPANY_A });
    });
  });

  describe('monthly', () => {
    it('aggregates company-scoped rows only', async () => {
      prisma.processingCost.findMany.mockResolvedValue([
        { date: new Date(2026, 3, 5), totalCost: 1000, status: 'pending' },
        { date: new Date(2026, 3, 12), totalCost: 2500, status: 'paid' },
        { date: new Date(2026, 2, 9), totalCost: 7000, status: 'completed' },
      ]);
      const result = await service.monthly(COMPANY_A);
      expect(prisma.processingCost.findMany).toHaveBeenCalledWith({
        where: { companyId: COMPANY_A },
        select: { date: true, totalCost: true, status: true },
        orderBy: { date: 'desc' },
      });
      expect(result).toEqual([
        { month: '2026-04', pending: 1000, completed: 0, paid: 2500, total: 3500 },
        { month: '2026-03', pending: 0, completed: 7000, paid: 0, total: 7000 },
      ]);
    });
  });
});
