// `ChannelAdTargetDailySnapshot` upsert adapter.
//
// Idempotent on `(organizationId, channel, businessDate, targetType, targetKey)`.
// Overwrite-on-replay metric semantics; namespaced metaJson merge.

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  AdTargetDailyMetrics,
  ChannelTargetDailyRepositoryPort,
  ReplaceAdCampaignDayInput,
  UpsertAdTargetDailyInput,
} from '../../../application/port/out/repository/channel-target-daily.repository.port';
import {
  buildNamespacedMetaForCreate,
  mergeNamespacedMetaJson,
  pickObservedFields,
  spreadMetricsForCreate,
  spreadMetricsForUpdate,
} from './daily-fact-helpers';
import { withAdIngestRepositoryTransaction } from './ad-ingest-transaction-context';

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

const CAMPAIGN_REPLACE_CHUNK_SIZE = 250;
const CAMPAIGN_REPLACE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 120_000,
} as const;

@Injectable()
export class ChannelTargetDailyRepositoryAdapter
  implements ChannelTargetDailyRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: UpsertAdTargetDailyInput): Promise<{ id: string }> {
    return withAdIngestRepositoryTransaction(this.prisma, (tx) =>
      this.upsertWithClient(tx, input),
    );
  }

  async replaceCampaignDay(
    input: ReplaceAdCampaignDayInput,
  ): Promise<{ upsertedCount: number; deletedCount: number }> {
    const campaignId = input.campaignId?.trim() || null;
    const campaignIdentity = input.campaignIdentity?.trim() || null;
    const campaignName = input.campaignName.trim();
    if (!campaignId && !campaignIdentity) {
      throw new Error(
        'ChannelTargetDailyRepositoryAdapter.replaceCampaignDay: stable campaignId or campaignIdentity is required',
      );
    }

    const desiredKeys = new Set<string>();
    for (const target of input.targets) {
      if (
        target.organizationId !== input.organizationId ||
        target.channel !== input.channel ||
        target.businessDate.getTime() !== input.businessDate.getTime()
      ) {
        throw new Error(
          'ChannelTargetDailyRepositoryAdapter.replaceCampaignDay: every target must share the replacement tenant/channel/date scope',
        );
      }
      if (campaignId) {
        if (target.campaignId?.trim() !== campaignId) {
          throw new Error(
            'ChannelTargetDailyRepositoryAdapter.replaceCampaignDay: target campaignId does not match replacement scope',
          );
        }
      } else {
        if (target.campaignId?.trim()) {
          throw new Error(
            'ChannelTargetDailyRepositoryAdapter.replaceCampaignDay: identity-scoped target cannot carry a different campaignId',
          );
        }
        if (
          target.campaignName?.trim() !== campaignName ||
          campaignIdentityFromTarget(target) !== campaignIdentity
        ) {
          throw new Error(
            'ChannelTargetDailyRepositoryAdapter.replaceCampaignDay: target campaign identity does not match replacement scope',
          );
        }
      }
      if (desiredKeys.has(target.targetKey)) {
        throw new Error(
          `ChannelTargetDailyRepositoryAdapter.replaceCampaignDay: duplicate targetKey '${target.targetKey}'`,
        );
      }
      desiredKeys.add(target.targetKey);
    }

    return withAdIngestRepositoryTransaction(this.prisma, async (tx) => {
      const lockScope = [
        input.organizationId,
        input.channel,
        input.businessDate.toISOString().slice(0, 10),
        campaignId ?? campaignIdentity,
      ].join(':');
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockScope}, 0))::text AS locked`,
      );
      await this.bulkUpsertCampaignTargets(tx, input.targets);

      const campaignScope: Prisma.ChannelAdTargetDailySnapshotWhereInput =
        campaignId
          ? { campaignId }
          : {
              campaignId: null,
              campaignName,
              metaJson: {
                path: [
                  'advertising.campaign.target',
                  'campaignIdentity',
                ],
                equals: campaignIdentity ?? '',
              },
            };
      const existing = await tx.channelAdTargetDailySnapshot.findMany({
        where: {
          organizationId: input.organizationId,
          channel: input.channel,
          businessDate: input.businessDate,
          AND: [
            campaignScope,
            campaignId
              ? {
                  metaJson: {
                    path: ['advertising.campaign.target'],
                    not: Prisma.AnyNull,
                  },
                }
              : {},
          ],
        },
        select: { id: true, targetKey: true },
      });
      const staleIds = existing
        .filter((row) => !desiredKeys.has(row.targetKey))
        .map((row) => row.id);

      if (staleIds.length > 0) {
        // AdAction copies its execution descriptors at creation time and the
        // relation is optional. Detach historical actions before removing a
        // target that disappeared from the provider's authoritative report.
        await tx.adAction.updateMany({
          where: {
            organizationId: input.organizationId,
            adTargetDailyId: { in: staleIds },
          },
          data: { adTargetDailyId: null },
        });
        await tx.channelAdTargetDailySnapshot.deleteMany({
          where: {
            organizationId: input.organizationId,
            id: { in: staleIds },
          },
        });
      }

      return {
        upsertedCount: input.targets.length,
        deletedCount: staleIds.length,
      };
    }, CAMPAIGN_REPLACE_TRANSACTION_OPTIONS);
  }

  private async bulkUpsertCampaignTargets(
    tx: Prisma.TransactionClient,
    targets: UpsertAdTargetDailyInput[],
  ): Promise<void> {
    for (
      let offset = 0;
      offset < targets.length;
      offset += CAMPAIGN_REPLACE_CHUNK_SIZE
    ) {
      const chunk = targets.slice(
        offset,
        offset + CAMPAIGN_REPLACE_CHUNK_SIZE,
      );
      if (chunk.length === 0) continue;
      const values = chunk.map((target) => {
        const observedAt = target.observedAt ?? new Date();
        const writtenAt = new Date();
        const metaJson = namespacedMetaJsonText(target.metaJson);
        return Prisma.sql`(
          ${randomUUID()}::uuid,
          ${target.organizationId}::uuid,
          ${target.channel},
          ${target.businessDate}::date,
          ${target.listingId ?? null}::uuid,
          ${target.listingOptionId ?? null}::uuid,
          ${target.externalId ?? null},
          ${target.externalOptionId ?? null},
          ${target.targetType},
          ${target.targetKey},
          ${target.campaignId ?? null},
          ${target.campaignName ?? null},
          ${target.adGroup ?? null},
          ${target.keyword ?? null},
          ${target.placement ?? null},
          ${target.status ?? null},
          ${target.onOff ?? null},
          ${integerOrNull(target.currentBid)},
          ${integerOrNull(target.dailyBudget)},
          ${integerMetric(target.spend)},
          ${integerMetric(target.revenue)},
          ${integerMetric(target.impressions)},
          ${integerMetric(target.clicks)},
          ${integerMetric(target.conversions)},
          ${integerMetric(target.orders)},
          ${integerMetric(target.adSpend)},
          ${integerMetric(target.adRevenue)},
          ${target.rawSnapshotId ?? null}::uuid,
          ${metaJson}::jsonb,
          1,
          ${observedAt}::timestamptz,
          ${observedAt}::timestamptz,
          ${writtenAt}::timestamptz,
          ${writtenAt}::timestamptz
        )`;
      });

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO channel_ad_target_daily_snapshots (
          id,
          organization_id,
          channel,
          business_date,
          listing_id,
          listing_option_id,
          external_id,
          external_option_id,
          target_type,
          target_key,
          campaign_id,
          campaign_name,
          ad_group,
          keyword,
          placement,
          status,
          on_off,
          current_bid,
          daily_budget,
          spend,
          revenue,
          impressions,
          clicks,
          conversions,
          orders,
          ad_spend,
          ad_revenue,
          raw_snapshot_id,
          meta_json,
          sample_count,
          first_observed_at,
          last_observed_at,
          created_at,
          updated_at
        ) VALUES ${Prisma.join(values)}
        ON CONFLICT (
          organization_id,
          channel,
          business_date,
          target_type,
          target_key
        ) DO UPDATE SET
          listing_id = EXCLUDED.listing_id,
          listing_option_id = EXCLUDED.listing_option_id,
          external_id = EXCLUDED.external_id,
          external_option_id = EXCLUDED.external_option_id,
          campaign_id = EXCLUDED.campaign_id,
          campaign_name = EXCLUDED.campaign_name,
          ad_group = EXCLUDED.ad_group,
          keyword = EXCLUDED.keyword,
          placement = EXCLUDED.placement,
          status = EXCLUDED.status,
          on_off = EXCLUDED.on_off,
          current_bid = EXCLUDED.current_bid,
          daily_budget = EXCLUDED.daily_budget,
          spend = EXCLUDED.spend,
          revenue = EXCLUDED.revenue,
          impressions = EXCLUDED.impressions,
          clicks = EXCLUDED.clicks,
          conversions = EXCLUDED.conversions,
          orders = EXCLUDED.orders,
          ad_spend = EXCLUDED.ad_spend,
          ad_revenue = EXCLUDED.ad_revenue,
          raw_snapshot_id = EXCLUDED.raw_snapshot_id,
          meta_json = CASE
            WHEN EXCLUDED.meta_json IS NULL
              THEN channel_ad_target_daily_snapshots.meta_json
            ELSE COALESCE(
              channel_ad_target_daily_snapshots.meta_json,
              '{}'::jsonb
            ) || EXCLUDED.meta_json
          END,
          sample_count = channel_ad_target_daily_snapshots.sample_count + 1,
          last_observed_at = EXCLUDED.last_observed_at,
          updated_at = NOW()
      `);
    }
  }

  private async upsertWithClient(
    tx: Prisma.TransactionClient,
    input: UpsertAdTargetDailyInput,
  ): Promise<{ id: string }> {
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
  }
}

function campaignIdentityFromTarget(
  target: UpsertAdTargetDailyInput,
): string | null {
  const meta = target.metaJson;
  if (!meta || typeof meta !== 'object') return null;
  const value = meta.data.campaignIdentity;
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function namespacedMetaJsonText(
  metaJson: UpsertAdTargetDailyInput['metaJson'],
): string | null {
  if (!metaJson || typeof metaJson !== 'object') return null;
  return JSON.stringify({ [metaJson.source]: metaJson.data });
}

function integerMetric(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : 0;
}

function integerOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : null;
}
