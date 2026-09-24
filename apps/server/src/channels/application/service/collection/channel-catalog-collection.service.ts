import type { ChannelIntegrityPort } from '../../port/out/integrity/channel-integrity.port';
import { ChannelInputError as BadRequestException, ChannelConflictError as ConflictException } from '../../../domain/exception/channel-business-error';
import {
  CoupangCatalogCollectionErrorRequestSchema,
  CoupangCatalogCollectionPauseRequestSchema,
  CoupangCatalogCollectionRunSchema,
  CoupangCatalogCollectionPermitSchema,
  CoupangCatalogCollectionPlanSchema,
  CoupangCatalogCollectionQualitySchema,
  FinalizeCoupangCatalogCollectionRequestSchema,
  PutCoupangCatalogChunkRequestSchema,
  StartCoupangCatalogCollectionRequestSchema,
  type CoupangCatalogCollectionPhase,
  type CoupangCatalogCollectionRun,
  type CoupangCatalogCollectionPermit,
  type CoupangCatalogSourceStatus,
  type CoupangCatalogStage,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { z, type ZodType } from 'zod';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import {
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from '@kiditem/shared/source-import';
import {
  CHANNEL_CATALOG_COLLECTION_REPOSITORY_PORT,
  type ChannelCatalogCollectionRepositoryPort,
  type ChannelCatalogCollectionWithChunks,
} from '../../port/out/repository/channel-catalog-collection.repository.port';
import {
  CHANNEL_CATALOG_PUBLICATION_PORT,
  type ChannelCatalogPublicationPort,
} from '../../port/out/repository/channel-catalog-publication.port';
import type { ChannelCatalogCollectionPort } from '../../port/in/channel-catalog-collection.port';
import {
  assembleFullDetailsSnapshot,
  assembleListingBasicsSnapshot,
  inspectChunks,
  jsonRecord,
  missingDiscoverySequences,
  missingStageProductIds,
  missingDetailTargetIds,
  detailTargetProductIds,
  isDetailRefetchPlan,
  stringValue,
  type InspectedChunks,
} from '../../../domain/collection/catalog-chunk-snapshot';
import {
  hashCatalogChunkPayload,
  hashCatalogChunkReceipts,
  hashCatalogStageSnapshot,
} from '../../../domain/collection/catalog-collection-hash';

export class ChannelCatalogCollectionService implements ChannelCatalogCollectionPort {
  constructor(

    private readonly repository: ChannelCatalogCollectionRepositoryPort,

    private readonly publisher: ChannelCatalogPublicationPort,
    private readonly integrity: ChannelIntegrityPort,
  ) {}

  async start(
    input: Parameters<ChannelCatalogCollectionPort['start']>[0],
  ): Promise<CoupangCatalogCollectionPermit> {
    const request = parseRequest(StartCoupangCatalogCollectionRequestSchema, input.request);
    // 상품 하나 상세 다시 받기는 목록 단계 기준 없이 details 단계로만 연다 (KID-348).
    if (request.detailProductIds && (request.stage !== 'details' || request.expectedBasicAttemptId)) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', {
        details: { reason: 'CATALOG_REFETCH_REQUEST_INVALID', field: 'detailProductIds' },
      });
    }
    const run = await this.repository.startOrResume({
      organizationId: input.organizationId,
      userId: input.userId,
      channelAccountId: input.channelAccountId,
      idempotencyKey: parseRequest(z.string().uuid(), input.idempotencyKey),
      collectorVersion: request.collectorVersion,
      stage: request.stage,
      ...(request.expectedBasicAttemptId
        ? { expectedBasicAttemptId: parseRequest(z.string().uuid(), request.expectedBasicAttemptId) }
        : {}),
      ...(request.detailProductIds ? { detailProductIds: request.detailProductIds } : {}),
    });
    return CoupangCatalogCollectionPermitSchema.parse({
      attemptId: run.id,
      attemptToken: run.attemptToken,
      state: effectiveState(run),
      expiresAt: run.expiresAt.toISOString(),
      plan: run.plan,
    });
  }

  async getStatus(
    input: Parameters<ChannelCatalogCollectionPort['getStatus']>[0],
  ): Promise<CoupangCatalogCollectionRun> {
    const compactRun = await this.repository.getOwnedRunWithChunks({
      ...input,
      includePayload: false,
    });
    const linkedDetailsRun = await this.readLinkedDetailsRun(input, compactRun);
    const compactStatus = buildCollectionStatus(compactRun, linkedDetailsRun, (value) => this.integrity.sha256(value));
    // The canonical snapshot hash is intentionally based on the full staged
    // products. Load those JSON payloads only after compact receipts prove the
    // run is ready; ordinary progress/status polling stays small.
    if (
      compactStatus.phase === 'ready_to_finalize'
      && compactRun.chunks.some((chunk) => chunk.payload === undefined)
    ) {
      return buildCollectionStatus(await this.repository.getOwnedRunWithChunks({
        ...input,
        includePayload: true,
      }), linkedDetailsRun, (value) => this.integrity.sha256(value));
    }
    return compactStatus;
  }

  private readLinkedDetailsRun(
    input: Parameters<ChannelCatalogCollectionPort['getStatus']>[0],
    run: ChannelCatalogCollectionWithChunks,
  ) {
    const plan = CoupangCatalogCollectionPlanSchema.safeParse(run.plan);
    const stage = run.stage;
    if (!plan.success || stage !== 'basics' || !plan.data.detailsIdempotencyKey)
      return Promise.resolve<ChannelCatalogCollectionWithChunks | null>(null);
    return this.repository.getOwnedDetailsChild({
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      rootAttemptId: run.id,
      detailsIdempotencyKey: plan.data.detailsIdempotencyKey,
      includePayload: false,
    });
  }

  async putChunk(
    input: Parameters<ChannelCatalogCollectionPort['putChunk']>[0],
  ): Promise<CoupangCatalogCollectionRun> {
    const request = parseRequest(PutCoupangCatalogChunkRequestSchema, input.request);
    if (request.kind !== input.kind || request.sequence !== input.sequence) {
      throw new BadRequestException('Chunk kind and sequence must match the request path');
    }
    const expectedChecksum = hashCatalogChunkPayload(request.payload, (value) => this.integrity.sha256(value));
    if (request.checksum !== expectedChecksum) {
      throw new BadRequestException('Chunk checksum does not match its canonical payload');
    }
    await this.repository.putChunk({
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      runId: input.runId,
      attemptToken: input.attemptToken,
      kind: request.kind,
      sequence: request.sequence,
      checksum: request.checksum,
      itemCount: request.itemCount,
      payload: request.payload,
    });
    return this.getStatus(input);
  }

  async fail(
    input: Parameters<ChannelCatalogCollectionPort['fail']>[0],
  ): Promise<CoupangCatalogCollectionRun> {
    const request = parseRequest(CoupangCatalogCollectionErrorRequestSchema, input.request);
    await this.repository.markFailed({
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      runId: input.runId,
      attemptToken: input.attemptToken,
      error: request,
    });
    return this.getStatus(input);
  }

  async pause(
    input: Parameters<ChannelCatalogCollectionPort['pause']>[0],
  ): Promise<CoupangCatalogCollectionRun> {
    const request = parseRequest(CoupangCatalogCollectionPauseRequestSchema, input.request);
    await this.repository.markPaused({
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      runId: input.runId,
      attemptToken: input.attemptToken,
      error: request,
    });
    return this.getStatus(input);
  }

  async finalize(
    input: Parameters<ChannelCatalogCollectionPort['finalize']>[0],
  ): Promise<CoupangCatalogCollectionRun> {
    const request = parseRequest(FinalizeCoupangCatalogCollectionRequestSchema, input.request);
    const run = await this.repository.getOwnedRunWithChunks({
      ...input,
      includePayload: true,
    });
    if (!input.attemptToken || input.attemptToken !== run.attemptToken)
      throw new ConflictException('Catalog attempt token mismatch');
    if (
      run.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS &&
      jsonRecord(run.metaJson)?.snapshotHash !== request.snapshotHash
    )
      throw new ConflictException('Completed collection has a different snapshot hash');
    const stage = run.stage;
    const snapshot = stage === 'basics'
      ? assembleListingBasicsSnapshot(run.chunks)
      : assembleFullDetailsSnapshot(run.chunks, run.plan);
    const serverHash = hashCatalogStageSnapshot(snapshot.products, (value) => this.integrity.sha256(value));
    if (request.snapshotHash !== serverHash) {
      throw new BadRequestException('Snapshot hash does not match the server canonical snapshot');
    }

    await this.publisher.publish({
      organizationId: input.organizationId,
      userId: input.userId,
      channelAccountId: input.channelAccountId,
      collectionRunId: run.collectionRunId,
      attemptId: input.runId,
      attemptToken: input.attemptToken,
      snapshotHash: serverHash,
      chunkSetHash: hashCatalogChunkReceipts(run.chunks, (value) => this.integrity.sha256(value)),
      stage,
    });
    return this.getStatus(input);
  }

  async cancel(
    input: Parameters<ChannelCatalogCollectionPort['cancel']>[0],
  ): Promise<CoupangCatalogCollectionRun> {
    await this.repository.cancel(input);
    return this.getStatus({
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      runId: input.runId,
    });
  }

  async readSource(
    input: Parameters<ChannelCatalogCollectionPort['readSource']>[0],
  ): Promise<CoupangCatalogSourceStatus> {
    const root = await this.repository.findLatestRootAttempt(input);
    if (!root) return { latestAttempt: null, detailsAttempt: null } satisfies CoupangCatalogSourceStatus;
    const latestAttempt = await this.getStatus({ ...input, runId: root.id });
    // The root read already linked the details child once the handoff admitted it.
    const detailsAttemptId =
      latestAttempt.currentStage === 'details' && latestAttempt.currentAttemptId !== latestAttempt.attemptId
        ? latestAttempt.currentAttemptId
        : undefined;
    const detailsAttempt = detailsAttemptId
      ? await this.getStatus({ ...input, runId: detailsAttemptId })
      : null;
    return { latestAttempt, detailsAttempt } satisfies CoupangCatalogSourceStatus;
  }
}

function effectiveState(run: {
  status: string;
  expiresAt: Date;
}): 'RUNNING' | 'COMPLETE' | 'FAILED' {
  return run.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS
    ? 'COMPLETE'
    : run.status === SOURCE_IMPORT_RUN_FAILED_STATUS || run.expiresAt.getTime() <= Date.now()
      ? 'FAILED'
      : 'RUNNING';
}

function buildCollectionStatus(
  run: ChannelCatalogCollectionWithChunks,
  linkedDetailsRun: ChannelCatalogCollectionWithChunks | null,
  sha256: (value: string) => string,
): CoupangCatalogCollectionRun {
  const state = inspectChunks(run.chunks);
  const metadata = jsonRecord(run.metaJson) ?? {};
  const error = jsonRecord(run.errorJson);
  const publication = jsonRecord(metadata.publication);
  const effective = effectiveState(run);
  const plan = CoupangCatalogCollectionPlanSchema.parse(run.plan);
  const stage = run.stage;
  const rootAttemptId = plan.rootAttemptId ?? (
    stage === 'details' ? plan.basicAttemptId ?? run.id : run.id
  );
  // A completed basics owner is a valid saved partial publication, but when
  // it carries a preallocated child key the whole refresh is still in flight.
  // The individual owner state remains COMPLETE; only overallState describes
  // the linked internal flow.
  const pendingDetailsHandoff = stage === 'basics' && run.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS &&
    Boolean(plan.detailsIdempotencyKey);
  const overallState = linkedDetailsRun
    ? effectiveState(linkedDetailsRun)
    // A preallocated details key means the handoff is still pending only while
    // the basics owner is itself an effective COMPLETE. Once the root expires
    // or is terminally failed, never re-expose the chain as RUNNING merely
    // because no child row was admitted.
    : pendingDetailsHandoff
      ? run.expiresAt.getTime() > Date.now() ? 'RUNNING' : 'FAILED'
      : effective;
  const currentAttemptId = linkedDetailsRun?.id ?? run.id;
  const currentStage = linkedDetailsRun?.stage ?? stage;

  const phase = derivePhase(run.status, state, stage, plan);
  const hasFullPayload = run.chunks.every((chunk) => chunk.payload !== undefined);
  const readySnapshotHash =
    phase === 'ready_to_finalize' && hasFullPayload
      ? stage === 'basics'
        ? hashCatalogStageSnapshot(assembleListingBasicsSnapshot(run.chunks).products, sha256)
        : hashCatalogStageSnapshot(assembleFullDetailsSnapshot(run.chunks, plan).products, sha256)
      : null;
  const products = stage === 'basics' ? state.basicProducts : state.detailProducts;
  // 상세도 종료 트랜잭션에서만 반영된다 (KID-348): 반영 수는 완료 뒤에만 센다.
  const completed = run.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS;
  const quality = CoupangCatalogCollectionQualitySchema.safeParse(metadata.quality);
  return CoupangCatalogCollectionRunSchema.parse({
    attemptId: run.id,
    idempotencyKey: run.idempotencyKey,
    channelAccountId: run.channelAccountId,
    state: effective,
    plan,
    expiresAt: run.expiresAt.toISOString(),
    phase,
    collectorVersion: plan.collectorVersion,
    manifest: state.manifest,
    progress: {
      discoveryPagesStored: state.discoveryPages.size,
      discoveredProducts: state.discovered.length,
      hydratedProducts: products.length,
      optionCount: state.optionCount,
      mediaCount: state.mediaCount,
      storedChunks: run.chunks.length,
      publishedProducts: completed ? products.length : 0,
      publishedOptionCount: completed ? state.optionCount : 0,
      publishedMediaCount: completed
        ? typeof metadata.publishedMediaCount === 'number' ? metadata.publishedMediaCount : state.mediaCount
        : 0,
      publishedChunks: completed
        ? run.chunks.filter((chunk) => chunk.kind === (
          stage === 'basics' ? 'listing_basics' : 'full_details'
        )).length
        : 0,
      firstPublishedAt: completed ? (run.finishedAt?.toISOString() ?? null) : null,
      lastPublishedAt: completed ? (run.finishedAt?.toISOString() ?? null) : null,
    },
    missing: {
      discoverySequences: missingDiscoverySequences(state),
      productIds: stage === 'details'
        ? missingDetailTargetIds(detailTargetProductIds(plan, state.discovered), products)
        : missingStageProductIds(
          state.discovered,
          products,
        ).split(', ').filter(Boolean),
    },
    snapshotHash:
      typeof metadata.snapshotHash === 'string' ? metadata.snapshotHash : readySnapshotHash,
    error:
      run.status === SOURCE_IMPORT_RUN_RUNNING_STATUS && effective === 'FAILED'
        ? {
            code: 'ATTEMPT_EXPIRED',
            message: 'Catalog attempt expired',
            phase,
            recoverable: false,
            notBefore: null,
          }
        : error
          ? {
              code: stringValue(error.code, 'collection_error'),
              message: stringValue(error.message, 'Collection failed'),
              phase: phaseValue(error.phase, phase),
              recoverable: error.recoverable === true || error.code === 'RATE_LIMITED',
              notBefore: typeof error.notBefore === 'string' ? error.notBefore : null,
            }
          : null,
    publication:
      publication && typeof publication.sourceImportRunId === 'string'
        ? {
            sourceImportRunId: publication.sourceImportRunId,
            duplicate: publication.duplicate === true,
            changes: numberRecord(publication.changes),
          }
        : null,
    ...(quality.success ? { quality: quality.data } : {}),
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    rootAttemptId,
    currentAttemptId,
    currentStage,
    overallState,
  });
}

function countOptions(products: Array<{ product: { options: Array<unknown> } }>): number {
  return products.reduce((sum, item) => sum + item.product.options.length, 0);
}

function countMedia(
  products: Array<{
    product: {
      media?: Array<unknown>;
      options: Array<unknown>;
    };
  }>,
): number {
  return products.reduce(
    (sum, item) =>
      sum +
      (item.product.media?.length ?? 0) +
      item.product.options.reduce<number>((optionSum, option) => {
        if (!option || typeof option !== 'object' || Array.isArray(option)) return optionSum;
        const media = (option as { media?: unknown[] }).media;
        return optionSum + (media?.length ?? 0);
      }, 0),
    0,
  );
}

function derivePhase(
  status: string,
  state: InspectedChunks,
  stage: CoupangCatalogStage,
  plan?: ReturnType<typeof CoupangCatalogCollectionPlanSchema.parse>,
): CoupangCatalogCollectionPhase {
  if (status === SOURCE_IMPORT_RUN_COMPLETED_STATUS) return 'finished';
  if (plan && isDetailRefetchPlan(plan)) {
    return state.detailProducts.length < (plan.detailTargetProductIds?.length ?? 0) ? 'hydration' : 'ready_to_finalize';
  }
  if (!state.manifest || !state.confirmation || missingDiscoverySequences(state).length > 0)
    return 'discovery';
  const products = stage === 'basics' ? state.basicProducts : state.detailProducts;
  const expected = stage === 'details' && plan
    ? detailTargetProductIds(plan, state.discovered).length
    : state.manifest.totalItems;
  if (products.length < expected) return 'hydration';
  return 'ready_to_finalize';
}

function parseRequest<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Invalid request');
  }
  return result.data;
}

function phaseValue(
  value: unknown,
  fallback: CoupangCatalogCollectionPhase,
): CoupangCatalogCollectionPhase {
  return value === 'discovery' ||
    value === 'hydration' ||
    value === 'ready_to_finalize' ||
    value === 'finished'
    ? value
    : fallback;
}

function numberRecord(value: unknown): Record<string, number> {
  const record = jsonRecord(value);
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isInteger(entry[1]) && entry[1] >= 0,
    ),
  );
}
