// `ChannelAdTargetDailySnapshot` upsert adapter.
//
// Idempotent on `(organizationId, channelAccountId, channel, businessDate, targetType, targetKey)`.
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
  buildNamespacedMetaForCreate,
  mergeNamespacedMetaJson,
  pickObservedFields,
  spreadMetricsForCreate,
  spreadMetricsForUpdate,
} from './daily-fact-helpers';
import { withAdIngestRepositoryTransaction } from './ad-ingest-transaction-context';
import {
  buildAdTargetKey,
  campaignIdFromCanonicalIdentity,
  canonicalCampaignIdentity,
} from '../../../domain/util/ad-target-key';

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
    | 'campaignIdentity'
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
  'campaignIdentity',
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
    if (!input.channelAccountId.trim()) {
      throw new Error(
        'ChannelTargetDailyRepositoryAdapter.upsert: channelAccountId is required',
      );
    }
    if (!input.targetKey || input.targetKey.trim().length === 0) {
      throw new Error(
        'ChannelTargetDailyRepositoryAdapter.upsert: targetKey must be a non-empty deterministic string',
      );
    }
    const normalizedInput = normalizeTargetInput(input);
    const observedAt = normalizedInput.observedAt ?? new Date();
    const metaJsonForCreate = buildNamespacedMetaForCreate(
      normalizedInput.metaJson,
    );
    const metricsCreate = spreadMetricsForCreate(
      normalizedInput,
      AD_TARGET_METRIC_KEYS,
    );
    const metricsUpdate = spreadMetricsForUpdate(
      normalizedInput,
      AD_TARGET_METRIC_KEYS,
    );
    const observedDescriptors = pickObservedFields(
      normalizedInput,
      AD_TARGET_DESCRIPTOR_KEYS,
    );

    return withAdIngestRepositoryTransaction(this.prisma, async (tx) => {
      const row = await tx.channelAdTargetDailySnapshot.upsert({
        where: {
          organizationId_channelAccountId_channel_businessDate_targetType_targetKey: {
            organizationId: normalizedInput.organizationId,
            channelAccountId: normalizedInput.channelAccountId,
            channel: normalizedInput.channel,
            businessDate: normalizedInput.businessDate,
            targetType: normalizedInput.targetType,
            targetKey: normalizedInput.targetKey,
          },
        },
        create: {
          organizationId: normalizedInput.organizationId,
          channelAccountId: normalizedInput.channelAccountId,
          channel: normalizedInput.channel,
          businessDate: normalizedInput.businessDate,
          targetType: normalizedInput.targetType,
          targetKey: normalizedInput.targetKey,
          listingId: normalizedInput.listingId ?? null,
          listingOptionId: normalizedInput.listingOptionId ?? null,
          externalId: normalizedInput.externalId ?? null,
          externalOptionId: normalizedInput.externalOptionId ?? null,
          campaignId: normalizedInput.campaignId ?? null,
          campaignIdentity: normalizedInput.campaignIdentity ?? null,
          campaignName: normalizedInput.campaignName ?? null,
          adGroup: normalizedInput.adGroup ?? null,
          keyword: normalizedInput.keyword ?? null,
          placement: normalizedInput.placement ?? null,
          status: normalizedInput.status ?? null,
          onOff: normalizedInput.onOff ?? null,
          currentBid: normalizedInput.currentBid ?? null,
          dailyBudget: normalizedInput.dailyBudget ?? null,
          rawSnapshotId: normalizedInput.rawSnapshotId ?? null,
          metaJson: metaJsonForCreate,
          sampleCount: 1,
          firstObservedAt: observedAt,
          lastObservedAt: observedAt,
          ...metricsCreate,
        },
        update: {
          sampleCount: { increment: 1 },
          lastObservedAt: observedAt,
          ...(normalizedInput.rawSnapshotId !== undefined
            ? { rawSnapshotId: normalizedInput.rawSnapshotId }
            : {}),
          ...(normalizedInput.metaJson === null ? { metaJson: Prisma.DbNull } : {}),
          ...observedDescriptors,
          ...metricsUpdate,
        },
        select: { id: true },
      });
      await mergeNamespacedMetaJson(
        tx,
        'channel_ad_target_daily_snapshots',
        row.id,
        normalizedInput.organizationId,
        normalizedInput.metaJson,
      );
      return row;
    });
  }

  async replaceCampaignDay(
    input: ReplaceAdCampaignDayInput,
  ): Promise<ReplaceAdCampaignDayResult> {
    const campaignIdentity = canonicalCampaignIdentity(input);
    const campaignId = campaignIdFromCanonicalIdentity(campaignIdentity);
    if (!input.channelAccountId.trim()) {
      throw new Error('replaceCampaignDay: channelAccountId is required');
    }
    if (!campaignIdentity) {
      throw new Error('replaceCampaignDay: stable campaign identity is required');
    }
    for (const target of input.targets) {
      const targetIdIdentity = canonicalCampaignIdentity({
        campaignId: target.campaignId,
      });
      if (targetIdIdentity && targetIdIdentity !== campaignIdentity) {
        throw new Error(
          'replaceCampaignDay: target campaignId does not match replacement scope',
        );
      }
      const targetExplicitIdentity = canonicalCampaignIdentity({
        campaignIdentity: target.campaignIdentity,
      });
      if (
        targetExplicitIdentity &&
        targetExplicitIdentity !== campaignIdentity
      ) {
        throw new Error(
          'replaceCampaignDay: target campaign identity does not match replacement scope',
        );
      }
    }
    const normalizedTargets = input.targets.map(normalizeTargetInput);
    const expectedPrefix = `account:${input.channelAccountId}:`;
    const desiredKeys = new Set<string>();
    for (const target of normalizedTargets) {
      if (
        target.organizationId !== input.organizationId ||
        target.channelAccountId !== input.channelAccountId ||
        target.channel !== input.channel ||
        target.businessDate.getTime() !== input.businessDate.getTime() ||
        !target.targetKey.startsWith(expectedPrefix)
      ) {
        throw new Error(
          'replaceCampaignDay: targets must share organization/account/channel/date scope',
        );
      }
      if (target.campaignIdentity !== campaignIdentity) {
        throw new Error(
          'replaceCampaignDay: target campaign identity does not match replacement scope',
        );
      }
      if (campaignId && target.campaignId !== campaignId) {
        throw new Error(
          'replaceCampaignDay: target campaignId does not match replacement scope',
        );
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
        campaignIdentity,
      ].join(':');
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockScope}, 0))::text AS locked`,
      );

      const rows = await tx.$queryRaw<LockedCampaignTargetRow[]>(Prisma.sql`
        SELECT
          target.id,
          target.target_key AS "targetKey",
          ARRAY(
            SELECT action.id::text
            FROM ad_actions action
            WHERE action.organization_id = target.organization_id
              AND action.ad_target_daily_id = target.id
            ORDER BY action.id
          ) AS "actionIds",
          target.first_observed_at AS "firstObservedAt",
          target.sample_count AS "sampleCount"
        FROM channel_ad_target_daily_snapshots target
        WHERE target.organization_id = ${input.organizationId}::uuid
          AND target.channel_account_id = ${input.channelAccountId}::uuid
          AND target.channel = ${input.channel}
          AND target.business_date = ${input.businessDate}::date
          AND target.campaign_identity = ${campaignIdentity}
          AND starts_with(target.target_key, ${expectedPrefix})
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

      const desiredKeys = new Set(normalizedTargets.map((target) => target.targetKey));
      const existingByKey = new Map(rows.map((row) => [row.targetKey, row]));
      const staleRows = rows.filter((row) => !desiredKeys.has(row.targetKey));
      if (staleRows.some((row) => row.actionIds.length > 0)) {
        return { kind: 'rejected', code: 'dependent_action_conflict' };
      }

      let deletedCount = 0;
      if (staleRows.length > 0) {
        const deleted = await tx.channelAdTargetDailySnapshot.deleteMany({
          where: {
            organizationId: input.organizationId,
            channelAccountId: input.channelAccountId,
            id: { in: staleRows.map((row) => row.id) },
          },
        });
        deletedCount += deleted.count;
      }

      for (const desired of normalizedTargets) {
        const existing = existingByKey.get(desired.targetKey);
        if (!existing) {
          await this.createWithClient(tx, desired);
          continue;
        }
        const observedAt = desired.observedAt ?? new Date();
        const updated = await tx.channelAdTargetDailySnapshot.updateMany({
          where: {
            id: existing.id,
            organizationId: input.organizationId,
            channelAccountId: input.channelAccountId,
          },
          data: {
            ...targetDescriptorData(desired),
            ...spreadMetricsForUpdate(desired, AD_TARGET_METRIC_KEYS),
            targetKey: desired.targetKey,
            rawSnapshotId: desired.rawSnapshotId ?? null,
            metaJson: replacementMeta(desired),
            sampleCount: Math.max(1, existing.sampleCount),
            ...(existing.firstObservedAt
              ? { firstObservedAt: existing.firstObservedAt }
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
        upsertedCount: normalizedTargets.length,
        deletedCount,
      };
    }, CAMPAIGN_REPLACE_TRANSACTION_OPTIONS);
  }

  private async createWithClient(
    tx: Prisma.TransactionClient,
    input: UpsertAdTargetDailyInput,
  ): Promise<void> {
    const observedAt = input.observedAt ?? new Date();
    await tx.channelAdTargetDailySnapshot.create({
      data: {
        organizationId: input.organizationId,
        channelAccountId: input.channelAccountId,
        channel: input.channel,
        businessDate: input.businessDate,
        targetType: input.targetType,
        targetKey: input.targetKey,
        ...targetDescriptorData(input),
        ...spreadMetricsForCreate(input, AD_TARGET_METRIC_KEYS),
        rawSnapshotId: input.rawSnapshotId ?? null,
        metaJson: replacementMeta(input),
        sampleCount: 1,
        firstObservedAt: observedAt,
        lastObservedAt: observedAt,
      },
      select: { id: true },
    });
  }
}

interface LockedCampaignTargetRow {
  id: string;
  targetKey: string;
  actionIds: string[];
  firstObservedAt: Date;
  sampleCount: number;
}

function normalizeTargetInput(
  input: UpsertAdTargetDailyInput,
): UpsertAdTargetDailyInput {
  const campaignIdentity = canonicalCampaignIdentity(input);
  const campaignId = campaignIdFromCanonicalIdentity(campaignIdentity);
  const hasCampaignEvidence = [
    input.campaignId,
    input.campaignIdentity,
    input.campaignName,
    input.adGroup,
    input.keyword,
  ].some((value) => typeof value === 'string' && value.trim().length > 0);
  const validCampaignlessProduct =
    input.targetType === 'product' &&
    input.campaignless === true &&
    !hasCampaignEvidence;

  if (!campaignIdentity && !validCampaignlessProduct) {
    throw new Error(
      'ChannelTargetDailyRepositoryAdapter: missing_stable_campaign_identity',
    );
  }
  if (campaignIdentity && input.campaignless === true) {
    throw new Error(
      'ChannelTargetDailyRepositoryAdapter: campaignless product cannot carry campaign identity',
    );
  }

  const normalized: UpsertAdTargetDailyInput = {
    ...input,
    campaignId,
    campaignIdentity,
  };
  return {
    ...normalized,
    targetKey: buildAdTargetKey(normalized),
  };
}

function targetDescriptorData(input: UpsertAdTargetDailyInput) {
  return {
    listingId: input.listingId ?? null,
    listingOptionId: input.listingOptionId ?? null,
    externalId: input.externalId ?? null,
    externalOptionId: input.externalOptionId ?? null,
    campaignId: input.campaignId ?? null,
    campaignIdentity: input.campaignIdentity ?? null,
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
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  const base = buildNamespacedMetaForCreate(input.metaJson);
  const record = base && typeof base === 'object' && !Array.isArray(base)
    ? base as Record<string, Prisma.InputJsonValue>
    : {};
  return record as Prisma.InputJsonValue;
}
