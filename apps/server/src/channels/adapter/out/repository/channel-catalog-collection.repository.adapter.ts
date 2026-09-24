import { ChannelIntegrityAdapter } from '../integrity/channel-integrity.adapter';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  COUPANG_CATALOG_BROWSER_FILE_NAME,
  CoupangCatalogCollectionPlanSchema,
  type CoupangCatalogStage,
} from '@kiditem/shared/coupang-catalog-snapshot';
import {
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from '@kiditem/shared/source-import';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { OPERATOR_CANCEL_CODE, OPERATOR_CANCEL_MESSAGE } from '../../../../common/operator-cancel';
import { hashCatalogChunkPayload } from '../../../domain/collection/catalog-collection-hash';
import {
  CATALOG_DETAILS_SOURCE,
  CATALOG_PARSER,
} from '../../../domain/collection/catalog-source-identity';
import {
  assertCatalogRunning,
  assertCatalogPublicationPlan,
  assertCatalogWritable,
  catalogPause,
  catalogAccountVendor,
  catalogAlertKey,
  catalogPublicationRevision,
  catalogWhere,
  CATALOG_LEGACY_DETAIL_URL,
  CATALOG_LEGACY_LIST_URL,
  CATALOG_STAGED_DETAIL_URL,
  CATALOG_STAGED_LIST_URL,
  CATALOG_STAGING_SOURCE,
  catalogSourceForStage,
  assertExpectedDetailsBasis,
  liveCatalogImport,
  liveCatalogWorkbookImport,
  lockCatalogAccount,
  lockCatalogAttempt,
  latestCompletedCatalogBasics,
} from './channel-catalog-attempt-fence';
import type { ChannelCatalogCollectionRepositoryPort } from '../../../application/port/out/repository/channel-catalog-collection.repository.port';
import {
  CHANNEL_CATALOG_PUBLICATION_PORT,
  type ChannelCatalogPublicationPort,
} from '../../../application/port/out/repository/channel-catalog-publication.port';

const channelIntegrity = new ChannelIntegrityAdapter();

type StartInput = Parameters<ChannelCatalogCollectionRepositoryPort['startOrResume']>[0];
type OwnedInput = Parameters<ChannelCatalogCollectionRepositoryPort['getOwnedRunWithChunks']>[0];
type DetailsChildInput = Parameters<ChannelCatalogCollectionRepositoryPort['getOwnedDetailsChild']>[0];
type PutInput = Parameters<ChannelCatalogCollectionRepositoryPort['putChunk']>[0];
type FailInput = Parameters<ChannelCatalogCollectionRepositoryPort['markFailed']>[0];
type PauseInput = Parameters<ChannelCatalogCollectionRepositoryPort['markPaused']>[0];
type CancelInput = Parameters<ChannelCatalogCollectionRepositoryPort['cancel']>[0];
type LatestRootInput = Parameters<ChannelCatalogCollectionRepositoryPort['findLatestRootAttempt']>[0];

@Injectable()
export class ChannelCatalogCollectionRepositoryAdapter implements ChannelCatalogCollectionRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
    @Inject(CHANNEL_CATALOG_PUBLICATION_PORT)
    private readonly publisher: ChannelCatalogPublicationPort,
  ) {}
  async startOrResume(input: StartInput) {
    return this.prisma
      .$transaction((tx) => this.admitOrResume(tx, input))
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw new ConflictException('Idempotency-Key has a different catalog input');
        throw error;
      });
  }
  // Admission runs in the caller's transaction: a begin, or an operator stop
  // that admits a pending details child so the stop can end the import.
  private async admitOrResume(tx: Prisma.TransactionClient, input: StartInput) {
    await lockCatalogAccount(tx, input);
    const stage = input.stage ?? 'full';
    // `stage` is additive. Keep the legacy full-catalog fingerprint byte
    // for omitted/explicit full requests so an in-flight pre-stage run can
    // still be recovered with the same idempotency key. Named staged
    // attempts get their own fingerprint and source type.
    const requestFingerprint = hashCatalogChunkPayload({
      channelAccountId: input.channelAccountId,
      collectorVersion: input.collectorVersion,
      ...(stage !== 'full' ? { stage } : {}),
      ...(stage === 'details'
        ? { expectedBasicAttemptId: input.expectedBasicAttemptId ?? null }
        : {}),
    }, channelIntegrity.sha256);
    const existing = await tx.sourceImportRun.findFirst({
      where: {
        organizationId: input.organizationId,
        sourceType: {
          in: [catalogSourceForStage('full'), catalogSourceForStage('basics'), catalogSourceForStage('details')],
        },
        idempotencyKey: input.idempotencyKey,
      },
    });
    if (existing) {
      if (
        existing.channelAccountId !== input.channelAccountId ||
        existing.parserVersion !== CATALOG_PARSER ||
        existing.requestFingerprint !== requestFingerprint ||
        existing.sourceType !== catalogSourceForStage(stage)
      )
        throw new ConflictException('Idempotency-Key has a different catalog input');
      if (stage === 'details') {
        await assertExpectedDetailsBasis(tx, input, existing.plan);
      }
      const locked = await lockCatalogAttempt(tx, {
        ...input,
        runId: existing.id,
        attemptToken: existing.attemptToken,
        stage,
      });
      if (locked.status === SOURCE_IMPORT_RUN_RUNNING_STATUS) {
        // Idempotent replay is also the status read for an expired
        // attempt. Preserve the immutable run and let readOwned expose
        // its effective FAILED state; only a new idempotency key may
        // retire the row and admit a fresh attempt.
        if (locked.expiresAt && locked.expiresAt.getTime() <= Date.now()) {
          return readOwned(tx, { ...input, runId: existing.id, stage, includePayload: false });
        }
        assertCatalogRunning(locked);
        const pause = catalogPause(locked);
        if (pause) {
          // A paused run is resumed only by the explicit same-key start.
          // Re-admit it against the frozen account/vendor and (for the
          // details stage) the exact completed basics basis before clearing
          // its durable provider error.
          await assertCatalogPublicationPlan(tx, input, locked.plan);
          if (pause.notBefore && Date.parse(pause.notBefore) > Date.now()) {
            throw new ConflictException({
              code: 'ATTEMPT_PAUSED',
              reason: pause.code,
              message: pause.message,
              phase: pause.phase,
              recoverable: pause.recoverable,
              notBefore: pause.notBefore,
            });
          }
          await clearCatalogPause(tx, {
            ...input,
            runId: existing.id,
            stage,
            attemptToken: existing.attemptToken,
          }, locked);
        }
      }
      return readOwned(tx, { ...input, runId: existing.id, stage, includePayload: false });
    }
    const vendorId = await catalogAccountVendor(tx, input);
    // One import runs per account: a new browser import waits for the account's
    // live import in either stage or a live workbook import. A details begin is
    // that import's own handoff, so only a workbook import holds it back.
    if (stage === 'details') {
      const workbook = await liveCatalogWorkbookImport(tx, input);
      if (workbook) throw attemptInProgress(workbook.id, WORKBOOK_IMPORT_IN_PROGRESS);
    } else {
      const live = await liveCatalogImport(tx, input);
      if (live) {
        throw live.source === 'workbook'
          ? attemptInProgress(live.attemptId, WORKBOOK_IMPORT_IN_PROGRESS)
          : attemptInProgress(live.attemptId);
      }
    }
    const active = await tx.sourceImportRun.findMany({
      where: { ...catalogWhere(input, stage), status: SOURCE_IMPORT_RUN_RUNNING_STATUS },
    });
    for (const previous of active) {
      if (previous.expiresAt && previous.expiresAt.getTime() > Date.now())
        throw attemptInProgress(previous.id);
      // Serialize expiration with uploads as well as terminal publication.
      const locked = await lockCatalogAttempt(tx, {
        ...input,
        runId: previous.id,
        attemptToken: previous.attemptToken,
        stage,
      });
      if (locked.status === SOURCE_IMPORT_RUN_RUNNING_STATUS)
        await this.saveFailure(tx, {
          ...input,
          runId: previous.id,
          attemptToken: previous.attemptToken,
          stage,
          error: {
            code: 'ATTEMPT_EXPIRED',
            message: 'Catalog attempt expired',
            phase: 'discovery',
          },
        });
    }
    const generation = await tx.sourceImportRun.aggregate({
      where: catalogWhere(input, stage),
      _max: { freshnessGeneration: true },
    });
    const basics = stage === 'details' ? await latestCompletedCatalogBasics(tx, input) : null;
    if (stage === 'details' && !basics) {
      throw new ConflictException('A completed basic catalog publication is required first');
    }
    if (stage === 'details' && input.expectedBasicAttemptId &&
      basics?.id !== input.expectedBasicAttemptId) {
      throw new ConflictException('The details attempt is pinned to a different basic catalog publication');
    }
    const ownerId = randomUUID();
    const detailsIdempotencyKey = stage === 'basics' ? randomUUID() : undefined;
    const plan = {
      collectorVersion: input.collectorVersion,
      stage,
      listUrl: stage === 'full' ? CATALOG_LEGACY_LIST_URL : CATALOG_STAGED_LIST_URL,
      detailUrl: stage === 'full' ? CATALOG_LEGACY_DETAIL_URL : CATALOG_STAGED_DETAIL_URL,
      channelAccountId: input.channelAccountId,
      vendorId,
      publicationRevision: (await catalogPublicationRevision(tx, input, stage)).toString(),
      rootAttemptId: stage === 'details' ? input.expectedBasicAttemptId ?? basics?.id : ownerId,
      ...(detailsIdempotencyKey ? { detailsIdempotencyKey } : {}),
      ...(basics
        ? {
            basicAttemptId: basics.id,
            basicManifestHash: basics.manifestHash,
            basicPublicationSequence: basics.publicationSequence,
            basicProductIds: basics.productIds,
            ...(basics.detailTargetProductIds ? { detailTargetProductIds: basics.detailTargetProductIds } : {}),
            ...(basics.absentProductIds ? { absentProductIds: basics.absentProductIds } : {}),
          }
        : {}),
    };
    const owner = await tx.sourceImportRun.create({
      data: {
        id: ownerId,
        ...catalogWhere(input, stage),
        fileName: COUPANG_CATALOG_BROWSER_FILE_NAME,
        status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
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
        pageType: stage === 'basics' ? 'catalog_listing_basics' : stage === 'details' ? 'catalog_full_details' : 'catalog_full_snapshot',
        parserVersion: input.collectorVersion,
      },
    });
    return readOwned(tx, { ...input, runId: owner.id, stage, includePayload: false });
  }
  /**
   * Operator stop without the attempt token (KID-147). A stopped root also
   * stops the details child running under it. A completed basics root whose
   * handoff is still pending gets its preallocated child admitted and stopped,
   * as a stopped extension does, so the whole import ends and the extension's
   * own admission of that child reads the end.
   */
  async cancel(input: CancelInput) {
    await this.prisma.$transaction(async (tx) => {
      await lockCatalogAccount(tx, input);
      const target = await tx.sourceImportRun.findFirst({
        where: {
          id: input.runId,
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          parserVersion: CATALOG_PARSER,
          sourceType: {
            in: [catalogSourceForStage('full'), catalogSourceForStage('basics'), catalogSourceForStage('details')],
          },
        },
        select: { id: true, sourceType: true, status: true, plan: true, expiresAt: true },
      });
      if (!target) throw new NotFoundException('Catalog attempt not found');
      const stage = sourceStage(target.sourceType);
      if (target.status === SOURCE_IMPORT_RUN_RUNNING_STATUS || stage !== 'basics') {
        await this.stopRunningAttempt(tx, input, target.id, stage);
        return;
      }
      const plan = CoupangCatalogCollectionPlanSchema.safeParse(target.plan);
      const detailsIdempotencyKey = plan.success ? plan.data.detailsIdempotencyKey : undefined;
      // A failed basics root, or a standalone basics publication, has nothing left to stop.
      if (target.status !== SOURCE_IMPORT_RUN_COMPLETED_STATUS || !plan.success || !detailsIdempotencyKey) return;
      const child = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          parserVersion: CATALOG_PARSER,
          sourceType: CATALOG_DETAILS_SOURCE,
          idempotencyKey: detailsIdempotencyKey,
        },
        select: { id: true, plan: true },
      });
      if (child && jsonRecord(child.plan)?.rootAttemptId === target.id) {
        await this.stopRunningAttempt(tx, input, child.id, 'details');
        return;
      }
      // Once the root's lease passed, the pending handoff already ended.
      if (!target.expiresAt || target.expiresAt.getTime() <= Date.now()) return;
      const admitted = await this.admitOrResume(tx, {
        organizationId: input.organizationId,
        userId: input.userId,
        channelAccountId: input.channelAccountId,
        idempotencyKey: detailsIdempotencyKey,
        collectorVersion: plan.data.collectorVersion,
        stage: 'details',
        expectedBasicAttemptId: target.id,
      });
      await this.stopRunningAttempt(tx, input, admitted.id, 'details');
    });
  }
  async findLatestRootAttempt(input: LatestRootInput) {
    return this.prisma.sourceImportRun.findFirst({
      where: {
        organizationId: input.organizationId,
        channelAccountId: input.channelAccountId,
        parserVersion: CATALOG_PARSER,
        sourceType: { in: [catalogSourceForStage('full'), catalogSourceForStage('basics')] },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
  }
  // The stop ends the attempt through the owner's failure path under its row
  // lock, so uploads and terminal writes serialize with it. A lease that
  // already passed settles as expiry with its Alert; USER_CANCELLED opens none.
  private async stopRunningAttempt(
    tx: Prisma.TransactionClient,
    input: CancelInput,
    runId: string,
    stage: CoupangCatalogStage,
  ) {
    const run = await tx.sourceImportRun.findFirst({
      where: { ...catalogWhere(input, stage), id: runId },
      select: { attemptToken: true },
    });
    if (!run) throw new NotFoundException('Catalog attempt not found');
    const locked = await lockCatalogAttempt(tx, { ...input, runId, attemptToken: run.attemptToken, stage });
    if (locked.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) return;
    const expired = !locked.expiresAt || locked.expiresAt.getTime() <= Date.now();
    await this.saveFailure(tx, {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      runId,
      attemptToken: locked.attemptToken,
      stage,
      error: expired
        ? { code: 'ATTEMPT_EXPIRED', message: 'Catalog attempt expired', phase: 'discovery' }
        : { code: OPERATOR_CANCEL_CODE, message: OPERATOR_CANCEL_MESSAGE, phase: 'discovery' },
    });
  }
  getOwnedRunWithChunks(input: OwnedInput) {
    return readOwned(this.prisma, input);
  }
  getOwnedDetailsChild(input: DetailsChildInput) {
    return readOwnedDetailsChild(this.prisma, input);
  }
  putChunk(input: PutInput) {
    return this.prisma.$transaction(async (tx) => {
      await lockCatalogAccount(tx, input);
      const stage = await ownerStage(tx, input);
      const owner = await lockCatalogAttempt(tx, { ...input, stage });
      assertCatalogWritable(owner);
      assertCatalogChunkKindForStage(stage, input.kind);
      const staging = await tx.channelScrapeRun.findFirst({
        where: {
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          sourceImportRunId: owner.id,
          source: CATALOG_STAGING_SOURCE,
        },
        select: { id: true },
      });
      if (!staging) throw new NotFoundException('Catalog staging container not found');
      const existing = await tx.channelScrapeChunk.findFirst({
        where: {
          organizationId: input.organizationId,
          scrapeRunId: staging.id,
          kind: input.kind,
          sequence: input.sequence,
        },
        select: chunkSelect,
      });
      if (existing) {
        if (existing.checksum !== input.checksum)
          throw new ConflictException('Chunk coordinate already exists with a different checksum');
        if (input.kind === 'full_details' && !existing.publishedAt) {
          if (!this.publisher)
            throw new ConflictException('Detail publication capability is not configured');
          await this.publisher.publishDetailChunk({
            transaction: tx,
            organizationId: input.organizationId,
            channelAccountId: input.channelAccountId,
            collectionRunId: staging.id,
            attemptId: owner.id,
            attemptToken: input.attemptToken,
            chunk: existing,
          });
        }
        return { stored: false, chunk: existing };
      }
      const chunk = await tx.channelScrapeChunk.create({
        data: {
          organizationId: input.organizationId,
          scrapeRunId: staging.id,
          kind: input.kind,
          sequence: input.sequence,
          checksum: input.checksum,
          itemCount: input.itemCount,
          payload: input.payload as Prisma.InputJsonValue,
          publicationJson: {
            projection: compactChunkProjection(input.kind, input.payload),
          } as Prisma.InputJsonValue,
        },
        select: chunkSelect,
      });
      if (input.kind === 'full_details') {
        if (!this.publisher)
          throw new ConflictException('Detail publication capability is not configured');
        await this.publisher.publishDetailChunk({
          transaction: tx,
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          collectionRunId: staging.id,
          attemptId: owner.id,
          attemptToken: input.attemptToken,
          chunk,
        });
      }
      assertCatalogWritable(owner);
      return { stored: true, chunk };
    });
  }
  async markFailed(input: FailInput) {
    return this.prisma.$transaction(async (tx) => {
      await lockCatalogAccount(tx, input);
      const stage = await ownerStage(tx, input);
      const owner = await lockCatalogAttempt(tx, { ...input, stage });
      const checksum = hashCatalogChunkPayload(input.error, channelIntegrity.sha256);
      if (owner.status === SOURCE_IMPORT_RUN_FAILED_STATUS && owner.contentChecksum === checksum)
        return readOwned(tx, { ...input, stage, includePayload: false });
      assertCatalogRunning(owner);
      await this.saveFailure(tx, { ...input, stage });
      return readOwned(tx, { ...input, stage, includePayload: false });
    });
  }
  async markPaused(input: PauseInput) {
    return this.prisma.$transaction(async (tx) => {
      await lockCatalogAccount(tx, input);
      const stage = await ownerStage(tx, input);
      const owner = await lockCatalogAttempt(tx, { ...input, stage });
      assertCatalogRunning(owner);
      await this.savePause(tx, { ...input, stage }, owner);
      return readOwned(tx, { ...input, stage, includePayload: false });
    });
  }
  private async saveFailure(tx: Prisma.TransactionClient, input: FailInput) {
    const changed = await tx.sourceImportRun.updateMany({
      where: {
        ...catalogWhere(input, input.stage ?? 'full'),
        id: input.runId,
        status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
        attemptToken: input.attemptToken,
      },
      data: {
        status: SOURCE_IMPORT_RUN_FAILED_STATUS,
        importedAt: new Date(),
        errorCode: input.error.code,
        errorMessage: input.error.message,
        qualityReport: { error: input.error },
        contentChecksum: hashCatalogChunkPayload(input.error, channelIntegrity.sha256),
      },
    });
    if (changed.count !== 1) throw new ConflictException('Catalog attempt lost its failure fence');
    await this.alerts.recordTerminalOutcome(tx, {
        code: input.error.code,
        organizationId: input.organizationId,
        dedupeKey: catalogAlertKey(input.channelAccountId, input.stage ?? 'full'),
        sourceType: catalogSourceForStage(input.stage ?? 'full'),
        attemptId: input.runId,
        title: 'Wing catalog collection failed',
        message: input.error.message,
        href: `/product-pipeline/registered-products?collectionAttempt=${input.runId}&channelAccountId=${input.channelAccountId}`
          + (input.stage && input.stage !== 'full' ? `&collectionStage=${input.stage}` : ''),
      });
  }

  private async savePause(
    tx: Prisma.TransactionClient,
    input: PauseInput & { stage: CoupangCatalogStage },
    owner: { qualityReport: Prisma.JsonValue | null },
  ) {
    const previous = jsonRecord(owner.qualityReport) ?? {};
    const changed = await tx.sourceImportRun.updateMany({
      where: {
        ...catalogWhere(input, input.stage),
        id: input.runId,
        status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
        attemptToken: input.attemptToken,
      },
      data: {
        errorCode: input.error.code,
        errorMessage: input.error.message,
        qualityReport: {
          ...previous,
          error: input.error,
        } as Prisma.InputJsonValue,
      },
    });
    if (changed.count !== 1) throw new ConflictException('Catalog attempt lost its pause fence');
  }
}

async function clearCatalogPause(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    channelAccountId: string;
    runId: string;
    attemptToken: string;
    stage: CoupangCatalogStage;
  },
  owner: { qualityReport: Prisma.JsonValue | null },
) {
  const quality = jsonRecord(owner.qualityReport) ?? {};
  const { error: _error, ...rest } = quality;
  const changed = await tx.sourceImportRun.updateMany({
    where: {
      ...catalogWhere(input, input.stage),
      id: input.runId,
      status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
      attemptToken: input.attemptToken,
    },
    data: {
      errorCode: null,
      errorMessage: null,
      qualityReport: Object.keys(rest).length > 0
        ? rest as Prisma.InputJsonValue
        : Prisma.DbNull,
    },
  });
  if (changed.count !== 1) throw new ConflictException('Catalog attempt lost its resume fence');
}
const WORKBOOK_IMPORT_IN_PROGRESS =
  '이 계정의 쿠팡 상품 목록 파일을 가져오는 중입니다. 끝난 뒤 다시 수집해 주세요.';
// The owner's same-source conflict, naming the live import's root attempt.
function attemptInProgress(
  attemptId: string,
  message = `이미 수집 중인 시도(${attemptId})가 있습니다. 해당 수집 상태를 확인해주세요.`,
) {
  return new ConflictException({ code: 'ATTEMPT_IN_PROGRESS', attemptId, message });
}
const chunkSelect = {
  id: true,
  kind: true,
  sequence: true,
  checksum: true,
  itemCount: true,
  payload: true,
  publishedAt: true,
  publicationJson: true,
} as const;
const chunkReceiptSelect = {
  id: true,
  kind: true,
  sequence: true,
  checksum: true,
  itemCount: true,
  publishedAt: true,
  publicationJson: true,
} as const;
async function readOwned(tx: Prisma.TransactionClient, input: OwnedInput) {
  const includePayload = input.includePayload !== false;
  const chunkSelectForRead = includePayload ? chunkSelect : chunkReceiptSelect;
  const owner = await tx.sourceImportRun.findFirst({
    where: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      parserVersion: CATALOG_PARSER,
      id: input.runId,
      ...(input.stage
        ? { sourceType: catalogSourceForStage(input.stage) }
        : { sourceType: { in: [catalogSourceForStage('full'), catalogSourceForStage('basics'), catalogSourceForStage('details')] } }),
    },
  });
  if (!owner) throw new NotFoundException('Catalog attempt not found');
  const staging = await tx.channelScrapeRun.findFirst({
    where: {
      sourceImportRunId: owner.id,
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      source: CATALOG_STAGING_SOURCE,
    },
    include: {
      chunks: {
        orderBy: [{ kind: 'asc' }, { sequence: 'asc' }],
        select: chunkSelectForRead,
      },
    },
  });
  if (!owner || !staging || !owner.expiresAt || !owner.idempotencyKey)
    throw new NotFoundException('Catalog attempt not found');
  let chunks = staging.chunks;
  if (!includePayload) {
    const legacyChunkIds = chunks
      .filter((chunk) => !hasCompactProjection(chunk.publicationJson))
      .map((chunk) => chunk.id);
    if (legacyChunkIds.length > 0) {
      const legacyChunks = await tx.channelScrapeChunk.findMany({
        where: {
          organizationId: input.organizationId,
          scrapeRunId: staging.id,
          id: { in: legacyChunkIds },
        },
        select: chunkSelect,
      });
      const fullById = new Map(legacyChunks.map((chunk) => [chunk.id, chunk]));
      chunks = chunks.map((chunk) => fullById.get(chunk.id) ?? chunk);
    }
  }
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
    stage: sourceStage(owner.sourceType),
    chunks,
  };
}

/**
 * Resolve the child from the immutable handoff coordinates on the basics
 * owner.  The details idempotency key is generated by the basics owner, but
 * it is not sufficient on its own: verify the child plan's root identity
 * before exposing its state to a root status read.
 */
async function readOwnedDetailsChild(
  tx: Prisma.TransactionClient,
  input: DetailsChildInput,
): Promise<Awaited<ReturnType<typeof readOwned>> | null> {
  const candidate = await tx.sourceImportRun.findFirst({
    where: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      parserVersion: CATALOG_PARSER,
      sourceType: CATALOG_DETAILS_SOURCE,
      idempotencyKey: input.detailsIdempotencyKey,
    },
    select: { id: true, plan: true },
  });
  if (!candidate || jsonRecord(candidate.plan)?.rootAttemptId !== input.rootAttemptId)
    return null;
  return readOwned(tx, {
    organizationId: input.organizationId,
    channelAccountId: input.channelAccountId,
    runId: candidate.id,
    stage: 'details',
    includePayload: input.includePayload,
  });
}

async function ownerStage(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; channelAccountId: string; runId: string },
): Promise<CoupangCatalogStage> {
  const owner = await tx.sourceImportRun.findFirst({
    where: {
      id: input.runId,
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      parserVersion: CATALOG_PARSER,
      sourceType: { in: [catalogSourceForStage('full'), catalogSourceForStage('basics'), catalogSourceForStage('details')] },
    },
    select: { sourceType: true },
  });
  if (!owner) throw new NotFoundException('Catalog attempt not found');
  return sourceStage(owner.sourceType);
}

function sourceStage(sourceType: string): CoupangCatalogStage {
  if (sourceType === catalogSourceForStage('basics')) return 'basics';
  if (sourceType === catalogSourceForStage('details')) return 'details';
  return 'full';
}

function assertCatalogChunkKindForStage(
  stage: CoupangCatalogStage,
  kind: string,
): void {
  const allowed = stage === 'basics'
    ? ['discovery_page', 'listing_basics', 'manifest_confirmation']
    : stage === 'details'
      ? ['discovery_page', 'full_details', 'detail_manifest_confirmation']
      : ['discovery_page', 'product_details', 'manifest_confirmation'];
  if (!allowed.includes(kind)) {
    throw new ConflictException(`Catalog chunk kind ${kind} is not valid for ${stage} stage`);
  }
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasCompactProjection(value: unknown): boolean {
  return jsonRecord(value)?.projection !== undefined;
}

/** Store only identifiers/counts/manifests for status reads. Full payloads stay
 * available in the chunk row for final hash validation and publication. */
function compactChunkProjection(kind: string, payload: unknown): Record<string, unknown> {
  const record = jsonRecord(payload) ?? {};
  if (kind === 'discovery_page') {
    const items = Array.isArray(record.items) ? record.items : [];
    return {
      kind,
      page: record.page,
      manifest: record.manifest,
      items: items.flatMap((item) => {
        const row = jsonRecord(item);
        const ordinal = row?.ordinal;
        const productId = jsonRecord(row?.product)?.externalProductId;
        const externalProductId = typeof row?.externalProductId === 'string'
          ? row.externalProductId
          : productId;
        return typeof ordinal === 'number' && typeof externalProductId === 'string'
          ? [{ ordinal, externalProductId, saleStatus: row?.saleStatus ?? null }]
          : [];
      }),
    };
  }
  if (kind === 'manifest_confirmation' || kind === 'detail_manifest_confirmation') {
    return { kind, manifest: record.manifest };
  }
  if (kind === 'listing_basics' || kind === 'product_details' || kind === 'full_details') {
    const products = Array.isArray(record.products) ? record.products : [];
    return {
      kind,
      startOrdinal: record.startOrdinal,
      products: products.flatMap((item) => {
        const row = jsonRecord(item);
        const product = jsonRecord(row?.product);
        const ordinal = row?.ordinal;
        const externalProductId = product?.externalProductId;
        const options = Array.isArray(product?.options) ? product.options : [];
        const media = (Array.isArray(product?.media) ? product.media.length : 0) +
          options.reduce((sum, option) => {
            const optionRecord = jsonRecord(option);
            return sum + (Array.isArray(optionRecord?.media) ? optionRecord.media.length : 0);
          }, 0);
        return typeof ordinal === 'number' && typeof externalProductId === 'string'
          ? [{
              ordinal,
              externalProductId,
              optionCount: options.length,
              mediaCount: media,
            }]
          : [];
      }),
    };
  }
  return { kind };
}
