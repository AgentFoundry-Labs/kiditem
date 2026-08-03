import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ProfitabilityAdRefreshRepositoryPort,
} from '../../../application/port/out/repository/profitability-ad-refresh.repository.port';

@Injectable()
export class ProfitabilityAdRefreshRepositoryAdapter
implements ProfitabilityAdRefreshRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findClaimedRun(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
  }) {
    const run = await this.prisma.operationRun.findFirst({
      where: {
        id: input.operationRunId,
        organizationId: input.organizationId,
        operationKey: 'advertising.refresh_profitability_spend',
        engineType: 'browser',
        status: 'running',
        attemptToken: input.attemptToken,
      },
      select: { startedAt: true },
    });
    return run?.startedAt ? { startedAt: run.startedAt } : null;
  }

  countActiveListings(organizationId: string) {
    return this.prisma.channelListing.count({
      where: {
        organizationId,
        isActive: true,
        masterProductId: { not: null },
        channelAccount: {
          is: { organizationId, channel: 'coupang', status: 'active' },
        },
      },
    });
  }

  listTargets(organizationId: string) {
    return this.prisma.scrapeTarget.findMany({
      where: { organizationId, isActive: true, category: 'advertising' },
      select: { id: true, url: true, label: true, category: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listCoverageDays(input: {
    organizationId: string;
    startDate: Date;
    endDate: Date;
  }) {
    const rows = await this.prisma.$queryRaw<Array<{
      businessDate: Date;
      authoritativeListingCount: bigint;
      oldestObservedAt: Date;
    }>>(Prisma.sql`
      SELECT
        snapshot.business_date AS "businessDate",
        COUNT(*)::bigint AS "authoritativeListingCount",
        MIN(snapshot.ad_observed_at) AS "oldestObservedAt"
      FROM channel_listing_daily_snapshots snapshot
      JOIN channel_listings listing
        ON listing.id = snapshot.listing_id
       AND listing.organization_id = snapshot.organization_id
      JOIN channel_accounts account
        ON account.id = listing.channel_account_id
       AND account.organization_id = listing.organization_id
      WHERE snapshot.organization_id = ${input.organizationId}::uuid
        AND snapshot.business_date BETWEEN ${input.startDate}::date AND ${input.endDate}::date
        AND snapshot.ad_coverage_status IN ('OBSERVED', 'CONFIRMED_ZERO')
        AND snapshot.ad_observed_at IS NOT NULL
        AND listing.is_active = true
        AND listing.master_product_id IS NOT NULL
        AND account.channel = 'coupang'
        AND account.status = 'active'
      GROUP BY snapshot.business_date
      ORDER BY snapshot.business_date ASC
    `);
    return rows.map((row) => ({
      businessDate: row.businessDate,
      authoritativeListingCount: Number(row.authoritativeListingCount),
      oldestObservedAt: row.oldestObservedAt,
    }));
  }

  async replaceReportSlice(input: {
    organizationId: string;
    collectionRunId: string;
    advertiserId: string;
    startDate: Date;
    endDate: Date;
    report: import('../../../application/port/in/profitability-ad-refresh.port').ProfitabilityAdReportSlice;
    observedAt: Date;
  }) {
    const accounts = await this.prisma.channelAccount.findMany({
      where: {
        organizationId: input.organizationId,
        channel: 'coupang',
        status: 'active',
        OR: [
          { vendorId: input.advertiserId },
          { externalAccountId: input.advertiserId },
        ],
      },
      select: { id: true },
      take: 2,
    });
    if (accounts.length !== 1) {
      throw new UnprocessableEntityException(
        accounts.length === 0
          ? 'profitability_ad_account_not_found'
          : 'profitability_ad_account_ambiguous',
      );
    }
    const accountId = accounts[0]!.id;
    const externalOptionIds = [...new Set(input.report.rows.map((row) => row.externalOptionId))];
    const options = externalOptionIds.length === 0
      ? []
      : await this.prisma.channelListingOption.findMany({
          where: {
            organizationId: input.organizationId,
            externalOptionId: { in: externalOptionIds },
            isActive: true,
            listing: {
              is: {
                organizationId: input.organizationId,
                channelAccountId: accountId,
                isActive: true,
              },
            },
          },
          select: {
            id: true,
            listingId: true,
            externalOptionId: true,
            listing: { select: { externalId: true } },
          },
        });
    const optionGroups = new Map<string, typeof options>();
    for (const option of options) {
      const group = optionGroups.get(option.externalOptionId) ?? [];
      group.push(option);
      optionGroups.set(option.externalOptionId, group);
    }
    const optionByExternalId = new Map(
      [...optionGroups.entries()]
        .filter(([, rows]) => rows.length === 1)
        .map(([externalOptionId, rows]) => [externalOptionId, rows[0]!] as const),
    );
    const matchedRows = input.report.rows.filter((row) => optionByExternalId.has(row.externalOptionId));
    const targetRows = matchedRows.map((row) => {
      const option = optionByExternalId.get(row.externalOptionId)!;
      return {
        organizationId: input.organizationId,
        channelAccountId: accountId,
        channel: 'coupang',
        businessDate: calendarDate(row.businessDate),
        listingId: option.listingId,
        listingOptionId: option.id,
        externalId: option.listing.externalId,
        externalOptionId: row.externalOptionId,
        targetType: 'product',
        targetKey: `profitability-report:${row.externalOptionId}`,
        spend: row.adSpend,
        revenue: row.adRevenue,
        impressions: row.impressions,
        clicks: row.clicks,
        conversions: row.conversions,
        orders: row.orders,
        adSpend: row.adSpend,
        adRevenue: row.adRevenue,
        metaJson: {
          source: 'advertising.profitability_product_daily_report',
          collectionRunId: input.collectionRunId,
        },
        firstObservedAt: input.observedAt,
        lastObservedAt: input.observedAt,
        createdAt: input.observedAt,
        updatedAt: input.observedAt,
      };
    });
    const unmatchedRowCount = input.report.rows.length - matchedRows.length;

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.channelScrapeRun.findFirst({
        where: {
          organizationId: input.organizationId,
          channelAccountId: accountId,
          source: 'advertising',
          clientRunKey: input.collectionRunId,
          status: 'complete',
        },
        select: { rowCount: true, matchedCount: true, unmatchedCount: true },
      });
      if (existing) {
        return {
          matchedRowCount: existing.matchedCount,
          unmatchedRowCount: existing.unmatchedCount,
          publishedTargetCount: targetRows.length,
        };
      }

      await tx.channelAdTargetDailySnapshot.deleteMany({
        where: {
          organizationId: input.organizationId,
          channelAccountId: accountId,
          channel: 'coupang',
          targetType: 'product',
          businessDate: { gte: input.startDate, lte: input.endDate },
        },
      });
      if (targetRows.length > 0) {
        await tx.channelAdTargetDailySnapshot.createMany({ data: targetRows });
      }
      await tx.channelScrapeRun.create({
        data: {
          organizationId: input.organizationId,
          channelAccountId: accountId,
          clientRunKey: input.collectionRunId,
          channel: 'coupang',
          source: 'advertising',
          pageType: 'campaign',
          periodStart: input.startDate,
          periodEnd: input.endDate,
          status: 'complete',
          targetUrl: 'https://advertising.coupang.com/marketing-reporting/billboard/reports/pa',
          period: 'custom',
          parserVersion: 'profitability-report-v1',
          rowCount: input.report.collectedRowCount,
          matchedCount: matchedRows.length,
          unmatchedCount: unmatchedRowCount,
          errorCount: 0,
          startedAt: input.observedAt,
          finishedAt: input.observedAt,
          metaJson: {
            collectionRunId: input.collectionRunId,
            advertiserId: input.advertiserId,
            campaignCount: input.report.campaignCount,
            expectedRowCount: input.report.expectedRowCount,
            collectedRowCount: input.report.collectedRowCount,
            reportPeriodType: 'daily',
            reportStructure: 'campaign_adgroup_product',
            campaignSweepComplete: true,
            campaignIdentityComplete: true,
            campaignDailyCollectionComplete: true,
            campaignDailyFrom: calendarDateString(input.startDate),
            campaignDailyTo: calendarDateString(input.endDate),
          },
        },
      });
      return {
        matchedRowCount: matchedRows.length,
        unmatchedRowCount,
        publishedTargetCount: targetRows.length,
      };
    });
  }

  async hasCompleteCollectionMarker(input: {
    organizationId: string;
    collectionRunId: string;
    startedAt: Date;
    startDate: string;
    endDate: string;
    expectedTargetCount: number;
  }): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ markerCount: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "markerCount"
      FROM channel_scrape_runs
      WHERE organization_id = ${input.organizationId}::uuid
        AND source = 'advertising'
        AND page_type = 'campaign'
        AND status = 'complete'
        AND started_at >= ${input.startedAt}
        AND meta_json ->> 'collectionRunId' = ${input.collectionRunId}
        AND meta_json ->> 'campaignSweepComplete' = 'true'
        AND meta_json ->> 'campaignIdentityComplete' = 'true'
        AND meta_json ->> 'campaignDailyCollectionComplete' = 'true'
        AND meta_json ->> 'campaignDailyFrom' = ${input.startDate}
        AND meta_json ->> 'campaignDailyTo' = ${input.endDate}
    `);
    return Number(rows[0]?.markerCount ?? 0n) >= input.expectedTargetCount;
  }

  async publishSlice(input: {
    organizationId: string;
    startDate: Date;
    endDate: Date;
    observedAt: Date;
  }): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ publishedCount: bigint }>>(Prisma.sql`
      WITH active_listings AS (
        SELECT cl.id, cl.organization_id, ca.channel, cl.external_id
        FROM channel_listings cl
        JOIN channel_accounts ca
          ON ca.id = cl.channel_account_id
         AND ca.organization_id = cl.organization_id
        WHERE cl.organization_id = ${input.organizationId}::uuid
          AND cl.is_active = true
          AND cl.master_product_id IS NOT NULL
          AND ca.channel = 'coupang'
          AND ca.status = 'active'
      ),
      dates AS (
        SELECT day::date AS business_date
        FROM generate_series(
          ${input.startDate}::date,
          ${input.endDate}::date,
          interval '1 day'
        ) day
      ),
      target_totals AS (
        SELECT
          listing_id,
          business_date,
          SUM(ad_spend)::int AS ad_spend,
          SUM(ad_revenue)::int AS ad_revenue,
          SUM(impressions)::int AS ad_impressions,
          SUM(clicks)::int AS ad_clicks,
          SUM(conversions)::int AS ad_conversions,
          SUM(orders)::int AS ad_orders
        FROM channel_ad_target_daily_snapshots
        WHERE organization_id = ${input.organizationId}::uuid
          AND target_type = 'product'
          AND listing_id IS NOT NULL
          AND business_date BETWEEN ${input.startDate}::date AND ${input.endDate}::date
        GROUP BY listing_id, business_date
      ),
      published AS (
        INSERT INTO channel_listing_daily_snapshots (
          id,
          organization_id,
          listing_id,
          channel,
          external_id,
          business_date,
          ad_spend,
          ad_revenue,
          ad_impressions,
          ad_clicks,
          ad_conversions,
          ad_orders,
          ad_coverage_status,
          ad_observed_at,
          first_observed_at,
          last_observed_at,
          sample_count,
          created_at,
          updated_at
        )
        SELECT
          gen_random_uuid(),
          listing.organization_id,
          listing.id,
          listing.channel,
          listing.external_id,
          dates.business_date,
          COALESCE(totals.ad_spend, 0),
          COALESCE(totals.ad_revenue, 0),
          COALESCE(totals.ad_impressions, 0),
          COALESCE(totals.ad_clicks, 0),
          COALESCE(totals.ad_conversions, 0),
          COALESCE(totals.ad_orders, 0),
          CASE WHEN
            COALESCE(totals.ad_spend, 0) <> 0
            OR COALESCE(totals.ad_revenue, 0) <> 0
            OR COALESCE(totals.ad_impressions, 0) <> 0
            OR COALESCE(totals.ad_clicks, 0) <> 0
            OR COALESCE(totals.ad_conversions, 0) <> 0
            OR COALESCE(totals.ad_orders, 0) <> 0
          THEN 'OBSERVED' ELSE 'CONFIRMED_ZERO' END,
          ${input.observedAt},
          ${input.observedAt},
          ${input.observedAt},
          1,
          ${input.observedAt},
          ${input.observedAt}
        FROM active_listings listing
        CROSS JOIN dates
        LEFT JOIN target_totals totals
          ON totals.listing_id = listing.id
         AND totals.business_date = dates.business_date
        ON CONFLICT (organization_id, listing_id, business_date)
        DO UPDATE SET
          ad_spend = EXCLUDED.ad_spend,
          ad_revenue = EXCLUDED.ad_revenue,
          ad_impressions = EXCLUDED.ad_impressions,
          ad_clicks = EXCLUDED.ad_clicks,
          ad_conversions = EXCLUDED.ad_conversions,
          ad_orders = EXCLUDED.ad_orders,
          ad_coverage_status = EXCLUDED.ad_coverage_status,
          ad_observed_at = EXCLUDED.ad_observed_at,
          last_observed_at = GREATEST(
            channel_listing_daily_snapshots.last_observed_at,
            EXCLUDED.last_observed_at
          ),
          sample_count = channel_listing_daily_snapshots.sample_count + 1,
          updated_at = EXCLUDED.updated_at
        RETURNING 1
      )
      SELECT COUNT(*)::bigint AS "publishedCount" FROM published
    `);
    return Number(rows[0]?.publishedCount ?? 0n);
  }
}

function calendarDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function calendarDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}
