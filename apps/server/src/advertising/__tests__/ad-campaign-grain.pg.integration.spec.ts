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

  /**
   * Regression: one campaign accumulates several `target_key` values because the
   * scraper's identity scheme changed underneath it. Grouping by `target_key`
   * listed the same campaign two or three times — once with real numbers and
   * again as an all-zero row.
   *
   * Live 2026-07-20, `매출 TOP 제품` alone held:
   *   product:매출 TOP 제품:product::매출 TOP 제품::::::30개   (real numbers)
   *   account:<uuid>:campaign:name:매출 TOP 제품               (all zero)
   * and `AI스마트광고(wing)` held a third, `campaign:href:.../dashboard/sales`.
   */
  it('merges one campaign spread across several target_key schemes into one row', async () => {
    // Same campaign, same day, written under the two later identity schemes.
    // The zero row is what a failed background sweep leaves behind.
    await prisma.channelAdTargetDailySnapshot.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          businessDate,
          targetType: 'campaign',
          targetKey: `account:11111111-1111-4111-8111-111111111111:campaign:name:${CAMPAIGN_WITHOUT_MEMBERS}`,
          campaignName: CAMPAIGN_WITHOUT_MEMBERS,
          spend: 0,
          revenue: 0,
          impressions: 0,
          clicks: 0,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          businessDate,
          targetType: 'campaign',
          targetKey:
            'campaign:href:https://advertising.coupang.com/marketing/dashboard/sales',
          campaignName: CAMPAIGN_WITH_MEMBERS,
          spend: 0,
          revenue: 0,
          impressions: 0,
          clicks: 0,
        },
      ],
    });

    const rows = await adapter.findCampaignRollups(TEST_ORGANIZATION_ID, '7d');
    const names = rows.map((row) => row.campaignName);

    // One row per campaign, not one row per identity scheme.
    expect(names).toHaveLength(new Set(names).size);
    expect(names.sort()).toEqual(
      [CAMPAIGN_WITH_MEMBERS, CAMPAIGN_WITHOUT_MEMBERS].sort(),
    );

    // The all-zero duplicate must not dilute or double the real numbers.
    expect(rows.reduce((sum, row) => sum + row.spend, 0)).toBe(
      ROLLUP_SPEND_TOTAL,
    );
    const topProduct = rows.find(
      (row) => row.campaignName === CAMPAIGN_WITHOUT_MEMBERS,
    );
    expect(topProduct?.spend).toBe(49_358);
  });

  /**
   * Regression: a re-collection that produced real numbers must beat an
   * all-zero row already stored for the same campaign and day. Summing the two
   * would be equally wrong — they describe the same Coupang row.
   */
  it('prefers the best-evidenced row when one campaign-day has several rows', async () => {
    await prisma.channelAdTargetDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        businessDate,
        targetType: 'campaign',
        targetKey: `account:2222:campaign:name:${CAMPAIGN_WITHOUT_MEMBERS}`,
        campaignName: CAMPAIGN_WITHOUT_MEMBERS,
        spend: 0,
        revenue: 0,
        impressions: 0,
        clicks: 0,
      },
    });

    const rows = await adapter.findCampaignRollups(TEST_ORGANIZATION_ID, '7d');
    const topProduct = rows.find(
      (row) => row.campaignName === CAMPAIGN_WITHOUT_MEMBERS,
    );

    // 49,358 (the real row) — not 0 (zero row won) and not 49,358 summed twice.
    expect(topProduct?.spend).toBe(49_358);
    expect(topProduct?.revenue).toBe(335_830);
  });

  /**
   * Regression: the per-campaign product detail table must list only the
   * campaign's member products. The campaign's own rollup row also carries
   * `target_type = 'product'`, so without the grain filter the campaign would
   * appear as one of its own products and double the totals.
   */
  it('scopes product rows to one campaign without leaking its rollup row', async () => {
    const rows = await adapter.findProductTargetRollups(
      TEST_ORGANIZATION_ID,
      '7d',
      CAMPAIGN_WITH_MEMBERS,
    );

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.campaignName === CAMPAIGN_WITH_MEMBERS)).toBe(
      true,
    );
    // Every returned row is a real product, never the campaign rollup.
    expect(rows.every((row) => row.externalOptionId !== null)).toBe(true);
    expect(rows.reduce((sum, row) => sum + row.spend, 0)).toBe(
      MEMBER_SPEND_TOTAL,
    );
  });

  it('returns no product rows for a campaign whose detail grid was never swept', async () => {
    const rows = await adapter.findProductTargetRollups(
      TEST_ORGANIZATION_ID,
      '7d',
      CAMPAIGN_WITHOUT_MEMBERS,
    );

    // Live: only `쿠팡윙 집중광고` has product rows. The UI must say "not
    // collected" here rather than render the campaign rollup as a product.
    expect(rows).toHaveLength(0);
  });

  /**
   * Regression: the Coupang campaign dashboard grid has no conversion-count
   * column, so every campaign-grain row lands with `conversions = 0` even when
   * revenue is real. Reporting that as a hard 0 invented a metric.
   */
  it('reports campaign conversions as unobserved unless a row stamped the column', async () => {
    const before = await adapter.findCampaignRollups(TEST_ORGANIZATION_ID, '7d');
    expect(before.every((row) => row.conversionsObserved === false)).toBe(true);

    await prisma.channelAdTargetDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        businessDate,
        targetType: 'campaign',
        targetKey: 'account:3333:campaign:name:전환관측 캠페인',
        campaignName: '전환관측 캠페인',
        spend: 1_000,
        revenue: 5_000,
        conversions: 3,
        metaJson: {
          source: 'advertising.campaign.target',
          data: { granularity: 'campaign', conversionsObserved: true },
        },
      },
    });

    const after = await adapter.findCampaignRollups(TEST_ORGANIZATION_ID, '7d');
    const stamped = after.find(
      (row) => row.campaignName === '전환관측 캠페인',
    );
    expect(stamped?.conversionsObserved).toBe(true);
    expect(stamped?.conversions).toBe(3);
  });
});
