// Account/store-level KPI persistence helper.
//
// Lives apart from `channel-daily-fact.persistence` because the table has
// no metaJson column (cross-source preservation isn't needed — the unique
// key already includes `source` + `kpiType`, so each logical caller writes
// to its own row).

import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';

export interface UpsertAccountKpiInput {
  companyId: string;
  channel: string;
  source: string;
  kpiType: string;
  businessDate: Date;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  normalizedJson: Prisma.InputJsonValue;
  rawJson?: Prisma.InputJsonValue | null;
  rawSnapshotId?: string | null;
  observedAt?: Date;
}

/**
 * Upsert account/store-level KPI daily fact (Wing dashboard cards and
 * similar provider KPI surfaces that cannot be attributed to one
 * listing).
 *
 * Idempotent on `(companyId, channel, source, businessDate, kpiType)`.
 * `normalizedJson` is the structured KPI payload reads consume;
 * `rawJson` carries the unmassaged provider blob for audit.
 *
 * On replay both JSON columns are overwritten with the latest scrape
 * values; `sampleCount` increments; `lastObservedAt` advances;
 * `firstObservedAt` is preserved.
 */
export async function upsertChannelAccountKpi(
  prisma: PrismaService,
  input: UpsertAccountKpiInput,
): Promise<{ id: string }> {
  const observedAt = input.observedAt ?? new Date();
  const rawJsonValue =
    input.rawJson === undefined || input.rawJson === null
      ? Prisma.DbNull
      : input.rawJson;

  return prisma.channelAccountDailyKpiSnapshot.upsert({
    where: {
      companyId_channel_source_businessDate_kpiType: {
        companyId: input.companyId,
        channel: input.channel,
        source: input.source,
        businessDate: input.businessDate,
        kpiType: input.kpiType,
      },
    },
    create: {
      companyId: input.companyId,
      channel: input.channel,
      source: input.source,
      kpiType: input.kpiType,
      businessDate: input.businessDate,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      normalizedJson: input.normalizedJson,
      rawJson: rawJsonValue,
      rawSnapshotId: input.rawSnapshotId ?? null,
      sampleCount: 1,
      firstObservedAt: observedAt,
      lastObservedAt: observedAt,
    },
    update: {
      sampleCount: { increment: 1 },
      lastObservedAt: observedAt,
      normalizedJson: input.normalizedJson,
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
