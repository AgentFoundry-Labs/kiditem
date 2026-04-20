import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { PLDataSchema } from '@kiditem/shared';
import { ProfitLossService } from '../profit-loss.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  OTHER_COMPANY_ID,
} from '../../../test-helpers/real-prisma';

/**
 * Plan B2c.dashboard T14 — ProfitLossService PG integration.
 *
 * 검증:
 *   - IDOR: findAll(TEST_COMPANY_ID) 는 OTHER_COMPANY_ID 의 row 를 절대 반환하지 않는다.
 *   - Decimal profitRate 가 real Postgres 에서 JS number 로 변환되는지 (unit mock 으로는 실제 Decimal bigint 경로 재현 불가).
 *   - PLDataSchema.parse() 가 모든 row 에 대해 성공 — shape drift 없음.
 *   - master.legacyCode 가 있으면 masterCode 로 사용 (fallback 실동작).
 *
 * Fixture: 2 company (TEST_COMPANY_ID + OTHER_COMPANY_ID) × 3 ProfitLoss rows 각각
 *   · TEST_COMPANY_ID: 3 listings (1 with legacyCode, 1 null-category, 1 null-profitRate)
 *   · OTHER_COMPANY_ID: 3 listings (IDOR 탐지용 — 절대 섞이면 안 됨)
 */

describe('ProfitLossService (PG integration)', () => {
  let prisma: PrismaClient;
  let service: ProfitLossService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const m = await Test.createTestingModule({
      providers: [
        ProfitLossService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(ProfitLossService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  /**
   * 2 company × 3 ProfitLoss rows. master 하나당 listing 하나, PL row 하나.
   * TEST company:
   *   · L1: legacyCode='LEG-001', category='유아용품', grade='A', profitRate=0.2857
   *   · L2: legacyCode=null,       category='완구',     grade='B', profitRate=0.2
   *   · L3: legacyCode=null,       category=null,       grade=null, profitRate=null (→ 0 fallback)
   * OTHER company:
   *   · L4/L5/L6 — IDOR canaries. TEST 조회 결과에 절대 포함돼선 안 됨.
   */
  async function seedTwoCompanies() {
    // TEST company — 3 masters + 3 listings + 3 PL rows
    const m1 = await prisma.masterProduct.create({
      data: {
        companyId: TEST_COMPANY_ID,
        code: 'M-001',
        legacyCode: 'LEG-001',
        name: 'TEST M1',
        category: '유아용품',
        abcGrade: 'A',
        thumbnailUrl: 'https://cdn/m1.jpg',
        optionCounter: 0,
      },
    });
    const m2 = await prisma.masterProduct.create({
      data: {
        companyId: TEST_COMPANY_ID,
        code: 'M-002',
        name: 'TEST M2',
        category: '완구',
        abcGrade: 'B',
        optionCounter: 0,
      },
    });
    const m3 = await prisma.masterProduct.create({
      data: {
        companyId: TEST_COMPANY_ID,
        code: 'M-003',
        name: 'TEST M3',
        optionCounter: 0,
      },
    });

    const l1 = await prisma.channelListing.create({
      data: {
        companyId: TEST_COMPANY_ID,
        masterId: m1.id,
        channel: 'coupang',
        externalId: 'EXT-TEST-L1',
        channelName: 'TEST L1',
      },
    });
    const l2 = await prisma.channelListing.create({
      data: {
        companyId: TEST_COMPANY_ID,
        masterId: m2.id,
        channel: 'coupang',
        externalId: 'EXT-TEST-L2',
        channelName: null,
      },
    });
    const l3 = await prisma.channelListing.create({
      data: {
        companyId: TEST_COMPANY_ID,
        masterId: m3.id,
        channel: 'coupang',
        externalId: 'EXT-TEST-L3',
        channelName: 'TEST L3',
      },
    });

    await prisma.profitLoss.create({
      data: {
        companyId: TEST_COMPANY_ID,
        listingId: l1.id,
        year: 2026,
        month: 4,
        revenue: 700_000,
        cogs: 350_000,
        commission: 70_000,
        shippingCost: 20_000,
        adCost: 50_000,
        otherCost: 10_000,
        netProfit: 200_000,
        profitRate: 0.2857,
        orderCount: 3,
        returnCount: 1,
      },
    });
    await prisma.profitLoss.create({
      data: {
        companyId: TEST_COMPANY_ID,
        listingId: l2.id,
        year: 2026,
        month: 4,
        revenue: 300_000,
        netProfit: 60_000,
        profitRate: 0.2,
        orderCount: 1,
        returnCount: 0,
      },
    });
    await prisma.profitLoss.create({
      data: {
        companyId: TEST_COMPANY_ID,
        listingId: l3.id,
        year: 2026,
        month: 4,
        revenue: 50_000,
        netProfit: 10_000,
        profitRate: null, // exercise the `?? 0` fallback path
        orderCount: 1,
        returnCount: 0,
      },
    });

    // OTHER company — IDOR canaries
    const om1 = await prisma.masterProduct.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        code: 'O-001',
        name: 'OTHER M1',
        optionCounter: 0,
      },
    });
    const om2 = await prisma.masterProduct.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        code: 'O-002',
        name: 'OTHER M2',
        optionCounter: 0,
      },
    });
    const om3 = await prisma.masterProduct.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        code: 'O-003',
        name: 'OTHER M3',
        optionCounter: 0,
      },
    });
    const ol1 = await prisma.channelListing.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        masterId: om1.id,
        channel: 'coupang',
        externalId: 'EXT-OTHER-L1',
        channelName: 'OTHER L1',
      },
    });
    const ol2 = await prisma.channelListing.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        masterId: om2.id,
        channel: 'coupang',
        externalId: 'EXT-OTHER-L2',
        channelName: 'OTHER L2',
      },
    });
    const ol3 = await prisma.channelListing.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        masterId: om3.id,
        channel: 'coupang',
        externalId: 'EXT-OTHER-L3',
        channelName: 'OTHER L3',
      },
    });
    for (const listingId of [ol1.id, ol2.id, ol3.id]) {
      await prisma.profitLoss.create({
        data: {
          companyId: OTHER_COMPANY_ID,
          listingId,
          year: 2026,
          month: 4,
          revenue: 999_999,
          netProfit: 999_999,
          profitRate: 0.5,
          orderCount: 99,
          returnCount: 99,
        },
      });
    }

    return { m1, m2, m3, l1, l2, l3 };
  }

  it('findAll returns 3 PLData rows for TEST company (April 2026); IDOR excludes OTHER company', async () => {
    const { l1, l2, l3, m1 } = await seedTwoCompanies();

    const result = await service.findAll(TEST_COMPANY_ID, 2026, 4);

    expect(result).toHaveLength(3);
    const listingIds = result.map((r) => r.listingId).sort();
    expect(listingIds).toEqual([l1.id, l2.id, l3.id].sort());
    // IDOR assertion — no OTHER_COMPANY externalId
    expect(result.every((r) => !r.externalId.startsWith('EXT-OTHER'))).toBe(true);
    // Cross-check: no OTHER_COMPANY masterId
    expect(result.every((r) => r.masterId !== (undefined as any))).toBe(true);
    expect(
      result.find((r) => r.listingId === l1.id)?.masterId,
    ).toBe(m1.id);
  });

  it('IDOR — findAll(OTHER_COMPANY_ID) returns 3 OTHER rows only, 0 TEST rows', async () => {
    await seedTwoCompanies();

    const result = await service.findAll(OTHER_COMPANY_ID, 2026, 4);

    expect(result).toHaveLength(3);
    expect(result.every((r) => r.externalId.startsWith('EXT-OTHER'))).toBe(true);
    expect(result.some((r) => r.externalId.startsWith('EXT-TEST'))).toBe(false);
  });

  it('All rows pass PLDataSchema.parse() — no shape drift vs shared schema', async () => {
    await seedTwoCompanies();

    const result = await service.findAll(TEST_COMPANY_ID, 2026, 4);

    for (const row of result) {
      const parsed = PLDataSchema.safeParse(row);
      expect(parsed.success, JSON.stringify(parsed)).toBe(true);
    }
  });

  it('Decimal profitRate in Postgres converts to JS number; null falls back to 0', async () => {
    const { l1, l3 } = await seedTwoCompanies();

    const result = await service.findAll(TEST_COMPANY_ID, 2026, 4);

    const row1 = result.find((r) => r.listingId === l1.id);
    const row3 = result.find((r) => r.listingId === l3.id);

    expect(typeof row1?.profitRate).toBe('number');
    // Decimal(5,4) stored as 0.2857
    expect(row1?.profitRate).toBeCloseTo(0.2857, 4);
    expect(row3?.profitRate).toBe(0); // null → 0 fallback
  });

  it('masterCode = legacyCode ?? code (legacyCode wins for L1; code fallback for L2/L3)', async () => {
    const { l1, l2, l3 } = await seedTwoCompanies();

    const result = await service.findAll(TEST_COMPANY_ID, 2026, 4);

    expect(result.find((r) => r.listingId === l1.id)?.masterCode).toBe('LEG-001');
    expect(result.find((r) => r.listingId === l2.id)?.masterCode).toBe('M-002');
    expect(result.find((r) => r.listingId === l3.id)?.masterCode).toBe('M-003');
  });

  it('category / grade / thumbnailUrl nullability surfaces as null (not undefined)', async () => {
    const { l3 } = await seedTwoCompanies();

    const result = await service.findAll(TEST_COMPANY_ID, 2026, 4);

    const row3 = result.find((r) => r.listingId === l3.id);
    expect(row3?.category).toBeNull();
    expect(row3?.grade).toBeNull();
    expect(row3?.thumbnailUrl).toBeNull();
  });

  it('year/month filter excludes rows from other months', async () => {
    const { l1 } = await seedTwoCompanies();
    // Add March row for l1
    await prisma.profitLoss.create({
      data: {
        companyId: TEST_COMPANY_ID,
        listingId: l1.id,
        year: 2026,
        month: 3,
        revenue: 100_000,
        netProfit: 20_000,
        profitRate: 0.2,
        orderCount: 1,
        returnCount: 0,
      },
    });

    const april = await service.findAll(TEST_COMPANY_ID, 2026, 4);
    expect(april).toHaveLength(3); // still 3

    const march = await service.findAll(TEST_COMPANY_ID, 2026, 3);
    expect(march).toHaveLength(1);
    expect(march[0].listingId).toBe(l1.id);
    expect(march[0].revenue).toBe(100_000);
  });
});
