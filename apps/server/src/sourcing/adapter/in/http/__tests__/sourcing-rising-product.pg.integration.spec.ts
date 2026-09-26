import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID } from '../../../../../test-helpers/real-prisma';
import { CoupangMomentumReadService } from '../../../../../advertising/application/service/coupang-momentum-read.service';
import { KeywordRankRepositoryAdapter } from '../../../../../advertising/adapter/out/repository/keyword-rank.repository.adapter';
import { CoupangMomentumAdapter } from '../../../out/advertising/coupang-momentum.adapter';
import { TrendCollectionRepositoryAdapter } from '../../../out/repository/trend-collection.repository.adapter';
import { SourcingWorkspaceSnapshotRepositoryAdapter } from '../../../out/repository/sourcing-workspace-snapshot.repository.adapter';
import { SourcingRisingProductService } from '../../../../application/service/sourcing-rising-product.service';
import { SourcingRisingProductController } from '../sourcing-rising-product.controller';
import { kstBusinessDate } from '../../../../../common/kst';
import { channelFactTestPorts } from '../../../../../test-helpers/channel-fact-ports';
import type { PrismaClient } from '@prisma/client';

describe('RisingProducts direct owner HTTP and stored snapshots (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let controller: SourcingRisingProductController;
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const channelFacts = channelFactTestPorts(prisma as never);
    controller = new SourcingRisingProductController(new SourcingRisingProductService(
      new CoupangMomentumAdapter(new CoupangMomentumReadService(new KeywordRankRepositoryAdapter(
        channelFacts.listings,
        channelFacts.recipes,
        prisma as never,
      ))),
      new TrendCollectionRepositoryAdapter(prisma as never),
      new SourcingWorkspaceSnapshotRepositoryAdapter(prisma as never),
    ));
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });

  it('calculates only on explicit POST and round-trips the original default snapshot and coverage gaps through GET', async () => {
    expect(await controller.latest(TEST_ORGANIZATION_ID)).toBeNull();
    const calculated = await controller.detect(TEST_ORGANIZATION_ID, {});
    expect(calculated).toMatchObject({ windowDays: 14, confidence: 0,
      dataGaps: ['coupang_serp_history_missing', 'wing_sales_history_missing', 'naver_trend_history_missing', 'no_rising_candidates'],
      model: { candidates: [], stats: { candidateCount: 0 } } });
    expect(await controller.latest(TEST_ORGANIZATION_ID)).toEqual(calculated);
    expect(await controller.latest('00000000-0000-4000-8000-000000000099')).toBeNull();
  });

  it('reads persisted SERP and Wing facts without recalculating on GET and retains bounded explicit inputs', async () => {
    const today = kstBusinessDate(new Date());
    const yesterday = new Date(today.getTime() - 86_400_000);
    for (const [businessDate, rank, reviewCount] of [[yesterday, 30, 40], [today, 12, 95]] as const) {
      // Advertising이 `advertising.keyword_serp` 실행으로 발행한 행(operationId, KID-362).
      await prisma.coupangKeywordSerpDailySnapshot.create({ data: { organizationId: TEST_ORGANIZATION_ID,
        operationId: randomUUID(),
        keyword: '아기 물티슈', businessDate, capturedAt: businessDate, itemCount: 1,
        items: [{ vendorItemId: 'V1', productId: 'P1', name: '아기 물티슈 리필', rank, reviewCount, priceKrw: 9900, isAd: false }] } });
    }
    await prisma.coupangWingSalesRankDailySnapshot.create({ data: { organizationId: TEST_ORGANIZATION_ID,
      operationId: randomUUID(),
      keyword: '아기 물티슈', vendorItemId: 'V1', businessDate: today, capturedAt: today, salesLast28d: 120, salesRank: 3 } });
    expect(await controller.latest(TEST_ORGANIZATION_ID)).toBeNull();
    const calculated = await controller.detect(TEST_ORGANIZATION_ID, { windowDays: 2, limit: 1 });
    expect(calculated).toMatchObject({ windowDays: 2, confidence: 0.75, dataGaps: ['naver_trend_history_missing'],
      model: { candidates: [{ productName: '아기 물티슈 리필', signals: { rankClimb: 18, reviewGrowth: 55, hasWingSales: true } }] } });
    expect(await controller.latest(TEST_ORGANIZATION_ID)).toEqual(calculated);
    const max = await controller.detect(TEST_ORGANIZATION_ID, { windowDays: 60, limit: 200 });
    expect(max.windowDays).toBe(60);
  });

  it('rejects strict out-of-bounds and client-owned scope inputs without replacing the saved result', async () => {
    const prior = await controller.detect(TEST_ORGANIZATION_ID, {});
    for (const invalid of [null, [], { windowDays: 1 }, { windowDays: 61 }, { windowDays: 2.5 },
      { windowDays: '14' }, { limit: 0 }, { limit: 201 }, { limit: 1.5 }, { limit: '1' },
      { organizationId: 'other' }, { persist: false }, { signal: {} }]) {
      expect(() => controller.detect(TEST_ORGANIZATION_ID, invalid)).toThrow('INVALID_RISING_PRODUCT_INPUT');
    }
    expect(await controller.latest(TEST_ORGANIZATION_ID)).toEqual(prior);
  });
});
