import { profitCatalogTestReaders } from '../../test-helpers/channel-fact-ports';
import { channelFactTestPorts } from '../../test-helpers/channel-fact-ports';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AdCampaignRepositoryAdapter } from '../adapter/out/repository/ad-campaign.repository.adapter';
import { AdActionRepositoryAdapter } from '../adapter/out/repository/ad-action.repository.adapter';
import { AdListingRepositoryAdapter } from '../adapter/out/repository/ad-listing.repository.adapter';
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
  let actionAdapter: AdActionRepositoryAdapter;
  const owners = new Map<string, string>();
  const businessDate = periodBounds('7d').to;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    adapter = new AdCampaignRepositoryAdapter(prisma as PrismaService, profitCatalogTestReaders(prisma as PrismaService as never).accounts);
    actionAdapter = new AdActionRepositoryAdapter(channelFactTestPorts(prisma as PrismaService).listings, channelFactTestPorts(prisma as PrismaService).recipes,
      prisma as PrismaService,
      new AdListingRepositoryAdapter(channelFactTestPorts(prisma as PrismaService).listings, channelFactTestPorts(prisma as PrismaService).recipes, prisma as PrismaService), profitCatalogTestReaders(prisma as PrismaService as never).accounts
    );
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
    owners.clear();
    for (const [channelAccountId, organizationId] of [
      [ACCOUNT_A, TEST_ORGANIZATION_ID], [ACCOUNT_B, TEST_ORGANIZATION_ID],
      [OTHER_ACCOUNT, OTHER_ORGANIZATION_ID],
    ]) {
      const owner = await prisma.sourceImportRun.create({ data: {
        organizationId, channelAccountId, sourceType: 'coupang_ad_campaign',
        parserVersion: 'ad-campaign-v1', status: 'completed', freshnessGeneration: 1,
        plan: { captureMode: 'campaign_sweep' },
        // A completed campaign sweep declares the window it swept.
        coverageStartDate: periodBounds('7d').from,
        coverageEndDate: periodBounds('7d').to,
        qualityReport: { campaignDescriptors: [] },
      } });
      owners.set(channelAccountId, owner.id);
    }
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
        sourceImportRunId: owners.get(input.channelAccountId),
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
        sourceImportRunId: owners.get(input.channelAccountId),
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

    const rows = await adapter.findCampaignSnapshot(TEST_ORGANIZATION_ID, '7d').then((snapshot) => snapshot.rollups);
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

    const rows = await adapter.findCampaignSnapshot(TEST_ORGANIZATION_ID, '7d').then((snapshot) => snapshot.rollups);
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

    const rows = await adapter.findCampaignSnapshot(TEST_ORGANIZATION_ID, '7d').then((snapshot) => snapshot.rollups);

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

  it('keeps valid same-day listing targets consistent across campaign and action readers', async () => {
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_A,
        externalId: 'current-row-listing',
        channelName: '현재 행 검증 상품',
      },
    });
    const targetKeys = [
      `account:${ACCOUNT_A}:product:campaign:current-row:item-1`,
      `account:${ACCOUNT_A}:product:campaign:current-row:item-2`,
    ];
    // The ledger permits one row per generation/day/type/target key. Separate
    // product targets on the same listing and day are the valid competing set.
    await prisma.channelAdTargetDailySnapshot.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT_A,
          sourceImportRunId: owners.get(ACCOUNT_A),
          channel: 'coupang',
          listingId: listing.id,
          externalId: listing.externalId,
          businessDate,
          targetType: 'product',
          targetKey: targetKeys[0],
          campaignIdentity: 'campaign:current-row',
          campaignName: '같은 날 상품 1',
          externalOptionId: 'item-1',
          status: 'enabled',
          lastObservedAt: new Date('2026-09-12T12:00:00.000Z'),
          spend: 10,
          metaJson: { 'advertising.campaign.target': { granularity: 'product' } },
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT_A,
          sourceImportRunId: owners.get(ACCOUNT_A),
          channel: 'coupang',
          listingId: listing.id,
          externalId: listing.externalId,
          businessDate,
          targetType: 'product',
          targetKey: targetKeys[1],
          campaignIdentity: 'campaign:current-row',
          campaignName: '같은 날 상품 2',
          externalOptionId: 'item-2',
          status: 'paused',
          lastObservedAt: new Date('2026-09-12T12:01:00.000Z'),
          spend: 20,
          metaJson: { 'advertising.campaign.target': { granularity: 'product' } },
        },
      ],
    });

    const [campaignRows, actionRows] = await Promise.all([
      adapter.findProductTargetRollups(TEST_ORGANIZATION_ID, '7d'),
      actionAdapter.findLatestTargetRows(TEST_ORGANIZATION_ID),
    ]);

    const campaignCurrent = campaignRows
      .filter((row) => targetKeys.includes(row.targetKey))
      .map(({ targetKey, listingId, campaignName, status }) => ({
        targetKey,
        listingId,
        campaignName,
        status,
      }))
      .sort((left, right) => left.targetKey.localeCompare(right.targetKey));
    const actionCurrent = actionRows
      .filter((row) => targetKeys.includes(row.targetKey))
      .map(({ targetKey, listingId, campaignName, status }) => ({
        targetKey,
        listingId,
        campaignName,
        status,
      }))
      .sort((left, right) => left.targetKey.localeCompare(right.targetKey));

    expect(campaignCurrent).toEqual([
      {
        targetKey: targetKeys[0],
        listingId: listing.id,
        campaignName: '같은 날 상품 1',
        status: 'enabled',
      },
      {
        targetKey: targetKeys[1],
        listingId: listing.id,
        campaignName: '같은 날 상품 2',
        status: 'paused',
      },
    ]);
    expect(actionCurrent).toEqual(campaignCurrent);
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

    const rows = await adapter.findCampaignSnapshot(TEST_ORGANIZATION_ID, '7d').then((snapshot) => snapshot.rollups);

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

    const rows = await adapter.findCampaignSnapshot(TEST_ORGANIZATION_ID, '7d').then((snapshot) => snapshot.rollups);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      campaignIdentity: 'campaign:mixed-days',
      spend: 170,
      revenue: 340,
      impressions: 700,
      clicks: 70,
      conversions: 2,
      orders: 2,
      // The explicit campaign day came from the dashboard grid, which has no
      // conversion column; a total that includes that day's stored 0 is not a
      // measured conversion count.
      conversionsObserved: false,
    });
  });

  it('drills into products by account + stable identity, not display name', async () => {
    await prisma.channelAdTargetDailySnapshot.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT_A,
          sourceImportRunId: owners.get(ACCOUNT_A),
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
          sourceImportRunId: owners.get(ACCOUNT_A),
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
          sourceImportRunId: owners.get(ACCOUNT_A),
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
          sourceImportRunId: owners.get(OTHER_ACCOUNT),
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
