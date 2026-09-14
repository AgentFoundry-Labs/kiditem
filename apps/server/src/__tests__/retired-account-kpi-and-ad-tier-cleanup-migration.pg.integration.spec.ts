import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../test-helpers/real-prisma';
import { removeRetiredAccountKpiAndAdTierRowsMigration } from '../../../../scripts/data-migrations/v0.1.31/013_remove_retired_account_kpi_and_ad_tier_rows';

const BUSINESS_DATE = new Date('2026-09-01T00:00:00.000Z');
const RETAINED_SETTING_KEY = 'ads.roas.target';

type Seeded = {
  kpiOnlyRawId: string;
  otherOrganizationKpiOnlyRawId: string;
  listingDayRawId: string;
  optionDayRawId: string;
  adTargetDayRawId: string;
  unrelatedRawId: string;
};

/**
 * v0.1.31:013 runs before the KID-90 `db push` drops
 * `channel_account_daily_kpi_snapshots`. It removes the KPI rows, the raw
 * scrape rows only they used, and the retired `ads.tier.dailyBudget` setting,
 * keeps raw rows a kept daily fact still references, and affects no rows on
 * any later run. The suite runs on either pushed schema: where the KPI table
 * is already gone, its pre-drop shape is recreated for this file only.
 */
describe('v0.1.31:013 remove retired account KPI and ad tier rows (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let recreatedKpiTable = false;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    recreatedKpiTable = !(await kpiTableExists());
    if (recreatedKpiTable) {
      await prisma.$executeRaw`
        CREATE TABLE channel_account_daily_kpi_snapshots (
          id uuid PRIMARY KEY,
          organization_id uuid NOT NULL,
          raw_snapshot_id uuid,
          CONSTRAINT channel_account_daily_kpi_snapshots_raw_snapshot_id_organization_id_fkey
            FOREIGN KEY (raw_snapshot_id, organization_id)
            REFERENCES channel_scrape_snapshots (id, organization_id)
            ON DELETE RESTRICT
        )
      `;
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    // Later suites share this database, so restore the pushed schema shape.
    if (recreatedKpiTable) {
      await prisma.$executeRaw`DROP TABLE IF EXISTS channel_account_daily_kpi_snapshots`;
    }
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('keeps raw rows that kept daily facts reference as the only restricting references', async () => {
    const references = await prisma.$queryRaw<Array<{ table_name: string; on_delete: string }>>`
      SELECT conrelid::regclass::text AS table_name, confdeltype::text AS on_delete
      FROM pg_constraint
      WHERE contype = 'f'
        AND confrelid = 'channel_scrape_snapshots'::regclass
        AND conrelid::regclass::text <> 'channel_account_daily_kpi_snapshots'
      ORDER BY 1
    `;
    // The migration's NOT EXISTS list names exactly these tables.
    expect(references).toEqual([
      { table_name: 'channel_ad_target_daily_snapshots', on_delete: 'r' },
      { table_name: 'channel_listing_daily_snapshots', on_delete: 'r' },
      { table_name: 'channel_listing_option_daily_snapshots', on_delete: 'r' },
    ]);
  });

  it('removes KPI rows, their unshared raw rows and the tier budget setting once', async () => {
    const seeded = await seed();
    const carriedBefore = await carriedCounts();

    await expect(runMigration()).resolves.toEqual({
      affectedRows: 11,
      details: {
        accountKpiTablePresent: true,
        deletedAccountKpiRows: 7,
        accountKpiRawSnapshotRows: 5,
        deletedAccountKpiRawSnapshotRows: 2,
        retainedSharedRawSnapshotRows: 3,
        deletedAdTierDailyBudgetSettingRows: 2,
      },
    });

    const remainingRaw = await prisma.channelScrapeSnapshot.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    expect(remainingRaw.map(({ id }) => id)).toEqual(
      [
        seeded.listingDayRawId,
        seeded.optionDayRawId,
        seeded.adTargetDayRawId,
        seeded.unrelatedRawId,
      ].sort(),
    );
    expect(await kpiRowCount()).toBe(0);
    await expect(prisma.systemSetting.findMany({
      select: { organizationId: true, key: true },
    })).resolves.toEqual([{ organizationId: TEST_ORGANIZATION_ID, key: RETAINED_SETTING_KEY }]);
    await expect(carriedCounts()).resolves.toEqual(carriedBefore);

    const unchanged = {
      affectedRows: 0,
      details: {
        accountKpiTablePresent: true,
        deletedAccountKpiRows: 0,
        accountKpiRawSnapshotRows: 0,
        deletedAccountKpiRawSnapshotRows: 0,
        retainedSharedRawSnapshotRows: 0,
        deletedAdTierDailyBudgetSettingRows: 0,
      },
    };
    await expect(runMigration()).resolves.toEqual(unchanged);

    // After `db push` the KPI table is gone: nothing to read, nothing removed.
    const restore = 'restore channel_account_daily_kpi_snapshots';
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DROP TABLE channel_account_daily_kpi_snapshots`;
      await expect(removeRetiredAccountKpiAndAdTierRowsMigration.run(tx)).resolves.toEqual({
        ...unchanged,
        details: { ...unchanged.details, accountKpiTablePresent: false },
      });
      throw new Error(restore);
    })).rejects.toThrow(restore);
    expect(await kpiTableExists()).toBe(true);
    await expect(prisma.channelScrapeSnapshot.count()).resolves.toBe(4);
  });

  function runMigration() {
    return prisma.$transaction((tx) => removeRetiredAccountKpiAndAdTierRowsMigration.run(tx));
  }

  async function kpiTableExists(): Promise<boolean> {
    const [row] = await prisma.$queryRaw<Array<{ present: boolean }>>`
      SELECT to_regclass('public.channel_account_daily_kpi_snapshots') IS NOT NULL AS present
    `;
    return row?.present === true;
  }

  async function kpiRowCount(): Promise<number> {
    const [row] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM channel_account_daily_kpi_snapshots
    `;
    return Number(row?.count ?? -1);
  }

  async function carriedCounts() {
    const [organizations, users, memberships, channelAccounts, listings, options] = await Promise.all([
      prisma.organization.count(),
      prisma.user.count(),
      prisma.organizationMembership.count(),
      prisma.channelAccount.count(),
      prisma.channelListing.count(),
      prisma.channelListingOption.count(),
    ]);
    return { organizations, users, memberships, channelAccounts, listings, options };
  }

  async function seed(): Promise<Seeded> {
    const account = await prisma.channelAccount.create({
      data: { organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', name: 'KID-90 cleanup account' },
    });
    const otherAccount = await prisma.channelAccount.create({
      data: { organizationId: OTHER_ORGANIZATION_ID, channel: 'coupang', name: 'KID-90 other account' },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'KID90-LISTING',
      },
    });
    const option = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        externalOptionId: 'KID90-OPTION',
      },
    });
    const run = await prisma.channelScrapeRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        channel: 'coupang',
        source: 'coupang_ads',
        pageType: 'dashboard_daily',
        status: 'complete',
      },
    });
    const otherRun = await prisma.channelScrapeRun.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channelAccountId: otherAccount.id,
        channel: 'coupang',
        source: 'coupang_ads',
        pageType: 'dashboard_daily',
        status: 'complete',
      },
    });
    const raw = async (organizationId: string, scrapeRunId: string, label: string) =>
      (await prisma.channelScrapeSnapshot.create({
        data: {
          organizationId,
          scrapeRunId,
          channel: 'coupang',
          source: 'coupang_ads',
          pageType: 'dashboard_daily',
          businessDate: BUSINESS_DATE,
          rawJson: { label },
        },
      })).id;
    const seeded: Seeded = {
      kpiOnlyRawId: await raw(TEST_ORGANIZATION_ID, run.id, 'kpi-only'),
      otherOrganizationKpiOnlyRawId: await raw(OTHER_ORGANIZATION_ID, otherRun.id, 'other-kpi-only'),
      listingDayRawId: await raw(TEST_ORGANIZATION_ID, run.id, 'listing-day'),
      optionDayRawId: await raw(TEST_ORGANIZATION_ID, run.id, 'option-day'),
      adTargetDayRawId: await raw(TEST_ORGANIZATION_ID, run.id, 'ad-target-day'),
      unrelatedRawId: await raw(TEST_ORGANIZATION_ID, run.id, 'unrelated'),
    };

    await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        channel: 'coupang',
        externalId: listing.externalId,
        businessDate: BUSINESS_DATE,
        rawSnapshotId: seeded.listingDayRawId,
      },
    });
    await prisma.channelListingOptionDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        listingOptionId: option.id,
        channel: 'coupang',
        externalId: listing.externalId,
        externalOptionId: option.externalOptionId,
        businessDate: BUSINESS_DATE,
        rawSnapshotId: seeded.optionDayRawId,
      },
    });
    await prisma.channelAdTargetDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        channel: 'coupang',
        businessDate: BUSINESS_DATE,
        targetType: 'campaign',
        targetKey: 'campaign:kid90',
        rawSnapshotId: seeded.adTargetDayRawId,
      },
    });

    const kpiRows: Array<{ organizationId: string; accountId: string; rawSnapshotId: string | null }> = [
      { organizationId: TEST_ORGANIZATION_ID, accountId: account.id, rawSnapshotId: seeded.kpiOnlyRawId },
      { organizationId: TEST_ORGANIZATION_ID, accountId: account.id, rawSnapshotId: seeded.kpiOnlyRawId },
      { organizationId: TEST_ORGANIZATION_ID, accountId: account.id, rawSnapshotId: seeded.listingDayRawId },
      { organizationId: TEST_ORGANIZATION_ID, accountId: account.id, rawSnapshotId: seeded.optionDayRawId },
      { organizationId: TEST_ORGANIZATION_ID, accountId: account.id, rawSnapshotId: seeded.adTargetDayRawId },
      { organizationId: TEST_ORGANIZATION_ID, accountId: account.id, rawSnapshotId: null },
      {
        organizationId: OTHER_ORGANIZATION_ID,
        accountId: otherAccount.id,
        rawSnapshotId: seeded.otherOrganizationKpiOnlyRawId,
      },
    ];
    for (const [index, row] of kpiRows.entries()) {
      await insertKpiRow(row, `coupang_ads_daily_${index}`);
    }

    await prisma.systemSetting.createMany({
      data: [
        { organizationId: TEST_ORGANIZATION_ID, key: 'ads.tier.dailyBudget', value: { '1차': 150000 } },
        { organizationId: OTHER_ORGANIZATION_ID, key: 'ads.tier.dailyBudget', value: { '2차': 100000 } },
        { organizationId: TEST_ORGANIZATION_ID, key: RETAINED_SETTING_KEY, value: 3 },
      ],
    });
    return seeded;
  }

  async function insertKpiRow(
    row: { organizationId: string; accountId: string; rawSnapshotId: string | null },
    kpiType: string,
  ): Promise<void> {
    const id = randomUUID();
    if (recreatedKpiTable) {
      await prisma.$executeRaw`
        INSERT INTO channel_account_daily_kpi_snapshots (id, organization_id, raw_snapshot_id)
        VALUES (${id}::uuid, ${row.organizationId}::uuid, ${row.rawSnapshotId}::uuid)
      `;
      return;
    }
    await prisma.$executeRaw`
      INSERT INTO channel_account_daily_kpi_snapshots (
        id, organization_id, channel_account_id, channel, source, kpi_type,
        business_date, normalized_json, raw_snapshot_id, updated_at
      )
      VALUES (
        ${id}::uuid, ${row.organizationId}::uuid, ${row.accountId}::uuid, 'coupang', 'coupang_ads',
        ${kpiType}, DATE '2026-09-01', '{}'::jsonb, ${row.rawSnapshotId}::uuid, now()
      )
    `;
  }
});
