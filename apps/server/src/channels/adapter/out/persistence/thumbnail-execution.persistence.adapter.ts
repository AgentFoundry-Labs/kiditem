import { Injectable } from '@nestjs/common';
import { Prisma, type ProductRegistrationExecution } from '@prisma/client';
import type { OperationStatus, ProviderOutcome } from '@kiditem/shared/registration-execution';
import { CHANNEL_REGISTRY } from '@kiditem/shared/channel-registry';
import { THUMBNAIL_UPDATE_EXECUTION_KIND } from '@kiditem/shared/thumbnail-execution';
import { FactConflictError, FactInputError, FactNotFoundError } from '../../../../common/errors/fact-errors';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ThumbnailExecutionPersistencePort,
  ThumbnailExecutionRow,
} from '../../../application/port/out/persistence/thumbnail-execution.persistence.port';
import {
  acceptsThumbnailReport,
  thumbnailUpdateLiveSubject,
  type ThumbnailReportTransition,
  type ThumbnailUpdatePayload,
} from '../../../domain/registration/thumbnail-update';

/** 대표이미지 반영을 지원하는 채널(registry `representativeImage`). 채널 키를 여기 적지 않는다. */
const REPRESENTATIVE_IMAGE_CHANNELS = CHANNEL_REGISTRY.filter((entry) => entry.representativeImage).map((entry) => entry.key);
const LIVE_STATUSES = ['prepared', 'executing', 'reconciling'] as const;

/**
 * 대표이미지 몰 반영 실행의 저장소. `ProductRegistrationExecution` 중
 * `executionKind = 'thumbnail_update'` 행만 읽고 쓴다.
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

  async createExecuting(input: {
    organizationId: string;
    requestedByUserId: string | null;
    channelAccountId: string;
    idempotencyKey: string;
    ownerIdempotencyKey: string | null;
    requestHash: string;
    payload: ThumbnailUpdatePayload;
    payloadHash: string;
  }): Promise<
    | { mode: 'created'; executionId: string }
    | { mode: 'replay'; execution: ThumbnailExecutionRow }
    | { mode: 'live_conflict' }
    | { mode: 'listing_conflict' }
  > {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockThumbnailUpdate(tx, input.organizationId, thumbnailUpdateLiveSubject({
          salesProductId: input.payload.salesProductId,
          channelAccountId: input.channelAccountId,
          assetId: input.payload.assetId,
        }));
        // listing 은 행에 적지 않으므로 listing 하나에 살아 있는 반영 하나도 여기서 지킨다.
        if (input.payload.channelListingId) {
          await lockThumbnailUpdate(tx, input.organizationId, `listing:${input.payload.channelListingId}`);
        }
        const replay = await this.findReplay(tx, input);
        if (replay) return replay;
        const live = await tx.productRegistrationExecution.findFirst({
          where: {
            organizationId: input.organizationId,
            executionKind: THUMBNAIL_UPDATE_EXECUTION_KIND,
            channelAccountId: input.channelAccountId,
            status: { in: [...LIVE_STATUSES] },
            AND: [
              { submissionPayloadJson: { path: ['salesProductId'], equals: input.payload.salesProductId } },
              { submissionPayloadJson: { path: ['assetId'], equals: input.payload.assetId } },
            ],
          },
          select: { id: true },
        });
        if (live) return { mode: 'live_conflict' as const };
        if (input.payload.channelListingId) {
          const liveOnListing = await tx.productRegistrationExecution.findFirst({
            where: {
              organizationId: input.organizationId,
              executionKind: THUMBNAIL_UPDATE_EXECUTION_KIND,
              status: { in: [...LIVE_STATUSES] },
              submissionPayloadJson: { path: ['channelListingId'], equals: input.payload.channelListingId },
            },
            select: { id: true },
          });
          if (liveOnListing) return { mode: 'listing_conflict' as const };
        }
        const now = new Date();
        const created = await tx.productRegistrationExecution.create({
          data: {
            organizationId: input.organizationId,
            channelAccountId: input.channelAccountId,
            // listing 은 동결 payload 에만 둔다. 행에 적으면 listing 의 활성 실행 자리
            // (product_registration_executions_active_listing_key)와 품절 검사를 막는다.
            channelListingId: null,
            executionKind: THUMBNAIL_UPDATE_EXECUTION_KIND,
            idempotencyKey: input.idempotencyKey,
            ownerIdempotencyKey: input.ownerIdempotencyKey,
            requestHash: input.requestHash,
            submissionPayloadJson: input.payload as unknown as Prisma.InputJsonValue,
            submissionPayloadHash: input.payloadHash,
            status: 'executing',
            providerOutcome: 'uncertain',
            requestedByUserId: input.requestedByUserId,
            startedAt: now,
          },
          select: { id: true },
        });
        return { mode: 'created' as const, executionId: created.id };
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      // 행이 listing 을 적지 않으므로 남은 unique 는 (조직, 멱등 키) 하나다. 같은 owner 키가 다른
      // 자산으로 먼저 들어왔으면(lock 은 (상품, 계정, 자산) 단위다) 그 실행을 재생하거나 충돌로 답한다. 화면
      // 호출의 멱등 키는 매번 새 nonce 라 여기 올 일이 없다.
      const replay = await this.findReplay(this.prisma, input);
      if (replay) return replay;
      throw new FactConflictError('Thumbnail execution idempotency key already exists.', { code: 'idempotency_key_conflict' });
    }
  }

  async applyReport(input: {
    organizationId: string;
    executionId: string;
    transition: ThumbnailReportTransition;
    acceptFrom: readonly OperationStatus[];
    screenshotPath: string | null;
    externalId: string | null;
  }): Promise<{ mode: 'applied'; execution: ThumbnailExecutionRow } | { mode: 'rejected'; status: OperationStatus } | { mode: 'not_found' }> {
    return this.prisma.$transaction(async (tx) => {
      const where = { id: input.executionId, organizationId: input.organizationId, executionKind: THUMBNAIL_UPDATE_EXECUTION_KIND };
      const current = await tx.productRegistrationExecution.findFirst({ where, select: { status: true, resultJson: true } });
      if (!current) return { mode: 'not_found' as const };
      const terminal = input.transition.status !== 'reconciling';
      const updated = await tx.productRegistrationExecution.updateMany({
        where: { ...where, status: { in: [...input.acceptFrom] } },
        data: {
          status: input.transition.status,
          providerOutcome: input.transition.providerOutcome,
          lastErrorCode: input.transition.errorCode,
          lastErrorMessage: input.transition.errorMessage?.slice(0, 2_000) ?? null,
          resultJson: {
            ...resultObject(current.resultJson),
            ...(input.screenshotPath !== null ? { screenshotPath: input.screenshotPath } : {}),
            ...(input.externalId !== null ? { externalId: input.externalId } : {}),
          } as Prisma.InputJsonValue,
          ...(terminal ? { completedAt: new Date() } : {}),
        },
      });
      if (updated.count !== 1) return { mode: 'rejected' as const, status: current.status as OperationStatus };
      const row = await tx.productRegistrationExecution.findFirstOrThrow({ where });
      return { mode: 'applied' as const, execution: toRow(row) };
    });
  }

  async findOwnerReplay(input: {
    organizationId: string;
    idempotencyKey: string;
    ownerIdempotencyKey: string;
    requestHash: string;
    salesProductId: string;
  }): Promise<ThumbnailExecutionRow | null> {
    const replay = await this.findReplay(this.prisma, { ...input, payload: { salesProductId: input.salesProductId } });
    return replay?.execution ?? null;
  }

  async readLivePayload(input: { organizationId: string; executionId: string }) {
    const row = await this.prisma.productRegistrationExecution.findFirst({
      where: { id: input.executionId, organizationId: input.organizationId, executionKind: THUMBNAIL_UPDATE_EXECUTION_KIND },
      select: { status: true, submissionPayloadJson: true },
    });
    if (!row) return { mode: 'not_found' as const };
    if (!acceptsThumbnailReport(row.status as OperationStatus)) {
      return { mode: 'finished' as const, status: row.status as OperationStatus };
    }
    return { mode: 'live' as const, payload: row.submissionPayloadJson as unknown as ThumbnailUpdatePayload };
  }

  async findLatest(input: { organizationId: string; salesProductIds: readonly string[] }): Promise<ThumbnailExecutionRow[]> {
    if (input.salesProductIds.length === 0) return [];
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT ON (submission_payload_json->>'salesProductId') id::text AS id
      FROM product_registration_executions
      WHERE organization_id = ${input.organizationId}::uuid
        AND execution_kind = ${THUMBNAIL_UPDATE_EXECUTION_KIND}
        AND submission_payload_json->>'salesProductId' = ANY(${[...input.salesProductIds]}::text[])
        AND NOT (status = 'failed' AND result_json ? 'dismissedAt')
      ORDER BY submission_payload_json->>'salesProductId', created_at DESC, id DESC
    `;
    if (ids.length === 0) return [];
    const rows = await this.prisma.productRegistrationExecution.findMany({
      where: { organizationId: input.organizationId, id: { in: ids.map((row) => row.id) } },
    });
    return rows.map(toRow);
  }

  async dismissLatestFailed(input: { organizationId: string; salesProductId: string }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await lockThumbnailUpdate(tx, input.organizationId, `dismiss:${input.salesProductId}`);
      const failed = await tx.productRegistrationExecution.findMany({
        where: {
          organizationId: input.organizationId,
          executionKind: THUMBNAIL_UPDATE_EXECUTION_KIND,
          status: 'failed',
          submissionPayloadJson: { path: ['salesProductId'], equals: input.salesProductId },
        },
        select: { id: true, resultJson: true },
      });
      const undismissed = failed.filter((row) => resultObject(row.resultJson).dismissedAt === undefined);
      const dismissedAt = new Date().toISOString();
      for (const row of undismissed) {
        await tx.productRegistrationExecution.update({
          where: { id: row.id },
          data: { resultJson: { ...resultObject(row.resultJson), dismissedAt } as Prisma.InputJsonValue },
        });
      }
      return undismissed.length > 0;
    });
  }

  private async findReplay(
    client: Pick<Prisma.TransactionClient, 'productRegistrationExecution'>,
    input: { organizationId: string; idempotencyKey: string; ownerIdempotencyKey: string | null; requestHash: string; payload: Pick<ThumbnailUpdatePayload, 'salesProductId'> },
  ): Promise<{ mode: 'replay'; execution: ThumbnailExecutionRow } | null> {
    if (!input.ownerIdempotencyKey) return null;
    const existing = await client.productRegistrationExecution.findFirst({
      where: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey },
    });
    if (!existing) return null;
    if (existing.executionKind !== THUMBNAIL_UPDATE_EXECUTION_KIND
      || existing.ownerIdempotencyKey !== input.ownerIdempotencyKey
      || existing.requestHash !== input.requestHash
      || payloadString(existing.submissionPayloadJson, 'salesProductId') !== input.payload.salesProductId) {
      throw new FactConflictError('Representative image owner idempotency key conflicted.', { code: 'owner_idempotency_key_conflict' });
    }
    return { mode: 'replay', execution: toRow(existing) };
  }
}

/**
 * 대표이미지 반영의 한 대상(살아 있는 실행 · listing · 실패 치우기)을 트랜잭션 동안 한 줄로 세운다.
 * 열쇠는 여기서 조직 id 를 앞에 붙여 만든다 — 부르는 쪽은 조직 안의 대상만 넘긴다.
 */
async function lockThumbnailUpdate(tx: Prisma.TransactionClient, organizationId: string, subject: string): Promise<void> {
  const lockKey = `thumbnail_update:${organizationId}:${subject}`;
  await tx.$queryRaw`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; the key is composed here from the organization id.
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
  `;
}

function resultObject(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } as Record<string, Prisma.JsonValue> : {};
}

function payloadString(value: Prisma.JsonValue | null, key: 'salesProductId' | 'assetId'): string | null {
  const found = resultObject(value)[key];
  return typeof found === 'string' ? found : null;
}

function toRow(row: ProductRegistrationExecution): ThumbnailExecutionRow {
  const result = resultObject(row.resultJson);
  const salesProductId = payloadString(row.submissionPayloadJson, 'salesProductId');
  const assetId = payloadString(row.submissionPayloadJson, 'assetId');
  if (!salesProductId || !assetId) {
    throw new Error(`thumbnail_update execution ${row.id} has no frozen sales product and asset`);
  }
  return {
    id: row.id,
    salesProductId,
    assetId,
    status: row.status as OperationStatus,
    providerOutcome: row.providerOutcome as ProviderOutcome,
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    screenshotPath: typeof result.screenshotPath === 'string' ? result.screenshotPath : null,
    completedAt: row.completedAt,
    updatedAt: row.updatedAt,
  };
}
