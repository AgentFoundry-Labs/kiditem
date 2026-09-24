import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { SettlementsService } from '../settlements.service';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from '../../../../../test-helpers/real-prisma';
import { readSettlements } from '../../../../adapter/out/persistence/read/settlement/settlement-facts';
import type { UpdateSettlementDto } from '../../../../adapter/in/web/settlement/dto';

describe('Settlements flow (PG integration)', () => {
  let prisma: PrismaClient;
  let service: SettlementsService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const m = await Test.createTestingModule({
      providers: [
        SettlementsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(SettlementsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  describe('update — IDOR protection', () => {
    it('#6 cross-organization update throws BadRequestException', async () => {
      const settlement = await prisma.settlement.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          period: '2026-03',
          expectedAmount: 1_000_000,
        },
      });

      await expect(
        service.update(settlement.id, OTHER_ORGANIZATION_ID, { actualAmount: 99_999_999 }),
      ).rejects.toThrow(BadRequestException);

      const reread = await prisma.settlement.findUnique({ where: { id: settlement.id } });
      expect(reread?.actualAmount).toBe(0);
    });

    it('#7 same-organization confirmation publishes the actual amount and its difference', async () => {
      const settlement = await prisma.settlement.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          period: '2026-03',
          expectedAmount: 1_000_000,
        },
      });

      const updated = await service.update(settlement.id, TEST_ORGANIZATION_ID, {
        actualAmount: 980_000,
        status: 'confirmed',
      });

      expect(updated).toMatchObject({
        actualAmount: 980_000,
        status: 'confirmed',
        expectedAmount: 1_000_000,
        difference: -20_000,
      });
    });

    it('#7b refuses to confirm a settlement without the deposited amount', async () => {
      const settlement = await prisma.settlement.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          period: '2026-03',
          expectedAmount: 1_000_000,
        },
      });

      // The stored actual column defaults to 0; confirming it would publish a
      // deposit nobody entered.
      await expect(
        service.update(settlement.id, TEST_ORGANIZATION_ID, { status: 'confirmed' }),
      ).rejects.toThrow(BadRequestException);
      // An explicit null is no amount either, and must not reach the non-null column.
      await expect(service.update(settlement.id, TEST_ORGANIZATION_ID, {
        status: 'confirmed',
        actualAmount: null,
      } as unknown as UpdateSettlementDto)).rejects.toThrow(BadRequestException);

      await expect(service.findAll(TEST_ORGANIZATION_ID, '2026-03').then((list) => list.items)).resolves.toEqual([
        expect.objectContaining({ status: 'pending', actualAmount: null, difference: null }),
      ]);
      await expect(service.update(settlement.id, TEST_ORGANIZATION_ID, {
        status: 'confirmed',
        actualAmount: 0,
      })).resolves.toMatchObject({ status: 'confirmed', actualAmount: 0, difference: -1_000_000 });
    });

    it('#8 missing settlement uses the same public not-found contract', async () => {
      await expect(service.update(
        '00000000-0000-4000-8000-000000000099',
        TEST_ORGANIZATION_ID,
        { actualAmount: 1 },
      )).rejects.toThrow(BadRequestException);
    });
  });

  it('reads the Finance-owned settlement ledger with period and organization scope', async () => {
    await service.create(TEST_ORGANIZATION_ID, {
      period: '2026-03', expectedAmount: 1_000, commission: 100,
      shippingFee: 50, orderCount: 2, returnCount: 0,
    });
    await service.create(TEST_ORGANIZATION_ID, {
      period: '2026-04', expectedAmount: 2_000, commission: 200,
      shippingFee: 75, orderCount: 3, returnCount: 1,
    });
    await service.create(OTHER_ORGANIZATION_ID, {
      period: '2026-03', expectedAmount: 999_999, commission: 0,
      shippingFee: 0, orderCount: 1, returnCount: 0,
    });

    await expect(prisma.$transaction((tx) => readSettlements(tx, {
      organizationId: TEST_ORGANIZATION_ID,
      period: '2026',
    }))).resolves.toEqual([
      expect.objectContaining({ period: '2026-04', expectedAmount: 2_000 }),
      expect.objectContaining({ period: '2026-03', expectedAmount: 1_000 }),
    ]);
    await expect(service.findAll(TEST_ORGANIZATION_ID, '2026-03').then((list) => list.items)).resolves.toEqual([
      expect.objectContaining({ period: '2026-03', expectedAmount: 1_000 }),
    ]);
    await expect(service.findAll(TEST_ORGANIZATION_ID, '').then((list) => list.items)).resolves.toHaveLength(2);
  });

  /** KID-85 follow-up P3-13 — the settlement cards read server totals, not browser sums. */
  it('sums the listed settlements on the server: expected over every row, deposits over confirmed rows only', async () => {
    await service.create(TEST_ORGANIZATION_ID, {
      period: '2026-03', expectedAmount: 1_000, commission: 0, shippingFee: 0, orderCount: 0, returnCount: 0,
    });
    const confirmed = await service.create(TEST_ORGANIZATION_ID, {
      period: '2026-04', expectedAmount: 2_000, commission: 0, shippingFee: 0, orderCount: 0, returnCount: 0,
    });
    await service.update(confirmed.id, TEST_ORGANIZATION_ID, { status: 'confirmed', actualAmount: 1_500 });

    await expect(service.findAll(TEST_ORGANIZATION_ID, '')).resolves.toEqual({
      items: [
        expect.objectContaining({ period: '2026-04', actualAmount: 1_500, difference: -500 }),
        expect.objectContaining({ period: '2026-03', actualAmount: null, difference: null }),
      ],
      summary: {
        totalExpected: 3_000,
        totalConfirmedActual: 1_500,
        totalConfirmedDifference: -500,
        pendingCount: 1,
      },
    });
  });

  it('publishes a total no settlement row contributes to as null, not 0', async () => {
    // No settlement source exists yet (KID-115); an empty ledger measured nothing.
    await expect(service.findAll(TEST_ORGANIZATION_ID, '2026-03').then((list) => list.summary)).resolves.toEqual({
      totalExpected: null,
      totalConfirmedActual: null,
      totalConfirmedDifference: null,
      pendingCount: null,
    });

    await service.create(TEST_ORGANIZATION_ID, {
      period: '2026-03', expectedAmount: 1_000, commission: 0, shippingFee: 0, orderCount: 0, returnCount: 0,
    });
    // A pending row contributes its expected amount and its count, but no deposit.
    await expect(service.findAll(TEST_ORGANIZATION_ID, '2026-03').then((list) => list.summary)).resolves.toEqual({
      totalExpected: 1_000,
      totalConfirmedActual: null,
      totalConfirmedDifference: null,
      pendingCount: 1,
    });
  });

  it('publishes no actual amount or difference for a settlement nobody confirmed', async () => {
    const created = await service.create(TEST_ORGANIZATION_ID, {
      period: '2026-03', expectedAmount: 1_000, commission: 100,
      shippingFee: 50, orderCount: 2, returnCount: 0,
    });

    // The stored actual column defaults to 0; an unconfirmed deposit is not
    // a deposit of zero.
    expect(created).toMatchObject({ status: 'pending', actualAmount: null, difference: null });
    await expect(service.findAll(TEST_ORGANIZATION_ID, '2026-03').then((list) => list.items)).resolves.toEqual([
      expect.objectContaining({ actualAmount: null, difference: null }),
    ]);
  });
});
