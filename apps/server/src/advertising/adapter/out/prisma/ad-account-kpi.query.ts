import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { AdMetricSums, AdPeriod } from '../../../domain/ad-metrics';
import { periodCutoff } from '../../../domain/ad-metrics';

/**
 * Per-day Coupang ads dashboard daily aggregate row.
 *
 * Source: `ChannelAccountDailyKpiSnapshot.normalizedJson` for
 * `(source='coupang_ads', kpiType='coupang_ads_daily')`. The handler that
 * writes these rows is `coupang-ads-daily-ingest.handler.ts` — it stores the
 * additive numerators (`adSpend`, `adRevenue`, `clicks`, `impressions`,
 * `conversions`, `orders`) and keeps provider ratios in audit fields. Reads
 * recompute ratios from sums via `domain/ad-metrics`.
 */
export type AdAccountKpiDayRow = {
  businessDate: string;
  sums: AdMetricSums;
  orders: number;
};

/**
 * Read `coupang_ads_daily` account-level daily aggregates over the period
 * cutoff. Tenant scope binds `organizationId`; the handler writes one row
 * per business date so the array is at most ~period-days long.
 */
export async function findCoupangAdsDailyAccountKpi(
  prisma: PrismaService,
  organizationId: string,
  period: AdPeriod,
): Promise<AdAccountKpiDayRow[]> {
  const cutoff = periodCutoff(period);
  const rows = await prisma.$queryRaw<
    Array<{
      businessDate: Date;
      adSpend: number | null;
      adRevenue: number | null;
      clicks: number | null;
      impressions: number | null;
      conversions: number | null;
      orders: number | null;
    }>
  >(Prisma.sql`
    SELECT
      business_date                                              AS "businessDate",
      (normalized_json->>'adSpend')::int                          AS "adSpend",
      (normalized_json->>'adRevenue')::int                        AS "adRevenue",
      (normalized_json->>'clicks')::int                           AS "clicks",
      (normalized_json->>'impressions')::int                      AS "impressions",
      (normalized_json->>'conversions')::int                      AS "conversions",
      (normalized_json->>'orders')::int                           AS "orders"
    FROM channel_account_daily_kpi_snapshots
    WHERE organization_id = ${organizationId}::uuid
      AND source = 'coupang_ads'
      AND kpi_type = 'coupang_ads_daily'
      AND business_date >= ${cutoff}
    ORDER BY business_date ASC
  `);
  // `coupang_ads_daily.normalized_json.conversions` carries the conversion
  // *revenue* in KRW (not a count) — the provider exposes the order count
  // separately as `orders`, and the provider's own conversionRate equals
  // orders / clicks. CVR computation needs a count, so we use `orders` as
  // the truthful conversion count here. The raw `conversions` (revenue)
  // remains in `normalized_json` for audit.
  return rows.map((row) => ({
    businessDate: row.businessDate.toISOString().slice(0, 10),
    sums: {
      spend: row.adSpend ?? 0,
      revenue: row.adRevenue ?? 0,
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      conversions: row.orders ?? 0,
    },
    orders: row.orders ?? 0,
  }));
}
