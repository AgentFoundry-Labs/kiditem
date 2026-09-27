import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG } from '../../test-helpers/real-prisma';
import { advertisingLedgerTestReader } from '../../test-helpers/channel-fact-ports';
import { seedAdReportRun } from '../../test-helpers/ad-ledger-seeds';
import { AdvertisingKeywordRankReadAdapter } from '../../advertising/adapter/out/repository/keyword-rank-read.adapter';
import { ReadinessService } from '../readiness.service';
import { ChannelAccountService } from '../../channels/application/service/account/channel-account.service';
import { ChannelAccountPersistenceAdapter } from '../../channels/adapter/out/persistence/channel-account.persistence.adapter';
import { ChannelCredentialsAdapter } from '../../channels/adapter/out/credentials/channel-credentials.adapter';
import { ChannelsProductMappingGenerationAdapter } from '../../channels/adapter/out/products/product-mapping-generation.adapter';
import { ProductMappingGenerationRepositoryAdapter } from '../../products/adapter/out/persistence/product-mapping-generation.repository.adapter';

/**
 * 광고 readiness(KID-372 ①b): 기대일(어제까지 30일, 광고 보고서가 어제를 아직 확정하지 않았으면 그 전날까지)과 광고 원장이
 * 측정한 날(활성 쿠팡 계정 모두의 성공 실행 창)을 비교한다. 실패한 실행의 창은 측정이 아니다.
 */
describe('coupang_ads readiness over PostgreSQL', () => {
  let prisma: PrismaClient;
  let accountId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    accountId = (await prisma.channelAccount.create({
      data: { organizationId: ORG, channel: 'coupang', name: 'Wing', isPrimary: true, status: 'active' },
    })).id;
    // 2026-07-18 12:00 KST: yesterday is 2026-07-17.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-18T03:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  const adsCheck = async () => (await new ReadinessService(
    prisma as never,
    new ChannelAccountService(
      new ChannelAccountPersistenceAdapter(prisma as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter())),
      new ChannelCredentialsAdapter(),
    ),
    { catalogFreshness: async () => ({ syncedAt: null }) },
    new AdvertisingKeywordRankReadAdapter(prisma as never),
    advertisingLedgerTestReader(prisma as never),
  ).getStatus(ORG)).checks.find((check) => check.key === 'coupang_ads');

  it('reads a report confirmed through the day before yesterday as a complete window ending there', async () => {
    await seedAdReportRun(prisma, { organizationId: ORG, channelAccountId: accountId, start: '2026-06-10', end: '2026-07-16' });

    expect(await adsCheck()).toMatchObject({
      referenceDate: '2026-07-16',
      missingDates: [],
      detail: '최근 30일치 (2026-06-17~2026-07-16) 모두 수집됨',
    });
  });

  it('lists the days no succeeded report covered as missing, a failed run included', async () => {
    await seedAdReportRun(prisma, { organizationId: ORG, channelAccountId: accountId, start: '2026-06-18', end: '2026-07-10' });
    await seedAdReportRun(prisma, { organizationId: ORG, channelAccountId: accountId, start: '2026-07-11', end: '2026-07-17', status: 'failed' });

    expect(await adsCheck()).toMatchObject({
      referenceDate: '2026-07-17',
      missingDates: ['2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17'],
    });
  });
});
