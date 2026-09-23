import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type ProductRegistrationExecution } from '@prisma/client';
import type { OperationStatus, ProviderOutcome } from '@kiditem/shared/registration-execution';
import { THUMBNAIL_UPDATE_EXECUTION_KIND } from '@kiditem/shared/thumbnail-execution';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ThumbnailExecutionPersistencePort,
  ThumbnailExecutionRow,
} from '../../../application/port/out/persistence/thumbnail-execution.persistence.port';
import type { ThumbnailReportTransition, ThumbnailUpdatePayload } from '../../../domain/registration/thumbnail-update';

const COUPANG_CHANNEL = 'coupang';
const LIVE_STATUSES = ['prepared', 'executing', 'reconciling'] as const;
const REPORTABLE_STATUSES = ['executing', 'reconciling'] as const;

/**
 * 대표이미지 몰 반영 실행의 저장소. `ProductRegistrationExecution` 중
 * `executionKind = 'thumbnail_update'` 행만 읽고 쓴다.
 */
@Injectable()
export class ThumbnailExecutionPersistenceAdapter implements ThumbnailExecutionPersistencePort {
  constructor(private readonly prisma: PrismaService) {}

  async readAccountEvidence(input: { organizationId: string; channelListingId: string | null; salesProductId: string | null }) {
    const activeAccounts = await this.prisma.channelAccount.findMany({
      where: { organizationId: input.organizationId, channel: COUPANG_CHANNEL, status: 'active' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    const activeCoupangAccountIds = activeAccounts.map((account) => account.id);
    const listingWhere = {
      organizationId: input.organizationId,
      isActive: true,
      channelAccount: { channel: COUPANG_CHANNEL, status: 'active' },
    } satisfies Prisma.ChannelListingWhereInput;

    if (input.channelListingId) {
      const listing = await this.prisma.channelListing.findFirst({
        where: { ...listingWhere, id: input.channelListingId },
        select: { id: true, channelAccountId: true },
      });
      if (!listing) throw new NotFoundException('쿠팡 listing 을 찾을 수 없습니다');
      return { listingAccountId: listing.channelAccountId, channelListingId: listing.id, activeCoupangAccountIds };
    }
    if (input.salesProductId) {
      const listings = await this.prisma.channelListing.findMany({
        where: { ...listingWhere, salesProductId: input.salesProductId },
        select: { id: true, channelAccountId: true },
        take: 2,
      });
      if (listings.length === 1) {
        return { listingAccountId: listings[0]!.channelAccountId, channelListingId: listings[0]!.id, activeCoupangAccountIds };
      }
    }
    return { listingAccountId: null, channelListingId: null, activeCoupangAccountIds };
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
  }): Promise<{ mode: 'created'; executionId: string } | { mode: 'replay'; execution: ThumbnailExecutionRow } | { mode: 'live_conflict' }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`thumbnail_update:${input.organizationId}:${input.payload.generationId}`}, 0))::text AS "lock"`;
        const replay = await this.findReplay(tx, input);
        if (replay) return replay;
        const live = await tx.productRegistrationExecution.findFirst({
          where: {
            organizationId: input.organizationId,
            executionKind: THUMBNAIL_UPDATE_EXECUTION_KIND,
            status: { in: [...LIVE_STATUSES] },
            submissionPayloadJson: { path: ['generationId'], equals: input.payload.generationId },
          },
          select: { id: true },
        });
        if (live) return { mode: 'live_conflict' as const };
        const now = new Date();
        const created = await tx.productRegistrationExecution.create({
          data: {
            organizationId: input.organizationId,
            channelAccountId: input.channelAccountId,
            channelListingId: input.payload.channelListingId,
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
      // 같은 owner 키의 동시 요청은 advisory lock 이 막지만, 같은 listing 의 다른 종류 실행은
      // 부분 unique index 가 막는다. 어느 쪽이든 이 생성의 새 실행은 만들 수 없다.
      const replay = await this.findReplay(this.prisma, input);
      return replay ?? { mode: 'live_conflict' };
    }
  }

  async applyReport(input: {
    organizationId: string;
    executionId: string;
    transition: ThumbnailReportTransition;
    screenshotPath: string | null;
    externalId: string | null;
  }): Promise<{ mode: 'applied'; execution: ThumbnailExecutionRow } | { mode: 'rejected'; status: OperationStatus } | { mode: 'not_found' }> {
    return this.prisma.$transaction(async (tx) => {
      const where = { id: input.executionId, organizationId: input.organizationId, executionKind: THUMBNAIL_UPDATE_EXECUTION_KIND };
      const current = await tx.productRegistrationExecution.findFirst({ where, select: { status: true, resultJson: true } });
      if (!current) return { mode: 'not_found' as const };
      const terminal = input.transition.status !== 'reconciling';
      const updated = await tx.productRegistrationExecution.updateMany({
        where: { ...where, status: { in: [...REPORTABLE_STATUSES] } },
        data: {
          status: input.transition.status,
          providerOutcome: input.transition.providerOutcome,
          lastErrorCode: input.transition.errorCode,
          lastErrorMessage: input.transition.errorMessage?.slice(0, 2_000) ?? null,
          resultJson: {
            ...resultObject(current.resultJson),
            screenshotPath: input.screenshotPath,
            externalId: input.externalId,
          } as Prisma.InputJsonValue,
          ...(terminal ? { completedAt: new Date() } : {}),
        },
      });
      if (updated.count !== 1) return { mode: 'rejected' as const, status: current.status as OperationStatus };
      const row = await tx.productRegistrationExecution.findFirstOrThrow({ where });
      return { mode: 'applied' as const, execution: toRow(row) };
    });
  }

  async findLatest(input: { organizationId: string; generationIds: readonly string[] }): Promise<ThumbnailExecutionRow[]> {
    if (input.generationIds.length === 0) return [];
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT ON (submission_payload_json->>'generationId') id::text AS id
      FROM product_registration_executions
      WHERE organization_id = ${input.organizationId}::uuid
        AND execution_kind = ${THUMBNAIL_UPDATE_EXECUTION_KIND}
        AND submission_payload_json->>'generationId' = ANY(${[...input.generationIds]}::text[])
        AND NOT (status = 'failed' AND result_json ? 'dismissedAt')
      ORDER BY submission_payload_json->>'generationId', created_at DESC, id DESC
    `;
    if (ids.length === 0) return [];
    const rows = await this.prisma.productRegistrationExecution.findMany({
      where: { organizationId: input.organizationId, id: { in: ids.map((row) => row.id) } },
    });
    return rows.map(toRow);
  }

  async dismissLatestFailed(input: { organizationId: string; generationId: string }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`thumbnail_update:${input.organizationId}:${input.generationId}`}, 0))::text AS "lock"`;
      const failed = await tx.productRegistrationExecution.findMany({
        where: {
          organizationId: input.organizationId,
          executionKind: THUMBNAIL_UPDATE_EXECUTION_KIND,
          status: 'failed',
          submissionPayloadJson: { path: ['generationId'], equals: input.generationId },
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
    input: { organizationId: string; idempotencyKey: string; ownerIdempotencyKey: string | null; requestHash: string; payload: ThumbnailUpdatePayload },
  ): Promise<{ mode: 'replay'; execution: ThumbnailExecutionRow } | null> {
    if (!input.ownerIdempotencyKey) return null;
    const existing = await client.productRegistrationExecution.findFirst({
      where: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey },
    });
    if (!existing) return null;
    if (existing.executionKind !== THUMBNAIL_UPDATE_EXECUTION_KIND
      || existing.ownerIdempotencyKey !== input.ownerIdempotencyKey
      || existing.requestHash !== input.requestHash
      || payloadGenerationId(existing.submissionPayloadJson) !== input.payload.generationId) {
      throw new ConflictException('Wing registration owner idempotency key conflicted.');
    }
    return { mode: 'replay', execution: toRow(existing) };
  }
}

function resultObject(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } as Record<string, Prisma.JsonValue> : {};
}

function payloadGenerationId(value: Prisma.JsonValue | null): string | null {
  const generationId = resultObject(value).generationId;
  return typeof generationId === 'string' ? generationId : null;
}

function toRow(row: ProductRegistrationExecution): ThumbnailExecutionRow {
  const result = resultObject(row.resultJson);
  const generationId = payloadGenerationId(row.submissionPayloadJson);
  if (!generationId) throw new Error(`thumbnail_update execution ${row.id} has no frozen generation id`);
  return {
    id: row.id,
    generationId,
    status: row.status as OperationStatus,
    providerOutcome: row.providerOutcome as ProviderOutcome,
    lastErrorMessage: row.lastErrorMessage,
    screenshotPath: typeof result.screenshotPath === 'string' ? result.screenshotPath : null,
    completedAt: row.completedAt,
    updatedAt: row.updatedAt,
    dismissedAt: typeof result.dismissedAt === 'string' ? new Date(result.dismissedAt) : null,
  };
}
