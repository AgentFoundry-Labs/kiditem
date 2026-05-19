// Account/store-level KPI persistence + read. Combines what used to live
// across `ad-account-kpi.query.ts` and `channel-account-kpi.persistence.ts`
// because both target the `ChannelAccountDailyKpiSnapshot` aggregate.
//
// Daily-fact metric semantics: `normalizedJson.conversions` carries the
// conversion *revenue* for `coupang_ads_daily`; CVR computation downstream
// uses `orders` (count) instead.

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { AdPeriod } from '../../../domain/ad-metrics';
import { periodCutoff } from '../../../domain/ad-metrics';
import type {
  AdAccountKpiDayRow,
  AdAccountKpiRepositoryPort,
  UpsertAccountKpiInput,
} from '../../../application/port/out/repository/ad-account-kpi.repository.port';

@Injectable()
export class AdAccountKpiRepositoryAdapter
  implements AdAccountKpiRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async findCoupangAdsDaily(
    organizationId: string,
    period: AdPeriod,
  ): Promise<AdAccountKpiDayRow[]> {
    const cutoff = periodCutoff(period);
    const rows = await this.prisma.$queryRaw<
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

  async upsertAccountKpi(
    input: UpsertAccountKpiInput,
  ): Promise<{ id: string }> {
    const observedAt = input.observedAt ?? new Date();
    const normalizedJson = input.normalizedJson as Prisma.InputJsonValue;
    const rawJsonValue =
      input.rawJson === undefined || input.rawJson === null
        ? Prisma.DbNull
        : (input.rawJson as Prisma.InputJsonValue);

    return this.prisma.channelAccountDailyKpiSnapshot.upsert({
      where: {
        organizationId_channel_source_businessDate_kpiType: {
          organizationId: input.organizationId,
          channel: input.channel,
          source: input.source,
          businessDate: input.businessDate,
          kpiType: input.kpiType,
        },
      },
      create: {
        organizationId: input.organizationId,
        channel: input.channel,
        source: input.source,
        kpiType: input.kpiType,
        businessDate: input.businessDate,
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        normalizedJson,
        rawJson: rawJsonValue,
        rawSnapshotId: input.rawSnapshotId ?? null,
        sampleCount: 1,
        firstObservedAt: observedAt,
        lastObservedAt: observedAt,
      },
      update: {
        sampleCount: { increment: 1 },
        lastObservedAt: observedAt,
        normalizedJson,
        rawJson: rawJsonValue,
        ...(input.periodStart !== undefined
          ? { periodStart: input.periodStart }
          : {}),
        ...(input.periodEnd !== undefined
          ? { periodEnd: input.periodEnd }
          : {}),
        ...(input.rawSnapshotId !== undefined
          ? { rawSnapshotId: input.rawSnapshotId }
          : {}),
      },
      select: { id: true },
    });
  }
}
