import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AdCampaignRepositoryAdapter } from '../adapter/out/repository/ad-campaign.repository.adapter';
import { periodBounds } from '../domain/ad-metrics';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const OTHER_ACCOUNT = '33333333-3333-4333-8333-333333333333';

describe('AdCampaignRepositoryAdapter account + stable campaign grain (PG)', () => {
  let prisma: PrismaClient;
  let adapter: AdCampaignRepositoryAdapter;
  const businessDate = periodBounds('7d').to;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    adapter = new AdCampaignRepositoryAdapter(prisma as PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.createMany({
      data: [
        { id: ACCOUNT_A, organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', name: 'A' },
        { id: ACCOUNT_B, organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', name: 'B' },
        { id: OTHER_ACCOUNT, organizationId: OTHER_ORGANIZATION_ID, channel: 'coupang', name: 'Other' },
      ],
    });
  });

  async function createCampaignFact(input: {
    organizationId?: string;
    channelAccountId: string;
    campaignIdentity: string;
    campaignId?: string;
    campaignName: string;
    spend: number;
    businessDate?: Date;
  }) {
    return prisma.channelAdTargetDailySnapshot.create({
      data: {
        organizationId: input.organizationId ?? TEST_ORGANIZATION_ID,
        channelAccountId: input.channelAccountId,
        channel: 'coupang',
        businessDate: input.businessDate ?? businessDate,
        targetType: 'campaign',
        targetKey: `account:${input.channelAccountId}:campaign:${input.campaignIdentity}`,
        campaignId: input.campaignId ?? null,
        campaignIdentity: input.campaignIdentity,
        campaignName: input.campaignName,
        spend: input.spend,
        revenue: input.spend * 2,
        metaJson: {
          'advertising.campaign.target': {
            granularity: 'campaign',
            conversionsObserved: false,
          },
        },
      },
    });
  }

  async function createProductFact(input: {
    channelAccountId: string;
    campaignIdentity: string;
    campaignId?: string;
    campaignName: string;
    externalOptionId: string;
    spend: number;
    revenue?: number;
    businessDate?: Date;
  }) {
    return prisma.channelAdTargetDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: input.channelAccountId,
        channel: 'coupang',
        businessDate: input.businessDate ?? businessDate,
        targetType: 'product',
        targetKey:
          `account:${input.channelAccountId}:product:` +
          `${input.campaignIdentity}:${input.externalOptionId}`,
        campaignId: input.campaignId ?? null,
        campaignIdentity: input.campaignIdentity,
        campaignName: input.campaignName,
        externalOptionId: input.externalOptionId,
        spend: input.spend,
        revenue: input.revenue ?? input.spend * 2,
        impressions: input.spend * 10,
        clicks: input.spend,
        conversions: 1,
        orders: 1,
        metaJson: {
          'advertising.campaign.target': {
            granularity: 'product',
            conversionsObserved: true,
          },
        },
      },
    });
  }

  it('binds account-less sync evidence to the primary account even when a secondary marker is newer', async () => {
    await prisma.channelAccount.update({
      where: { id: ACCOUNT_A },
      data: { isPrimary: true },
    });
    const markerMeta = (
      collectionRunId: string,
    ): Record<string, unknown> => ({
      collectionRunId,
      collectionAttempt: 1,
      campaignSweepComplete: true,
      campaignIdentityComplete: true,
      campaignCount: 0,
      campaignDailyCollectionComplete: true,
      campaignDailyWindowDays: 31,
      campaignDailyFrom: '2026-06-24',
      campaignDailyTo: '2026-07-24',
    });
    await prisma.channelScrapeRun.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT_A,
          channel: 'coupang',
          source: 'advertising',
          pageType: 'campaign',
          status: 'complete',
          startedAt: new Date('2026-07-25T01:00:00.000Z'),
          finishedAt: new Date('2026-07-25T01:01:00.000Z'),
          metaJson: markerMeta(
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          ),
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT_B,
          channel: 'coupang',
          source: 'advertising',
          pageType: 'campaign',
          status: 'complete',
          startedAt: new Date('2026-07-25T02:00:00.000Z'),
          finishedAt: new Date('2026-07-25T02:01:00.000Z'),
          metaJson: markerMeta(
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          ),
        },
      ],
    });

    await expect(
      adapter.findAccountlessSyncCampaignSweep(TEST_ORGANIZATION_ID),
    ).resolves.toMatchObject({
      channelAccountId: ACCOUNT_A,
      collectionRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      rosterComplete: true,
      dailyFactsComplete: true,
    });
  });

  it('proves every exact day from same-run persisted facts, including explicit-empty descriptors', async () => {
    await prisma.channelAccount.update({
      where: { id: ACCOUNT_A },
      data: { isPrimary: true },
    });
    const collectionRunId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const from = new Date('2026-06-24T00:00:00.000Z');
    const factIds: string[] = [];
    for (let offset = 0; offset < 31; offset += 1) {
      const date = new Date(from.getTime() + offset * 86_400_000);
      const run = await prisma.channelScrapeRun.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT_A,
          channel: 'coupang',
          source: 'advertising',
          pageType: 'campaign',
          businessDate: date,
          periodStart: date,
          periodEnd: date,
          status: 'complete',
          startedAt: new Date('2026-07-25T01:00:00.000Z'),
          finishedAt: new Date('2026-07-25T01:01:00.000Z'),
          metaJson: {
            collectionRunId,
            collectionAttempt: 2,
            requestedCampaignReportScope:
              'single_campaign_authoritative',
            effectiveCampaignReportScope:
              'single_campaign_authoritative',
            dailyProjectionSkipped: false,
            dashboardOnOff: 'OFF',
          },
        },
      });
      const snapshot = await prisma.channelScrapeSnapshot.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          scrapeRunId: run.id,
          channel: 'coupang',
          source: 'advertising',
          pageType: 'campaign',
          businessDate: date,
          rawJson: {
            campaignId: 'DETAIL-OFF',
            _campaignOnly: true,
          },
          normalizedJson: {
            campaignId: 'DETAIL-OFF',
            campaignIdentity: 'campaign:DETAIL-OFF',
            campaignName: '현재 OFF인 상세 캠페인',
            onOff: 'OFF',
            _campaignOnly: true,
          },
        },
      });
      const fact = await prisma.channelAdTargetDailySnapshot.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT_A,
          channel: 'coupang',
          businessDate: date,
          targetType: 'campaign',
          targetKey: 'account:primary:campaign:DETAIL-OFF',
          campaignId: 'DETAIL-OFF',
          campaignIdentity: 'campaign:DETAIL-OFF',
          campaignName: '현재 OFF인 상세 캠페인',
          onOff: 'OFF',
          rawSnapshotId: snapshot.id,
        },
      });
      factIds.push(fact.id);
    }
    await prisma.channelScrapeRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_A,
        channel: 'coupang',
        source: 'advertising',
        pageType: 'campaign',
        status: 'complete',
        startedAt: new Date('2026-07-25T02:00:00.000Z'),
        finishedAt: new Date('2026-07-25T02:01:00.000Z'),
        metaJson: {
          collectionRunId,
          collectionAttempt: 2,
          campaignSweepComplete: true,
          campaignIdentityComplete: true,
          campaignCount: 1,
          campaignDailyCollectionComplete: true,
          campaignDailyWindowDays: 31,
          campaignDailyFrom: '2026-06-24',
          campaignDailyTo: '2026-07-24',
        },
      },
    });

    await expect(
      adapter.findAccountlessSyncCampaignSweep(TEST_ORGANIZATION_ID),
    ).resolves.toMatchObject({
      rosterComplete: true,
      dailyFactsComplete: true,
    });

    await prisma.channelAdTargetDailySnapshot.delete({
      where: { id: factIds[0] },
    });
    await expect(
      adapter.findAccountlessSyncCampaignSweep(TEST_ORGANIZATION_ID),
    ).resolves.toMatchObject({
      rosterComplete: true,
      dailyFactsComplete: false,
    });
  });

  it('keeps the same provider campaign id in two accounts as two campaigns', async () => {
    await createCampaignFact({
      channelAccountId: ACCOUNT_A,
      campaignIdentity: 'campaign:provider-1',
      campaignId: 'provider-1',
      campaignName: '동일 이름',
      spend: 100,
    });
    await createCampaignFact({
      channelAccountId: ACCOUNT_B,
      campaignIdentity: 'campaign:provider-1',
      campaignId: 'provider-1',
      campaignName: '동일 이름',
      spend: 200,
    });

    const rows = await adapter.findCampaignRollups(TEST_ORGANIZATION_ID, '7d');
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.channelAccountId).sort()).toEqual([ACCOUNT_A, ACCOUNT_B].sort());
    expect(rows.map((row) => row.spend).sort((a, b) => a - b)).toEqual([100, 200]);
  });

  it('keeps same-name campaigns with distinct stable identities in one account', async () => {
    await createCampaignFact({
      channelAccountId: ACCOUNT_A,
      campaignIdentity: 'campaign:provider-a',
      campaignName: '동일 이름',
      spend: 300,
    });
    await createCampaignFact({
      channelAccountId: ACCOUNT_A,
      campaignIdentity: 'campaign:provider-b',
      campaignName: '동일 이름',
      spend: 400,
    });

    const rows = await adapter.findCampaignRollups(TEST_ORGANIZATION_ID, '7d');
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.campaignIdentity).sort()).toEqual([
      'campaign:provider-a',
      'campaign:provider-b',
    ]);
  });

  it('falls back to the sum of product facts when campaign grain is absent', async () => {
    await createProductFact({
      channelAccountId: ACCOUNT_A,
      campaignIdentity: 'campaign:product-only',
      campaignId: 'product-only',
      campaignName: '상품 상세만 수집된 캠페인',
      externalOptionId: 'item-a',
      spend: 10,
      revenue: 30,
    });
    await createProductFact({
      channelAccountId: ACCOUNT_A,
      campaignIdentity: 'campaign:product-only',
      campaignId: 'product-only',
      campaignName: '상품 상세만 수집된 캠페인',
      externalOptionId: 'item-b',
      spend: 20,
      revenue: 70,
    });

    const rows = await adapter.findCampaignRollups(TEST_ORGANIZATION_ID, '7d');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      channelAccountId: ACCOUNT_A,
      campaignIdentity: 'campaign:product-only',
      campaignId: 'product-only',
      campaignName: '상품 상세만 수집된 캠페인',
      listingId: null,
      spend: 30,
      revenue: 100,
      impressions: 300,
      clicks: 30,
      conversions: 2,
      orders: 2,
      conversionsObserved: true,
    });
  });

  it('prefers campaign grain over product facts for the same campaign/day', async () => {
    await createCampaignFact({
      channelAccountId: ACCOUNT_A,
      campaignIdentity: 'campaign:explicit-wins',
      campaignId: 'explicit-wins',
      campaignName: '명시 캠페인 합계',
      spend: 100,
    });
    await createProductFact({
      channelAccountId: ACCOUNT_A,
      campaignIdentity: 'campaign:explicit-wins',
      campaignId: 'explicit-wins',
      campaignName: '명시 캠페인 합계',
      externalOptionId: 'item-a',
      spend: 10,
    });
    await createProductFact({
      channelAccountId: ACCOUNT_A,
      campaignIdentity: 'campaign:explicit-wins',
      campaignId: 'explicit-wins',
      campaignName: '명시 캠페인 합계',
      externalOptionId: 'item-b',
      spend: 20,
    });

    const rows = await adapter.findCampaignRollups(TEST_ORGANIZATION_ID, '7d');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      campaignIdentity: 'campaign:explicit-wins',
      spend: 100,
      revenue: 200,
      conversionsObserved: false,
    });
  });

  it('combines an explicit day with a different product-fallback day once each', async () => {
    const previousBusinessDate = new Date(
      businessDate.getTime() - 86_400_000,
    );
    await createCampaignFact({
      channelAccountId: ACCOUNT_A,
      campaignIdentity: 'campaign:mixed-days',
      campaignId: 'mixed-days',
      campaignName: '혼합 날짜 캠페인',
      spend: 100,
    });
    await createProductFact({
      channelAccountId: ACCOUNT_A,
      campaignIdentity: 'campaign:mixed-days',
      campaignId: 'mixed-days',
      campaignName: '혼합 날짜 캠페인',
      externalOptionId: 'same-day-product',
      spend: 999,
    });
    await createProductFact({
      channelAccountId: ACCOUNT_A,
      campaignIdentity: 'campaign:mixed-days',
      campaignId: 'mixed-days',
      campaignName: '혼합 날짜 캠페인',
      externalOptionId: 'previous-item-a',
      spend: 30,
      businessDate: previousBusinessDate,
    });
    await createProductFact({
      channelAccountId: ACCOUNT_A,
      campaignIdentity: 'campaign:mixed-days',
      campaignId: 'mixed-days',
      campaignName: '혼합 날짜 캠페인',
      externalOptionId: 'previous-item-b',
      spend: 40,
      businessDate: previousBusinessDate,
    });

    const rows = await adapter.findCampaignRollups(TEST_ORGANIZATION_ID, '7d');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      campaignIdentity: 'campaign:mixed-days',
      spend: 170,
      revenue: 340,
      impressions: 700,
      clicks: 70,
      conversions: 2,
      orders: 2,
      conversionsObserved: true,
    });
  });

  it('drills into products by account + stable identity, not display name', async () => {
    await prisma.channelAdTargetDailySnapshot.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT_A,
          channel: 'coupang',
          businessDate,
          targetType: 'product',
          targetKey: `account:${ACCOUNT_A}:product:campaign:a:item-a`,
          campaignIdentity: 'campaign:a',
          campaignName: '동일 이름',
          externalOptionId: 'item-a',
          spend: 10,
          metaJson: {
            'advertising.campaign.target': { granularity: 'product' },
          },
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT_A,
          channel: 'coupang',
          businessDate,
          targetType: 'product',
          targetKey: `account:${ACCOUNT_A}:product:campaign:b:item-b`,
          campaignIdentity: 'campaign:b',
          campaignName: '동일 이름',
          externalOptionId: 'item-b',
          spend: 20,
          metaJson: {
            'advertising.campaign.target': { granularity: 'product' },
          },
        },
      ],
    });

    const rows = await adapter.findProductTargetRollups(
      TEST_ORGANIZATION_ID,
      '7d',
      { channelAccountId: ACCOUNT_A, campaignIdentity: 'campaign:b' },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ externalOptionId: 'item-b', spend: 20 });
  });

  it('keeps campaign-less product facts but excludes another organization', async () => {
    await prisma.channelAdTargetDailySnapshot.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT_A,
          channel: 'coupang',
          businessDate,
          targetType: 'product',
          targetKey: `account:${ACCOUNT_A}:product:item-a`,
          campaignIdentity: null,
          externalOptionId: 'item-a',
          spend: 10,
          metaJson: {
            'advertising.raw.target': { granularity: 'product' },
          },
        },
        {
          organizationId: OTHER_ORGANIZATION_ID,
          channelAccountId: OTHER_ACCOUNT,
          channel: 'coupang',
          businessDate,
          targetType: 'product',
          targetKey: `account:${OTHER_ACCOUNT}:product:item-other`,
          campaignIdentity: null,
          externalOptionId: 'item-other',
          spend: 999,
          metaJson: {
            'advertising.raw.target': { granularity: 'product' },
          },
        },
      ],
    });

    const rows = await adapter.findProductTargetRollups(TEST_ORGANIZATION_ID, '7d');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      channelAccountId: ACCOUNT_A,
      campaignIdentity: null,
      externalOptionId: 'item-a',
    });
  });
});
