// `ChannelAdTargetDailySnapshot` upsert adapter.
//
// Idempotent on `(organizationId, channel, businessDate, targetType, targetKey)`.
// Overwrite-on-replay metric semantics; namespaced metaJson merge.

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  AdTargetDailyMetrics,
  ChannelTargetDailyRepositoryPort,
  UpsertAdTargetDailyInput,
} from '../../../application/port/out/repository/channel-target-daily.repository.port';
import {
  buildNamespacedMetaForCreate,
  mergeNamespacedMetaJson,
  pickObservedFields,
  spreadMetricsForCreate,
  spreadMetricsForUpdate,
} from './daily-fact-helpers';
import { withAdIngestRepositoryTransaction } from '../transaction/ad-ingest-transaction-context';

const AD_TARGET_METRIC_KEYS: ReadonlyArray<keyof AdTargetDailyMetrics> = [
  'spend',
  'revenue',
  'impressions',
  'clicks',
  'conversions',
  'orders',
  'adSpend',
  'adRevenue',
];

const AD_TARGET_DESCRIPTOR_KEYS: ReadonlyArray<
  keyof Pick<
    UpsertAdTargetDailyInput,
    | 'campaignId'
    | 'campaignName'
    | 'adGroup'
    | 'keyword'
    | 'placement'
    | 'status'
    | 'onOff'
    | 'currentBid'
    | 'dailyBudget'
    | 'listingId'
    | 'listingOptionId'
    | 'externalId'
    | 'externalOptionId'
  >
> = [
  'campaignId',
  'campaignName',
  'adGroup',
  'keyword',
  'placement',
  'status',
  'onOff',
  'currentBid',
  'dailyBudget',
  'listingId',
  'listingOptionId',
  'externalId',
  'externalOptionId',
];

@Injectable()
export class ChannelTargetDailyRepositoryAdapter
  implements ChannelTargetDailyRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: UpsertAdTargetDailyInput): Promise<{ id: string }> {
    if (!input.targetKey || input.targetKey.trim().length === 0) {
      throw new Error(
        'ChannelTargetDailyRepositoryAdapter.upsert: targetKey must be a non-empty deterministic string',
      );
    }
    const observedAt = input.observedAt ?? new Date();
    const metaJsonForCreate = buildNamespacedMetaForCreate(input.metaJson);
    const metricsCreate = spreadMetricsForCreate(
      input,
      AD_TARGET_METRIC_KEYS,
    );
    const metricsUpdate = spreadMetricsForUpdate(
      input,
      AD_TARGET_METRIC_KEYS,
    );
    const observedDescriptors = pickObservedFields(
      input,
      AD_TARGET_DESCRIPTOR_KEYS,
    );

    return withAdIngestRepositoryTransaction(this.prisma, async (tx) => {
      const row = await tx.channelAdTargetDailySnapshot.upsert({
        where: {
          organizationId_channel_businessDate_targetType_targetKey: {
            organizationId: input.organizationId,
            channel: input.channel,
            businessDate: input.businessDate,
            targetType: input.targetType,
            targetKey: input.targetKey,
          },
        },
        create: {
          organizationId: input.organizationId,
          channel: input.channel,
          businessDate: input.businessDate,
          targetType: input.targetType,
          targetKey: input.targetKey,
          listingId: input.listingId ?? null,
          listingOptionId: input.listingOptionId ?? null,
          externalId: input.externalId ?? null,
          externalOptionId: input.externalOptionId ?? null,
          campaignId: input.campaignId ?? null,
          campaignName: input.campaignName ?? null,
          adGroup: input.adGroup ?? null,
          keyword: input.keyword ?? null,
          placement: input.placement ?? null,
          status: input.status ?? null,
          onOff: input.onOff ?? null,
          currentBid: input.currentBid ?? null,
          dailyBudget: input.dailyBudget ?? null,
          rawSnapshotId: input.rawSnapshotId ?? null,
          metaJson: metaJsonForCreate,
          sampleCount: 1,
          firstObservedAt: observedAt,
          lastObservedAt: observedAt,
          ...metricsCreate,
        },
        update: {
          sampleCount: { increment: 1 },
          lastObservedAt: observedAt,
          ...(input.rawSnapshotId !== undefined
            ? { rawSnapshotId: input.rawSnapshotId }
            : {}),
          ...(input.metaJson === null ? { metaJson: Prisma.DbNull } : {}),
          ...observedDescriptors,
          ...metricsUpdate,
        },
        select: { id: true },
      });
      await mergeNamespacedMetaJson(
        tx,
        'channel_ad_target_daily_snapshots',
        row.id,
        input.organizationId,
        input.metaJson,
      );
      return row;
    });
  }
}
