import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  OperationStatusSchema,
  ProviderOutcomeSchema,
  type OperationStatus,
  type ProviderOutcome,
} from '@kiditem/shared/registration-execution';
import { CHANNEL_REGISTRY } from '@kiditem/shared/channel-registry';
import { THUMBNAIL_UPDATE_EXECUTION_KIND, type ThumbnailExecutionStatus } from '@kiditem/shared/thumbnail-execution';
import {
  REGISTRATION_KIND,
  RegistrationPlanSchema,
  RegistrationThumbnailPayloadSchema,
} from '@kiditem/shared/channels-operations';
import { FactInputError, FactNotFoundError } from '../../../../common/errors/fact-errors';
import { readOperationsByPlan } from '../../../../common/operation/transaction/operations-by-plan';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { ThumbnailExecutionPersistencePort } from '../../../application/port/out/persistence/thumbnail-execution.persistence.port';

/** 대표이미지 반영을 지원하는 채널(registry `representativeImage`). 채널 키를 여기 적지 않는다. */
const REPRESENTATIVE_IMAGE_CHANNELS = CHANNEL_REGISTRY.filter((entry) => entry.representativeImage).map((entry) => entry.key);

/**
 * 대표이미지 몰 반영의 Channels 읽기(KID-364). 실행은 `channels.registration` 의 `thumbnail_update` 이고 실행 계약의
 * 읽기 함수(`common/operation/transaction`)로만 본다.
 */
@Injectable()
export class ThumbnailExecutionPersistenceAdapter implements ThumbnailExecutionPersistencePort {
  constructor(private readonly prisma: PrismaService) {}

  async readAccountEvidence(input: {
    organizationId: string;
    pickedListingId: string | null;
    salesProductId: string;
  }) {
    const product = await this.prisma.salesProduct.findFirst({
      where: { id: input.salesProductId, organizationId: input.organizationId },
      select: { name: true },
    });
    if (!product) throw new FactNotFoundError('판매상품을 찾을 수 없습니다');
    const activeAccounts = await this.prisma.channelAccount.findMany({
      where: { organizationId: input.organizationId, channel: { in: REPRESENTATIVE_IMAGE_CHANNELS }, status: 'active' },
      select: { id: true, channel: true },
      orderBy: { createdAt: 'asc' },
    });
    const activeAccountIds = activeAccounts.map((account) => account.id);
    const listingWhere = {
      organizationId: input.organizationId,
      isActive: true,
      salesProductId: input.salesProductId,
      channelAccount: { channel: { in: REPRESENTATIVE_IMAGE_CHANNELS }, status: 'active' },
    } satisfies Prisma.ChannelListingWhereInput;
    const select = { id: true, channelAccountId: true, channelName: true, externalId: true, channelAccount: { select: { channel: true } } } as const;
    const evidence = (
      listing: { id: string; channelAccountId: string; channelName: string | null; externalId: string | null; channelAccount: { channel: string } } | null,
      productListingCount = listing ? 1 : 0,
    ) => ({
      salesProductName: product.name,
      listingAccountId: listing?.channelAccountId ?? null,
      channelListingId: listing?.id ?? null,
      listingChannelName: listing?.channelName ?? null,
      listingExternalId: listing?.externalId ?? null,
      productListingCount,
      activeAccountIds,
      channelByAccountId: Object.fromEntries([
        ...activeAccounts.map((account) => [account.id, account.channel] as const),
        ...(listing ? [[listing.channelAccountId, listing.channelAccount.channel] as const] : []),
      ]),
    });

    if (input.pickedListingId) {
      const listing = await this.prisma.channelListing.findFirst({ where: { ...listingWhere, id: input.pickedListingId }, select });
      if (!listing) throw new FactInputError('고른 listing 은 이 상품의 대표이미지 반영 listing 이 아닙니다');
      return evidence(listing);
    }
    const listings = await this.prisma.channelListing.findMany({ where: listingWhere, select, take: 2 });
    if (listings.length === 1) return evidence(listings[0]!);
    if (listings.length > 1) return evidence(null, listings.length);
    return evidence(null);
  }

  async findTargetThumbnailAssetId(input: { organizationId: string; salesProductId: string; channelAccountId: string }) {
    const target = await this.prisma.registrationTarget.findFirst({
      where: {
        organizationId: input.organizationId,
        salesProductId: input.salesProductId,
        channelAccountId: input.channelAccountId,
        archivedAt: null,
      },
      select: { selectedThumbnailAssetId: true },
    });
    return target?.selectedThumbnailAssetId ?? null;
  }

  async findListingChoices(input: { organizationId: string; salesProductId: string }) {
    const listings = await this.prisma.channelListing.findMany({
      where: {
        organizationId: input.organizationId,
        isActive: true,
        salesProductId: input.salesProductId,
        channelAccount: { channel: { in: REPRESENTATIVE_IMAGE_CHANNELS }, status: 'active' },
      },
      select: { id: true, channelName: true, externalId: true, channelAccount: { select: { name: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 50,
    });
    return listings.map((listing) => ({
      id: listing.id,
      channelName: listing.channelName,
      channelAccountName: listing.channelAccount.name,
      externalId: listing.externalId,
    }));
  }

  async findLatest(input: { organizationId: string; salesProductIds: readonly string[] }): Promise<ThumbnailExecutionStatus[]> {
    if (input.salesProductIds.length === 0) return [];
    const rows = await readOperationsByPlan(this.prisma, {
      organizationId: input.organizationId,
      kinds: [REGISTRATION_KIND],
      planContainsAny: input.salesProductIds.map((salesProductId) => ({ executionKind: THUMBNAIL_UPDATE_EXECUTION_KIND, salesProductId })),
      latestPer: 'salesProductId',
      plan: { payloadKeys: ['assetId'] },
    });
    const latest = new Map<string, ThumbnailExecutionStatus>();
    for (const row of rows) {
      const plan = RegistrationPlanSchema.safeParse(row.plan);
      if (!plan.success || !plan.data.salesProductId || latest.has(plan.data.salesProductId)) continue;
      // 읽은 plan 의 payload 는 자산 id 만 싣는다(사진 dataUrl 은 크다).
      const assetId = RegistrationThumbnailPayloadSchema.shape.assetId.safeParse(plan.data.payload.assetId);
      if (!assetId.success) continue;
      const result = jsonRecord(row.result);
      const status = OperationStatusSchema.parse(row.status);
      latest.set(plan.data.salesProductId, {
        salesProductId: plan.data.salesProductId,
        assetId: assetId.data,
        executionId: row.id,
        status,
        providerOutcome: providerOutcomeOf(status, result.providerOutcome),
        checkedAt: (row.finishedAt ?? row.startedAt).toISOString(),
        error: row.errorMessage ?? (typeof result.mallMessage === 'string' ? result.mallMessage : null),
        screenshotPath: typeof result.screenshotPath === 'string' ? result.screenshotPath : null,
      });
    }
    return input.salesProductIds.flatMap((id) => latest.get(id) ?? []);
  }
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** 실행 `result.providerOutcome`(확장이 적은 것). 없으면 상태로 비춘다. */
function providerOutcomeOf(status: OperationStatus, value: unknown): ProviderOutcome {
  const parsed = ProviderOutcomeSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  if (status === 'succeeded') return 'succeeded';
  if (status === 'failed') return 'definitive_failure';
  if (status === 'reconciling') return 'uncertain';
  return 'not_attempted';
}
