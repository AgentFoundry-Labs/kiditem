import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ManualLedgerService } from '../manual-ledger.service';

/**
 * Tenant boundary regression — Phase 3 finance rewrite.
 *
 * Coverage:
 *   findAll  — organizationId in WHERE; type/period filters compose
 *   create   — organizationId in INSERT
 *   delete   — scoped deleteMany (id + organizationId in WHERE);
 *              count === 0 → BadRequestException (cross-organization denial)
 *
 * Limitation: mock Prisma cannot prove DB-level isolation. The tests assert
 * call-shape (WHERE includes organizationId) and behavior (count===0 → throw).
 * Runtime DB isolation is enforced by the surrounding scanner gates
 * (`check:tenant-scope`, `check:idor`).
 */

const COMPANY_A = '00000000-0000-4000-8000-00000000000a';
const COMPANY_B = '00000000-0000-4000-8000-00000000000b';
const ROW_ID = '11111111-1111-4111-8111-111111111111';

function makePrisma() {
  return {
    manualLedger: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
}

describe('ManualLedgerService', () => {
  let service: ManualLedgerService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ManualLedgerService(prisma as never);
  });

  describe('findAll', () => {
    it('always scopes by organizationId', async () => {
      prisma.manualLedger.findMany.mockResolvedValue([]);
      await service.findAll(COMPANY_A);
      expect(prisma.manualLedger.findMany).toHaveBeenCalledWith({
        where: { organizationId: COMPANY_A },
        orderBy: { date: 'desc' },
      });
    });

    it('composes type filter without dropping organizationId', async () => {
      prisma.manualLedger.findMany.mockResolvedValue([]);
      await service.findAll(COMPANY_A, 'expense');
      expect(prisma.manualLedger.findMany).toHaveBeenCalledWith({
        where: { organizationId: COMPANY_A, type: 'expense' },
        orderBy: { date: 'desc' },
      });
    });

    it('composes period range without dropping organizationId', async () => {
      prisma.manualLedger.findMany.mockResolvedValue([]);
      await service.findAll(COMPANY_A, undefined, '2026-04');
      const callArg = prisma.manualLedger.findMany.mock.calls[0][0];
      expect(callArg.where.organizationId).toBe(COMPANY_A);
      expect(callArg.where.date).toEqual({
        gte: new Date(2026, 3, 1),
        lt: new Date(2026, 4, 1),
      });
    });
  });

  describe('create', () => {
    it('writes organizationId from argument, never from DTO', async () => {
      prisma.manualLedger.create.mockResolvedValue({ id: ROW_ID });
      await service.create(COMPANY_A, {
        date: '2026-04-15',
        type: 'expense',
        category: 'office',
        amount: 10_000,
      });
      const callArg = prisma.manualLedger.create.mock.calls[0][0];
      expect(callArg.data.organizationId).toBe(COMPANY_A);
      expect(callArg.data.tax).toBe(0);
    });
  });

  describe('delete', () => {
    it('deletes via scoped deleteMany (id + organizationId)', async () => {
      prisma.manualLedger.deleteMany.mockResolvedValue({ count: 1 });
      const result = await service.delete(ROW_ID, COMPANY_A);
      expect(prisma.manualLedger.deleteMany).toHaveBeenCalledWith({
        where: { id: ROW_ID, organizationId: COMPANY_A },
      });
      expect(result).toEqual({ ok: true });
    });

    it('cross-organization denial: throws when row owned by another organization', async () => {
      // Caller is COMPANY_B targeting a row that belongs to COMPANY_A.
      // deleteMany(WHERE id + organizationId=B) matches 0 rows → service must reject.
      prisma.manualLedger.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.delete(ROW_ID, COMPANY_B)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.manualLedger.deleteMany).toHaveBeenCalledWith({
        where: { id: ROW_ID, organizationId: COMPANY_B },
      });
    });
  });
});
