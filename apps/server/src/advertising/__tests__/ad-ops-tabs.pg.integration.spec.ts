import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, businessDateKey } from '../../common/kst';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG } from '../../test-helpers/real-prisma';
import { channelFactTestPorts } from '../../test-helpers/channel-fact-ports';
import {
  seedAdCampaign,
  seedAdProductDays,
  seedAdReportRun,
  seedCoupangAdAccount,
} from '../../test-helpers/ad-ledger-seeds';
import { setupChannelListing, setupMaster, setupProductOption } from '../../test-helpers/finance-seeds';
import type { PrismaService } from '../../prisma/prisma.service';
import { AdCampaignRepositoryAdapter } from '../adapter/out/persistence/ad-campaign.repository';
import { AdActionRepositoryAdapter } from '../adapter/out/persistence/ad-action.repository';
import { AdListingRepositoryAdapter } from '../adapter/out/persistence/ad-listing.repository';
import { AdLedgerReadPersistenceAdapter } from '../adapter/out/persistence/ad-ledger-read.repository';
import { AdCampaignsService } from '../application/service/ad-campaigns.service';
import type { AdConfigService } from '../application/service/ad-config.service';
import { periodBounds } from '../domain/ad-metrics';

/**
 * 광고 운영 탭(캠페인·상품·키워드·추세)이 새 광고 원장을 읽는다(KID-372 ①a). 잠그는 것: 캠페인 목록은 `ChannelAdCampaign`
 * 현재 상태에 측정한 날의 상품 행 합을 붙이고(광고비 = 집행액, 전환 = 주문수), 상품은 캠페인으로 좁히며, 키워드는 고른 기간을 그대로 더하고 비검색 줄을 따로 내며, 추세는 측정하지 않은 날을 구멍으로 둔다.
 */
describe('ad-ops tabs over the ad report ledger (PG)', () => {
  let prisma: PrismaClient;
  let service: AdCampaignsService;
  const to = periodBounds('14d').to;
  const key = (offset: number) => businessDateKey(addDays(to, offset));

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const db = prisma as unknown as PrismaService;
    const ports = channelFactTestPorts(db);
    const listingRepo = new AdListingRepositoryAdapter(ports.listings, ports.recipes, db);
    service = new AdCampaignsService(
      new AdCampaignRepositoryAdapter(db, ports.accounts, new AdLedgerReadPersistenceAdapter()),
      listingRepo,
      new AdActionRepositoryAdapter(ports.listings, ports.recipes, db, listingRepo, ports.accounts, new AdLedgerReadPersistenceAdapter(), {} as never),
      undefined as unknown as AdConfigService,
    );
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function listing(code: string, channelAccountId: string) {
    const master = await setupMaster(prisma, { organizationId: ORG, code, name: `마스터 ${code}` });
    const option = await setupProductOption(prisma, { organizationId: ORG, masterId: master.id, sku: `${code}-OPT` });
    return setupChannelListing(prisma, {
      organizationId: ORG, masterId: master.id, channel: 'coupang', externalId: `EXT-${code}`, optionId: option.id, externalOptionId: `VI-${code}`, channelAccountId,
    });
  }

  /** 계정 하나가 어제까지 14일을 측정했다. */
  async function measured14Days() {
    const account = await seedCoupangAdAccount(prisma, { organizationId: ORG, externalAccountId: 'A' });
    const run = await seedAdReportRun(prisma, { organizationId: ORG, channelAccountId: account.id, start: key(-13), end: key(0) });
    return { account, run };
  }

  it('캠페인 목록은 캠페인 표의 현재 상태·예산에 측정한 날의 집행 광고비·주문수를 붙이고 행 없는 캠페인은 0이다', async () => {
    const { account, run } = await measured14Days();
    const l1 = await listing('L1', account.id);
    await seedAdCampaign(prisma, { organizationId: ORG, channelAccountId: account.id, operationId: run.id, campaignId: 'C1', name: '여름 물총', status: 'RUNNING', budget: 30_000, roasTarget: 350 });
    await seedAdCampaign(prisma, { organizationId: ORG, channelAccountId: account.id, operationId: run.id, campaignId: 'C2', name: '쉬는 캠페인', isActive: false });
    await seedAdProductDays(prisma, [
      { organizationId: ORG, channelAccountId: account.id, operationId: run.id, date: key(0), campaignId: 'C1', adGroupId: 'G1', vendorItemId: 'VI-L1', listingId: l1.listingId, spend: 1_000, billedSpend: 800, revenue: 4_000, impressions: 200, clicks: 10, orders: 2 },
      { organizationId: ORG, channelAccountId: account.id, operationId: run.id, date: key(-1), campaignId: 'C1', adGroupId: 'G1', vendorItemId: 'VI-L1', listingId: l1.listingId, spend: 500, billedSpend: 500, clicks: 5 },
    ]);

    const campaigns = await service.getCampaigns('7d', ORG);
    expect(campaigns.map((c) => c.campaignId)).toEqual(['C1', 'C2']);
    expect(campaigns[0]).toMatchObject({
      channelAccountId: account.id, campaignIdentity: 'campaign:C1', campaignName: '여름 물총', metricsAvailable: true,
      isActive: true, onOff: 'ON', status: 'RUNNING', budget: 30_000, roasTarget: 350,
      listing: { listingId: l1.listingId },
      metrics: { spend: 1_500, revenue: 4_000, clicks: 15, conversions: 2, roas: 266.67 },
    });
    expect(campaigns[1]).toMatchObject({ isActive: false, onOff: 'OFF', metricsAvailable: true, listing: null, metrics: { spend: 0, conversions: 0 } });
  });

  it('측정한 날이 없는 기간의 캠페인은 성과 없음(metricsAvailable false)으로 나온다', async () => {
    const account = await seedCoupangAdAccount(prisma, { organizationId: ORG, externalAccountId: 'A' });
    const run = await seedAdReportRun(prisma, { organizationId: ORG, channelAccountId: account.id, start: key(-40), end: key(-30) });
    await seedAdCampaign(prisma, { organizationId: ORG, channelAccountId: account.id, operationId: run.id, campaignId: 'C1' });

    const [campaign] = await service.getCampaigns('7d', ORG);
    expect(campaign).toMatchObject({ campaignId: 'C1', metricsAvailable: false });
  });

  it('상품 탭은 캠페인 식별자로 좁히고 옵션·리스팅 상품번호를 싣는다', async () => {
    const { account, run } = await measured14Days();
    const l1 = await listing('L1', account.id);
    await seedAdCampaign(prisma, { organizationId: ORG, channelAccountId: account.id, operationId: run.id, campaignId: 'C1', name: '여름 물총' });
    await prisma.channelAdCampaignAd.create({
      data: { organizationId: ORG, channelAccountId: account.id, operationId: run.id, adId: 'AD1', campaignId: 'C1', adGroupId: 'G1', vendorItemId: 'VI-L1', isActive: true, status: 'APPROVED', lastSeenAt: new Date() },
    });
    await seedAdProductDays(prisma, [
      { organizationId: ORG, channelAccountId: account.id, operationId: run.id, date: key(0), campaignId: 'C1', adGroupId: 'G1', vendorItemId: 'VI-L1', listingId: l1.listingId, optionName: '파랑 1개', spend: 300, orders: 1, revenue: 9_000 },
      { organizationId: ORG, channelAccountId: account.id, operationId: run.id, date: key(0), campaignId: 'C2', adGroupId: 'G2', vendorItemId: 'VI-Z', spend: 70 },
    ]);

    const products = await service.getProducts('7d', ORG, { channelAccountId: account.id, campaignIdentity: 'campaign:C1' });
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      campaignIdentity: 'campaign:C1', campaignId: 'C1', campaignName: '여름 물총', externalOptionId: 'VI-L1', externalId: 'EXT-L1',
      productName: '파랑 1개', onOff: 'ON', status: 'APPROVED', imageUrl: null, keyword: null,
      metrics: { spend: 300, conversions: 1, revenue: 9_000 },
    });
    expect((await service.getProducts('7d', ORG)).map((p) => p.externalOptionId)).toEqual(['VI-L1', 'VI-Z']);
  });

  it('키워드 탭은 고른 기간의 일별 행을 그대로 더하고 비검색 줄을 따로 내며 상품 요약의 키워드 수에서 뺀다', async () => {
    const { account, run } = await measured14Days();
    const l1 = await listing('L1', account.id);
    await seedAdCampaign(prisma, { organizationId: ORG, channelAccountId: account.id, operationId: run.id, campaignId: 'C1', name: '여름 물총' });
    await seedAdProductDays(prisma, [
      { organizationId: ORG, channelAccountId: account.id, operationId: run.id, date: key(0), campaignId: 'C1', adGroupId: 'G1', vendorItemId: 'VI-L1', listingId: l1.listingId, optionName: '파랑 1개' },
    ]);
    const keyword = (date: string, word: string, spend: number, orders = 0) => prisma.channelAdKeywordDailySnapshot.create({
      data: {
        organizationId: ORG, channelAccountId: account.id, operationId: run.id, date: new Date(`${date}T00:00:00.000Z`),
        campaignId: 'C1', adGroupId: 'G1', vendorItemId: 'VI-L1', keyword: word,
        impressions: 100, clicks: 4, spend, orders, units: orders, revenue: orders * 9_000,
      },
    });
    await keyword(key(0), '물총', 100, 1);
    await keyword(key(-10), '물총', 400);
    await keyword(key(-1), '', 50);

    const week = await service.getKeywords('7d', ORG);
    expect(week).toMatchObject({ period: '7d', windowDays: 7 });
    expect(week.keywords.map((k) => [k.keyword, k.nonSearch, k.metrics.spend, k.windowDays])).toEqual([
      ['물총', false, 100, 1],
      ['', true, 50, 1],
    ]);
    expect(week.keywords[0]).toMatchObject({ externalOptionId: 'VI-L1', productName: '파랑 1개', adGroup: 'G1', campaignName: '여름 물총', metrics: { conversions: 1 } });
    expect(week.products).toEqual([expect.objectContaining({ externalOptionId: 'VI-L1', keywordCount: 1, servingCount: 1, metrics: expect.objectContaining({ spend: 150 }) })]);

    const fortnight = await service.getKeywords('14d', ORG);
    expect(fortnight).toMatchObject({ period: '14d', windowDays: 14 });
    expect(fortnight.keywords.find((k) => k.keyword === '물총')).toMatchObject({ windowDays: 2, businessDate: key(0), metrics: { spend: 500 } });
  });

  it('추세는 고른 기간의 모든 날을 내고 측정하지 않은 날은 구멍, 측정한 날은 주문수를 전환으로 싣는다', async () => {
    const account = await seedCoupangAdAccount(prisma, { organizationId: ORG, externalAccountId: 'A' });
    const run = await seedAdReportRun(prisma, { organizationId: ORG, channelAccountId: account.id, start: key(-1), end: key(0) });
    await seedAdProductDays(prisma, [
      { organizationId: ORG, channelAccountId: account.id, operationId: run.id, date: key(0), spend: 600, billedSpend: 500, revenue: 1_800, clicks: 6, orders: 3 },
    ]);

    const trends = await service.getTrends('7d', undefined, ORG);
    expect(trends.daily).toHaveLength(7);
    expect(trends.daily.at(-3)).toEqual({ date: key(-2), metrics: null, orders: null });
    expect(trends.daily.at(-2)).toMatchObject({ date: key(-1), metrics: { spend: 0, conversions: 0 }, orders: 0 });
    expect(trends.daily.at(-1)).toMatchObject({ date: key(0), metrics: { spend: 600, conversions: 3, cvr: 50 }, orders: 3 });
    expect(trends.summary).toMatchObject({ periodDayCount: 2, latestBusinessDate: key(0), metrics: { spend: 600, conversions: 3 }, orders: 3 });
  });
});
