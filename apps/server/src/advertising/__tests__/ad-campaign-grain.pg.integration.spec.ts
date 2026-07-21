import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { AdCampaignRepositoryAdapter } from '../adapter/out/repository/ad-campaign.repository.adapter';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const OTHER_ACCOUNT = '33333333-3333-4333-8333-333333333333';

function businessDateToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

describe('AdCampaignRepositoryAdapter account + stable campaign grain (PG)', () => {
  let prisma: PrismaClient;
  let adapter: AdCampaignRepositoryAdapter;
  const businessDate = businessDateToday();

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
  }) {
    return prisma.channelAdTargetDailySnapshot.create({
      data: {
        organizationId: input.organizationId ?? TEST_ORGANIZATION_ID,
        channelAccountId: input.channelAccountId,
        channel: 'coupang',
        businessDate,
        targetType: 'campaign',
        targetKey: `account:${input.channelAccountId}:campaign:${input.campaignIdentity}`,
        campaignId: input.campaignId ?? null,
        campaignIdentity: input.campaignIdentity,
        campaignName: input.campaignName,
        spend: input.spend,
        revenue: input.spend * 2,
        metaJson: {
          source: 'advertising.campaign.target',
          data: { granularity: 'campaign', conversionsObserved: false },
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
          metaJson: { source: 'advertising.campaign.target', data: { granularity: 'product' } },
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
          metaJson: { source: 'advertising.campaign.target', data: { granularity: 'product' } },
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
          metaJson: { source: 'advertising.raw.target', data: { granularity: 'product' } },
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
          metaJson: { source: 'advertising.raw.target', data: { granularity: 'product' } },
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
