import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { COUPANG_CATALOG_BROWSER_FILE_NAME } from '@kiditem/shared/coupang-catalog-snapshot';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { hashCatalogChunkPayload } from '../../../application/service/channel-catalog-collection.service';
import {
  assertCatalogRunning,
  catalogAccountVendor,
  catalogAlertKey,
  catalogPublicationRevision,
  catalogWhere,
  CATALOG_DETAIL_URL,
  CATALOG_LIST_URL,
  CATALOG_PARSER,
  CATALOG_SOURCE,
  CATALOG_STAGING_SOURCE,
  lockCatalogAccount,
  lockCatalogAttempt,
} from './channel-catalog-attempt-fence';
import type { ChannelCatalogCollectionRepositoryPort } from '../../../application/port/out/repository/channel-catalog-collection.repository.port';

type StartInput = Parameters<ChannelCatalogCollectionRepositoryPort['startOrResume']>[0];
type OwnedInput = Parameters<ChannelCatalogCollectionRepositoryPort['getOwnedRunWithChunks']>[0];
type PutInput = Parameters<ChannelCatalogCollectionRepositoryPort['putChunk']>[0];
type FailInput = Parameters<ChannelCatalogCollectionRepositoryPort['markFailed']>[0];

@Injectable()
export class ChannelCatalogCollectionRepositoryAdapter implements ChannelCatalogCollectionRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}
  async startOrResume(input: StartInput) {
    return this.prisma
      .$transaction(async (tx) => {
        await lockCatalogAccount(tx, input);
        const requestFingerprint = hashCatalogChunkPayload({
          channelAccountId: input.channelAccountId,
          collectorVersion: input.collectorVersion,
        });
        const existing = await tx.sourceImportRun.findFirst({
          where: {
            organizationId: input.organizationId,
            sourceType: CATALOG_SOURCE,
            idempotencyKey: input.idempotencyKey,
          },
        });
        if (existing) {
          if (
            existing.channelAccountId !== input.channelAccountId ||
            existing.parserVersion !== CATALOG_PARSER ||
            existing.requestFingerprint !== requestFingerprint
          )
            throw new ConflictException('Idempotency-Key has a different catalog input');
          return readOwned(tx, { ...input, runId: existing.id });
        }
        const vendorId = await catalogAccountVendor(tx, input);
        const active = await tx.sourceImportRun.findMany({
          where: { ...catalogWhere(input), status: 'running' },
        });
        for (const previous of active) {
          if (previous.expiresAt && previous.expiresAt.getTime() > Date.now())
            throw new ConflictException({
              code: 'ATTEMPT_IN_PROGRESS',
              attemptId: previous.id,
              message: `이미 수집 중인 시도(${previous.id})가 있습니다. 해당 수집 상태를 확인해주세요.`,
            });
          // Serialize expiration with uploads as well as terminal publication.
          const locked = await lockCatalogAttempt(tx, {
            ...input,
            runId: previous.id,
            attemptToken: previous.attemptToken,
          });
          if (locked.status === 'running')
            await this.saveFailure(tx, {
              ...input,
              runId: previous.id,
              attemptToken: previous.attemptToken,
              error: {
                code: 'ATTEMPT_EXPIRED',
                message: 'Catalog attempt expired',
                phase: 'discovery',
              },
            });
        }
        const generation = await tx.sourceImportRun.aggregate({
          where: catalogWhere(input),
          _max: { freshnessGeneration: true },
        });
        const plan = {
          collectorVersion: input.collectorVersion,
          listUrl: CATALOG_LIST_URL,
          detailUrl: CATALOG_DETAIL_URL,
          channelAccountId: input.channelAccountId,
          vendorId,
          publicationRevision: (await catalogPublicationRevision(tx, input)).toString(),
        };
        const owner = await tx.sourceImportRun.create({
          data: {
            ...catalogWhere(input),
            fileName: COUPANG_CATALOG_BROWSER_FILE_NAME,
            status: 'running',
            idempotencyKey: input.idempotencyKey,
            requestFingerprint,
            plan,
            createdBy: input.userId,
            freshnessGeneration: (generation._max.freshnessGeneration ?? 0n) + 1n,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
        await tx.channelScrapeRun.create({
          data: {
            organizationId: input.organizationId,
            channelAccountId: input.channelAccountId,
            sourceImportRunId: owner.id,
            channel: 'coupang',
            source: CATALOG_STAGING_SOURCE,
            pageType: 'catalog_full_snapshot',
            parserVersion: input.collectorVersion,
          },
        });
        return readOwned(tx, { ...input, runId: owner.id });
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw new ConflictException('Idempotency-Key has a different catalog input');
        throw error;
      });
  }
  getOwnedRunWithChunks(input: OwnedInput) {
    return readOwned(this.prisma, input);
  }
  putChunk(input: PutInput) {
    return this.prisma.$transaction(async (tx) => {
      const owner = await lockCatalogAttempt(tx, input);
      assertCatalogRunning(owner);
      const run = await readOwned(tx, input);
      const existing = run.chunks.find(
        (chunk) => chunk.kind === input.kind && chunk.sequence === input.sequence,
      );
      if (existing) {
        if (existing.checksum !== input.checksum)
          throw new ConflictException('Chunk coordinate already exists with a different checksum');
        return { stored: false, chunk: existing };
      }
      const chunk = await tx.channelScrapeChunk.create({
        data: {
          organizationId: input.organizationId,
          scrapeRunId: run.collectionRunId,
          kind: input.kind,
          sequence: input.sequence,
          checksum: input.checksum,
          itemCount: input.itemCount,
          payload: input.payload as Prisma.InputJsonValue,
        },
        select: chunkSelect,
      });
      assertCatalogRunning(owner);
      return { stored: true, chunk };
    });
  }
  async markFailed(input: FailInput) {
    return this.prisma.$transaction(async (tx) => {
      await lockCatalogAccount(tx, input);
      const owner = await lockCatalogAttempt(tx, input);
      const checksum = hashCatalogChunkPayload(input.error);
      if (owner.status === 'failed' && owner.contentChecksum === checksum)
        return readOwned(tx, input);
      assertCatalogRunning(owner);
      await this.saveFailure(tx, input);
      return readOwned(tx, input);
    });
  }
  private async saveFailure(tx: Prisma.TransactionClient, input: FailInput) {
    const changed = await tx.sourceImportRun.updateMany({
      where: {
        ...catalogWhere(input),
        id: input.runId,
        status: 'running',
        attemptToken: input.attemptToken,
      },
      data: {
        status: 'failed',
        importedAt: new Date(),
        errorCode: input.error.code,
        errorMessage: input.error.message,
        qualityReport: { error: input.error },
        contentChecksum: hashCatalogChunkPayload(input.error),
      },
    });
    if (changed.count !== 1) throw new ConflictException('Catalog attempt lost its failure fence');
    if (input.error.code !== 'USER_CANCELLED')
      await this.alerts.upsertSourceFailure(tx, {
        organizationId: input.organizationId,
        dedupeKey: catalogAlertKey(input.channelAccountId),
        sourceType: CATALOG_SOURCE,
        attemptId: input.runId,
        severity: 'error',
        title: 'Wing catalog collection failed',
        message: input.error.message,
        href: `/product-pipeline/registered-products?collectionAttempt=${input.runId}&channelAccountId=${input.channelAccountId}`,
      });
  }
}
const chunkSelect = {
  id: true,
  kind: true,
  sequence: true,
  checksum: true,
  itemCount: true,
  payload: true,
} as const;
async function readOwned(tx: Prisma.TransactionClient, input: OwnedInput) {
  const owner = await tx.sourceImportRun.findFirst({
    where: { ...catalogWhere(input), id: input.runId },
    include: {
      channelScrapeRuns: {
        where: {
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          source: CATALOG_STAGING_SOURCE,
        },
        include: {
          chunks: {
            orderBy: [{ kind: 'asc' }, { sequence: 'asc' }],
            select: chunkSelect,
          },
        },
      },
    },
  });
  const staging = owner?.channelScrapeRuns[0];
  if (!owner || !staging || !owner.expiresAt || !owner.idempotencyKey)
    throw new NotFoundException('Catalog attempt not found');
  return {
    id: owner.id,
    collectionRunId: staging.id,
    organizationId: owner.organizationId,
    channelAccountId: input.channelAccountId,
    idempotencyKey: owner.idempotencyKey,
    attemptToken: owner.attemptToken,
    expiresAt: owner.expiresAt,
    plan: owner.plan,
    status: owner.status,
    rowCount: owner.rowCount,
    errorCount: owner.errorCode ? 1 : 0,
    startedAt: owner.createdAt,
    createdAt: owner.createdAt,
    updatedAt: owner.updatedAt,
    finishedAt: owner.importedAt,
    metaJson: owner.qualityReport,
    errorJson: owner.errorCode
      ? {
          code: owner.errorCode,
          message: owner.errorMessage,
          ...jsonRecord(jsonRecord(owner.qualityReport)?.error),
        }
      : null,
    sourceImportRunId: owner.id,
    chunks: staging.chunks,
  };
}
function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
