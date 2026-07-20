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
  ReplaceAdCampaignDayInput,
  ReplaceAdCampaignDayResult,
  UpsertAdTargetDailyInput,
} from '../../../application/port/out/repository/channel-target-daily.repository.port';
import {
  planCampaignDayReplacement,
  type CampaignDayExistingTarget,
} from '../../../domain/campaign-day-replacement-plan';
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

  async replaceCampaignDay(
    input: ReplaceAdCampaignDayInput,
  ): Promise<ReplaceAdCampaignDayResult> {
    const campaignId = input.campaignId?.trim() || null;
    const campaignIdentity = input.campaignIdentity?.trim() || null;
    const campaignName = input.campaignName.trim();
    if (!input.channelAccountId.trim()) {
      throw new Error('replaceCampaignDay: channelAccountId is required');
    }
    if (!campaignId && !campaignIdentity) {
      throw new Error('replaceCampaignDay: stable campaign identity is required');
    }
    const expectedPrefix = `account:${input.channelAccountId}:`;
    const desiredKeys = new Set<string>();
    for (const target of input.targets) {
      if (
        target.organizationId !== input.organizationId ||
        target.channel !== input.channel ||
        target.businessDate.getTime() !== input.businessDate.getTime() ||
        !target.targetKey.startsWith(expectedPrefix)
      ) {
        throw new Error(
          'replaceCampaignDay: targets must share organization/account/channel/date scope',
        );
      }
      if (campaignId) {
        if (target.campaignId?.trim() !== campaignId) {
          throw new Error(
            'replaceCampaignDay: target campaignId does not match replacement scope',
          );
        }
      } else {
        if (target.campaignId?.trim()) {
          throw new Error(
            'replaceCampaignDay: identity-scoped target cannot carry a campaignId',
          );
        }
        if (
          target.campaignName?.trim() !== campaignName ||
          campaignIdentityFromTarget(target) !== campaignIdentity
        ) {
          throw new Error(
            'replaceCampaignDay: target campaign identity does not match replacement scope',
          );
        }
      }
      if (desiredKeys.has(target.targetKey)) {
        throw new Error(
          `replaceCampaignDay: duplicate targetKey '${target.targetKey}'`,
        );
      }
      desiredKeys.add(target.targetKey);
    }

    return withAdIngestRepositoryTransaction(this.prisma, async (tx) => {
      const lockScope = [
        input.organizationId,
        input.channelAccountId,
        input.channel,
        input.businessDate.toISOString().slice(0, 10),
        campaignId ?? campaignIdentity,
      ].join(':');
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockScope}, 0))::text AS locked`,
      );

      const campaignPredicate = campaignId
        ? Prisma.sql`target.campaign_id = ${campaignId}`
        : Prisma.sql`
            target.campaign_id IS NULL
            AND target.campaign_name = ${campaignName}
            AND target.meta_json #>> '{advertising.campaign.target,campaignIdentity}' = ${campaignIdentity}
          `;
      const rows = await tx.$queryRaw<LockedCampaignTargetRow[]>(Prisma.sql`
        SELECT
          target.id,
          target.target_key AS "targetKey",
          target.target_type AS "targetType",
          target.campaign_id AS "campaignId",
          target.campaign_name AS "campaignName",
          target.ad_group AS "adGroup",
          target.keyword,
          target.listing_id AS "listingId",
          target.listing_option_id AS "listingOptionId",
          target.external_id AS "externalId",
          target.external_option_id AS "externalOptionId",
          target.raw_snapshot_id AS "rawSnapshotId",
          scrape_run.channel_account_id AS "rawAccountId",
          listing.channel_account_id AS "listingAccountId",
          ARRAY(
            SELECT action.id::text
            FROM ad_actions action
            WHERE action.organization_id = target.organization_id
              AND action.ad_target_daily_id = target.id
            ORDER BY action.id
          ) AS "actionIds",
          target.first_observed_at AS "firstObservedAt",
          target.last_observed_at AS "lastObservedAt",
          target.created_at AS "createdAt",
          target.updated_at AS "updatedAt",
          target.sample_count AS "sampleCount",
          target.spend,
          target.revenue,
          target.impressions,
          target.clicks,
          target.conversions,
          target.orders,
          target.ad_spend AS "adSpend",
          target.ad_revenue AS "adRevenue"
        FROM channel_ad_target_daily_snapshots target
        LEFT JOIN channel_scrape_snapshots raw_snapshot
          ON raw_snapshot.id = target.raw_snapshot_id
          AND raw_snapshot.organization_id = target.organization_id
        LEFT JOIN channel_scrape_runs scrape_run
          ON scrape_run.id = raw_snapshot.scrape_run_id
          AND scrape_run.organization_id = target.organization_id
        LEFT JOIN channel_listings listing
          ON listing.id = target.listing_id
          AND listing.organization_id = target.organization_id
        WHERE target.organization_id = ${input.organizationId}::uuid
          AND target.channel = ${input.channel}
          AND target.business_date = ${input.businessDate}::date
          AND (${campaignPredicate})
        FOR UPDATE OF target
      `);
      const candidateIds = rows.map((row) => row.id);
      if (candidateIds.length > 0) {
        await tx.$queryRaw(Prisma.sql`
          SELECT id
          FROM ad_actions
          WHERE organization_id = ${input.organizationId}::uuid
            AND ad_target_daily_id IN (
              ${Prisma.join(candidateIds.map((id) => Prisma.sql`${id}::uuid`))}
            )
          FOR UPDATE
        `);
      }

      const existingTargets = rows.map(toExistingTarget);
      const plan = planCampaignDayReplacement({
        channelAccountId: input.channelAccountId,
        desiredTargets: input.targets,
        existingTargets,
      });
      if (plan.kind === 'rejected') return plan;

      let deletedCount = 0;
      let mergedCount = 0;
      for (const targetPlan of plan.targets) {
        if (!targetPlan.destinationId) continue;
        if (targetPlan.reparentActionIds.length > 0) {
          await tx.adAction.updateMany({
            where: {
              organizationId: input.organizationId,
              id: { in: targetPlan.reparentActionIds },
            },
            data: { adTargetDailyId: targetPlan.destinationId },
          });
        }
        if (targetPlan.sourceIds.length > 0) {
          const deleted = await tx.channelAdTargetDailySnapshot.deleteMany({
            where: {
              organizationId: input.organizationId,
              id: { in: targetPlan.sourceIds },
            },
          });
          deletedCount += deleted.count;
          mergedCount += deleted.count;
        }
      }
      if (plan.staleIds.length > 0) {
        const deleted = await tx.channelAdTargetDailySnapshot.deleteMany({
          where: {
            organizationId: input.organizationId,
            id: { in: plan.staleIds },
          },
        });
        deletedCount += deleted.count;
      }

      for (const desired of input.targets) {
        const targetPlan = plan.targets.find((item) => item.targetKey === desired.targetKey);
        if (!targetPlan) throw new Error('replaceCampaignDay: incomplete replacement plan');
        if (!targetPlan.destinationId) {
          await this.createWithClient(tx, desired, targetPlan);
          continue;
        }
        const observedAt = desired.observedAt ?? new Date();
        const updated = await tx.channelAdTargetDailySnapshot.updateMany({
          where: {
            id: targetPlan.destinationId,
            organizationId: input.organizationId,
          },
          data: {
            ...targetDescriptorData(desired),
            ...spreadMetricsForUpdate(desired, AD_TARGET_METRIC_KEYS),
            targetKey: desired.targetKey,
            rawSnapshotId: desired.rawSnapshotId ?? null,
            metaJson: replacementMeta(desired, targetPlan.sourceIds, targetPlan.sourceRawSnapshotIds),
            sampleCount: Math.max(1, targetPlan.sampleCount),
            ...(targetPlan.firstObservedAt
              ? { firstObservedAt: targetPlan.firstObservedAt }
              : {}),
            lastObservedAt: observedAt,
          },
        });
        if (updated.count !== 1) {
          throw new Error('replaceCampaignDay: destination changed during replacement');
        }
      }

      return {
        kind: 'replaced',
        upsertedCount: input.targets.length,
        deletedCount,
        mergedCount,
      };
    }, CAMPAIGN_REPLACE_TRANSACTION_OPTIONS);
  }

  private async createWithClient(
    tx: Prisma.TransactionClient,
    input: UpsertAdTargetDailyInput,
    plan: { sourceIds: string[]; sourceRawSnapshotIds: string[] },
  ): Promise<void> {
    const observedAt = input.observedAt ?? new Date();
    await tx.channelAdTargetDailySnapshot.create({
      data: {
        organizationId: input.organizationId,
        channel: input.channel,
        businessDate: input.businessDate,
        targetType: input.targetType,
        targetKey: input.targetKey,
        ...targetDescriptorData(input),
        ...spreadMetricsForCreate(input, AD_TARGET_METRIC_KEYS),
        rawSnapshotId: input.rawSnapshotId ?? null,
        metaJson: replacementMeta(input, plan.sourceIds, plan.sourceRawSnapshotIds),
        sampleCount: 1,
        firstObservedAt: observedAt,
        lastObservedAt: observedAt,
      },
      select: { id: true },
    });
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

interface LockedCampaignTargetRow {
  id: string;
  targetKey: string;
  targetType: string;
  campaignId: string | null;
  campaignName: string | null;
  adGroup: string | null;
  keyword: string | null;
  listingId: string | null;
  listingOptionId: string | null;
  externalId: string | null;
  externalOptionId: string | null;
  rawSnapshotId: string | null;
  rawAccountId: string | null;
  listingAccountId: string | null;
  actionIds: string[];
  firstObservedAt: Date;
  lastObservedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  sampleCount: number;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  orders: number;
  adSpend: number;
  adRevenue: number;
}

function toExistingTarget(row: LockedCampaignTargetRow): CampaignDayExistingTarget {
  const qualifiedAccount = row.targetKey.match(/^account:([^:]+):/)?.[1] ?? null;
  return {
    id: row.id,
    targetKey: row.targetKey,
    targetType: row.targetType,
    campaignId: row.campaignId,
    campaignName: row.campaignName,
    adGroup: row.adGroup,
    keyword: row.keyword,
    listingId: row.listingId,
    listingOptionId: row.listingOptionId,
    externalId: row.externalId,
    externalOptionId: row.externalOptionId,
    rawSnapshotId: row.rawSnapshotId,
    accountEvidence: [qualifiedAccount, row.rawAccountId, row.listingAccountId]
      .filter((value): value is string => Boolean(value)),
    actionIds: row.actionIds ?? [],
    firstObservedAt: row.firstObservedAt,
    lastObservedAt: row.lastObservedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sampleCount: row.sampleCount,
    metrics: {
      spend: row.spend,
      revenue: row.revenue,
      impressions: row.impressions,
      clicks: row.clicks,
      conversions: row.conversions,
      orders: row.orders,
      adSpend: row.adSpend,
      adRevenue: row.adRevenue,
    },
  };
}

function targetDescriptorData(input: UpsertAdTargetDailyInput) {
  return {
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
  };
}

function replacementMeta(
  input: UpsertAdTargetDailyInput,
  sourceIds: string[],
  rawSnapshotIds: string[],
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  const base = buildNamespacedMetaForCreate(input.metaJson);
  const record = base && typeof base === 'object' && !Array.isArray(base)
    ? base as Record<string, Prisma.InputJsonValue>
    : {};
  return {
    ...record,
    'advertising.campaign.replacement': {
      sourceIds: sourceIds.slice(0, 32),
      rawSnapshotIds: rawSnapshotIds.slice(0, 32),
    },
  } as Prisma.InputJsonValue;
}
