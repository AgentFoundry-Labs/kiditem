// Account/store-level KPI persistence + read. Combines what used to live
// across `ad-account-kpi.query.ts` and `channel-account-kpi.persistence.ts`
// because both target the `ChannelAccountDailyKpiSnapshot` aggregate.
//
// Daily-fact metric semantics: `normalizedJson.conversions` carries Coupang's
// attributed selling-unit count (`adAttributedUnits`); CVR computation
// downstream uses `orders` (`adAttributedOrders`) instead.

import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { periodBounds } from '../../../domain/ad-metrics';
import {
  AD_ACCOUNT_DAILY_KPI_READ_PORT,
  type AdAccountDailyKpiReadPort,
} from '../../../application/port/in/ad-account-daily-kpi-source.port';
import { adIngestRepositoryClient } from './ad-ingest-transaction-context';
import type { AdPeriod } from '../../../domain/ad-metrics';
import type {
  AdAccountKpiDayRow,
  AdAccountKpiRepositoryPort,
  UpsertAccountKpiInput,
} from '../../../application/port/out/repository/ad-account-kpi.repository.port';

@Injectable()
export class AdAccountKpiRepositoryAdapter
  implements AdAccountKpiRepositoryPort
{
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AD_ACCOUNT_DAILY_KPI_READ_PORT)
    private readonly dailyKpiRead: AdAccountDailyKpiReadPort,
  ) {}

  async findCoupangAdsDaily(
    organizationId: string,
    period: AdPeriod,
    dateRange?: { from: Date; to: Date },
  ): Promise<AdAccountKpiDayRow[]> {
    const bounds = dateRange ?? periodBounds(period);
    if (bounds.from.getTime() > bounds.to.getTime()) return [];

    const published = await this.dailyKpiRead.readPublished({
      organizationId,
      from: bounds.from.toISOString().slice(0, 10),
      to: bounds.to.toISOString().slice(0, 10),
    });
    return published.rows.map((row) => ({
      businessDate: row.businessDate,
      sums: {
        spend: row.normalized.adSpend,
        revenue: row.normalized.adRevenue,
        clicks: row.normalized.clicks,
        impressions: row.normalized.impressions,
        conversions: row.normalized.orders,
      },
      orders: row.normalized.orders,
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

    return adIngestRepositoryClient(this.prisma).channelAccountDailyKpiSnapshot.upsert({
      where: {
        organizationId_channelAccountId_source_businessDate_kpiType: {
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          source: input.source,
          businessDate: input.businessDate,
          kpiType: input.kpiType,
        },
      },
      create: {
        organizationId: input.organizationId,
        channelAccountId: input.channelAccountId,
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
