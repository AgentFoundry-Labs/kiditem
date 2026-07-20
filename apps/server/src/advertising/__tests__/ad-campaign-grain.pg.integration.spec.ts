/**
 * Regression lock for the campaign/product grain split in
 * `channel_ad_target_daily_snapshots`.
 *
 * The Coupang advertising report renders campaign rollup rows and individual
 * product rows in the same grid, and both land with `target_type = 'product'`
 * (target_type is inferred from pageType). Two reads depend on telling them
 * apart, and both were wrong:
 *
 *   - `findProductTargetRollups` summed BOTH layers, so a campaign that had
 *     per-product rows on the same day was counted twice. Reproduced from
 *     business date 2026-07-17: 9 campaign rollups (spend 64,512 — the value
 *     Coupang itself reports) + 29 member product rows of the
 *     `쿠팡윙 집중광고` campaign (spend 15,156, already inside the rollup)
 *     summed to 79,668 instead of 64,512.
 *   - `findCampaignRollups` filtered on `target_type = 'campaign'`, which no
 *     historical rollup row ever carried, so the campaign tab read empty.
 *
 * The fixture below is a scaled-down copy of that exact day.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { AdCampaignRepositoryAdapter } from '../adapter/out/repository/ad-campaign.repository.adapter';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';

const CAMPAIGN_WITH_MEMBERS = '쿠팡윙 집중광고';
const CAMPAIGN_WITHOUT_MEMBERS = '매출 TOP 제품';

/** Rollup spend Coupang reports for the two campaigns combined. */
const ROLLUP_SPEND_TOTAL = 64_512;
/** Member product spend, already contained in the rollup above. */
const MEMBER_SPEND_TOTAL = 15_156;

function businessDateToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

describe('AdCampaignRepositoryAdapter grain split (PG integration)', () => {
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

    await prisma.channelAdTargetDailySnapshot.createMany({
      data: [
        // --- Layer 1: campaign rollups, stored as target_type 'product'
        // (legacy, no grain stamp) with no product identity. ---
        {
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          businessDate,
          targetType: 'product',
          targetKey: `product:${CAMPAIGN_WITH_MEMBERS}:rollup`,
          campaignName: CAMPAIGN_WITH_MEMBERS,
          externalId: `product::${CAMPAIGN_WITH_MEMBERS}::::::29개`,
          spend: 15_154,
          revenue: 29_700,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          businessDate,
          targetType: 'product',
          targetKey: `product:${CAMPAIGN_WITHOUT_MEMBERS}:rollup`,
          campaignName: CAMPAIGN_WITHOUT_MEMBERS,
          externalId: `product::${CAMPAIGN_WITHOUT_MEMBERS}::::::30개`,
          spend: 49_358,
          revenue: 335_830,
        },
        // --- Layer 2: individual product rows of CAMPAIGN_WITH_MEMBERS.
        // Their metrics are already inside the rollup above. ---
        {
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          businessDate,
          targetType: 'product',
          targetKey: `product:${CAMPAIGN_WITH_MEMBERS}:94878673640`,
          campaignName: CAMPAIGN_WITH_MEMBERS,
          externalOptionId: '94878673640',
          externalId: '94878673640',
          spend: 11_556,
          revenue: 20_000,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          businessDate,
          targetType: 'product',
          targetKey: `product:${CAMPAIGN_WITH_MEMBERS}:92548632917`,
          campaignName: CAMPAIGN_WITH_MEMBERS,
          externalOptionId: '92548632917',
          externalId: '92548632917',
          spend: 3_600,
          revenue: 9_700,
        },
      ],
    });
  });

  it('excludes campaign rollup rows from product-grain sums', async () => {
    const rows = await adapter.findProductTargetRollups(
      TEST_ORGANIZATION_ID,
      '7d',
    );
    const spend = rows.reduce((sum, row) => sum + row.spend, 0);

    expect(rows).toHaveLength(2);
    expect(spend).toBe(MEMBER_SPEND_TOTAL);
    // The double-counted total the bug produced must never come back.
    expect(spend).not.toBe(ROLLUP_SPEND_TOTAL + MEMBER_SPEND_TOTAL);
    expect(rows.every((row) => row.externalOptionId !== null)).toBe(true);
  });

  it('reads legacy campaign rollups that were stored as target_type product', async () => {
    const rows = await adapter.findCampaignRollups(TEST_ORGANIZATION_ID, '7d');
    const spend = rows.reduce((sum, row) => sum + row.spend, 0);

    expect(rows).toHaveLength(2);
    expect(spend).toBe(ROLLUP_SPEND_TOTAL);
    expect(rows.map((row) => row.campaignName).sort()).toEqual(
      [CAMPAIGN_WITH_MEMBERS, CAMPAIGN_WITHOUT_MEMBERS].sort(),
    );
  });

  it('honours an explicit grain stamp over identity evidence', async () => {
    // A stamped campaign row that (unusually) also carries an option id must
    // still be treated as campaign grain, so the stamp stays authoritative.
    await prisma.channelAdTargetDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        businessDate,
        targetType: 'product',
        targetKey: 'product:stamped:campaign-grain',
        campaignName: '스탬프 캠페인',
        externalOptionId: '99999999999',
        spend: 7_000,
        revenue: 1_000,
        metaJson: {
          source: 'advertising.campaign.target',
          data: { granularity: 'campaign' },
        },
      },
    });

    const productRows = await adapter.findProductTargetRollups(
      TEST_ORGANIZATION_ID,
      '7d',
    );
    const campaignRows = await adapter.findCampaignRollups(
      TEST_ORGANIZATION_ID,
      '7d',
    );

    expect(productRows.reduce((sum, row) => sum + row.spend, 0)).toBe(
      MEMBER_SPEND_TOTAL,
    );
    expect(campaignRows.reduce((sum, row) => sum + row.spend, 0)).toBe(
      ROLLUP_SPEND_TOTAL + 7_000,
    );
  });

  it('keeps another organization out of both reads', async () => {
    const rows = await adapter.findProductTargetRollups(
      '00000000-0000-4000-8000-000000000999',
      '7d',
    );
    expect(rows).toHaveLength(0);
  });
});
