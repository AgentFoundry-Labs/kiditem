import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  CoupangCatalogCollectionErrorRequestSchema,
  CoupangCatalogCollectionPauseRequestSchema,
  CoupangCatalogCollectionRunSchema,
  CoupangCatalogCollectionPermitSchema,
  CoupangCatalogCollectionPlanSchema,
  CoupangCatalogDetailManifestConfirmationV1Schema,
  CoupangCatalogManifestV1Schema,
  CoupangCatalogFullDetailsChunkV1Schema,
  CoupangCatalogDiscoveryPageV1Schema,
  CoupangCatalogListingBasicsChunkV1Schema,
  CoupangCatalogManifestConfirmationV1Schema,
  CoupangCatalogProductDetailsChunkV1Schema,
  FinalizeCoupangCatalogCollectionRequestSchema,
  PutCoupangCatalogChunkRequestSchema,
  StartCoupangCatalogCollectionRequestSchema,
  type CoupangCatalogCollectionPhase,
  type CoupangCatalogCollectionRun,
  type CoupangCatalogCollectionPermit,
  type CoupangCatalogBasicProductV1,
  type CoupangCatalogDetailProductV1,
  type CoupangCatalogManifestV1,
  type CoupangCatalogProductV1,
  type CoupangCatalogStage,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { z, type ZodType } from 'zod';
import {
  CHANNEL_CATALOG_COLLECTION_REPOSITORY_PORT,
  type ChannelCatalogCollectionChunkRecord,
  type ChannelCatalogCollectionRepositoryPort,
  type ChannelCatalogCollectionWithChunks,
} from '../port/out/repository/channel-catalog-collection.repository.port';
import {
  CHANNEL_CATALOG_PUBLICATION_PORT,
  type ChannelCatalogPublicationPort,
} from '../port/out/repository/channel-catalog-publication.port';
import type { ChannelCatalogCollectionPort } from '../port/in/channel-catalog-collection.port';

type CanonicalProduct = { ordinal: number; product: CoupangCatalogProductV1 };
type CanonicalBasicProduct = { ordinal: number; product: CoupangCatalogBasicProductV1 };
type CanonicalDetailProduct = { ordinal: number; product: CoupangCatalogDetailProductV1 };

@Injectable()
export class ChannelCatalogCollectionService implements ChannelCatalogCollectionPort {
  constructor(
    @Inject(CHANNEL_CATALOG_COLLECTION_REPOSITORY_PORT)
    private readonly repository: ChannelCatalogCollectionRepositoryPort,
    @Inject(CHANNEL_CATALOG_PUBLICATION_PORT)
    private readonly publisher: ChannelCatalogPublicationPort,
  ) {}

  async start(
    input: Parameters<ChannelCatalogCollectionPort['start']>[0],
  ): Promise<CoupangCatalogCollectionPermit> {
    const request = parseRequest(StartCoupangCatalogCollectionRequestSchema, input.request);
    const run = await this.repository.startOrResume({
      organizationId: input.organizationId,
      userId: input.userId,
      channelAccountId: input.channelAccountId,
      idempotencyKey: parseRequest(z.string().uuid(), input.idempotencyKey),
      collectorVersion: request.collectorVersion,
      ...(request.stage ? { stage: request.stage } : {}),
      ...(request.expectedBasicAttemptId
        ? { expectedBasicAttemptId: parseRequest(z.string().uuid(), request.expectedBasicAttemptId) }
        : {}),
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
    const compactStatus = buildCollectionStatus(compactRun, linkedDetailsRun);
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
      }), linkedDetailsRun);
    }
    return compactStatus;
  }

  private readLinkedDetailsRun(
    input: Parameters<ChannelCatalogCollectionPort['getStatus']>[0],
    run: ChannelCatalogCollectionWithChunks,
  ) {
    const plan = CoupangCatalogCollectionPlanSchema.safeParse(run.plan);
    const stage = run.stage ?? (plan.success ? stageFromPlan(plan.data) : 'full');
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
    const expectedChecksum = hashCatalogChunkPayload(request.payload);
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
      run.status === 'completed' &&
      jsonRecord(run.metaJson)?.snapshotHash !== request.snapshotHash
    )
      throw new ConflictException('Completed collection has a different snapshot hash');
    const stage = run.stage ?? stageFromPlan(run.plan);
    const snapshot = stage === 'basics'
      ? assembleListingBasicsSnapshot(run.chunks)
      : stage === 'details'
        ? assembleFullDetailsSnapshot(run.chunks, run.plan)
        : assembleCompleteSnapshot(run.chunks);
    const serverHash = stage === 'full'
      ? hashCoupangCatalogSnapshot(snapshot.products as CanonicalProduct[])
      : hashCatalogStageSnapshot(snapshot.products);
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
      chunkSetHash: hashCatalogChunkReceipts(run.chunks),
      ...(stage !== 'full' ? { stage } : {}),
    });
    return this.getStatus(input);
  }
}

type CompleteSnapshot = {
  manifest: CoupangCatalogManifestV1;
  products: CanonicalProduct[];
};

function effectiveState(run: {
  status: string;
  expiresAt: Date;
}): 'RUNNING' | 'COMPLETE' | 'FAILED' {
  return run.status === 'completed'
    ? 'COMPLETE'
    : run.status === 'failed' || run.expiresAt.getTime() <= Date.now()
      ? 'FAILED'
      : 'RUNNING';
}

function buildCollectionStatus(
  run: ChannelCatalogCollectionWithChunks,
  linkedDetailsRun: ChannelCatalogCollectionWithChunks | null = null,
): CoupangCatalogCollectionRun {
  const state = inspectChunks(run.chunks);
  const metadata = jsonRecord(run.metaJson) ?? {};
  const error = jsonRecord(run.errorJson);
  const publication = jsonRecord(metadata.publication);
  const effective = effectiveState(run);
  const plan = CoupangCatalogCollectionPlanSchema.parse(run.plan);
  const stage = run.stage ?? stageFromPlan(plan);
  const rootAttemptId = plan.rootAttemptId ?? (
    stage === 'details' ? plan.basicAttemptId ?? run.id : run.id
  );
  // A completed basics owner is a valid saved partial publication, but when
  // it carries a preallocated child key the whole refresh is still in flight.
  // The individual owner state remains COMPLETE; only overallState describes
  // the linked internal flow.
  const pendingDetailsHandoff = stage === 'basics' && run.status === 'completed' &&
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
        ? hashCatalogStageSnapshot(assembleListingBasicsSnapshot(run.chunks).products)
        : stage === 'details'
          ? hashCatalogStageSnapshot(assembleFullDetailsSnapshot(run.chunks, plan).products)
          : hashCoupangCatalogSnapshot(assembleCompleteSnapshot(run.chunks).products)
      : null;
  const products = stage === 'basics'
    ? state.basicProducts
    : stage === 'details'
      ? state.detailProducts
      : state.products;
  const publishedDetails = stage === 'details'
    ? publishedDetailProgress(run.chunks)
    : null;
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
      publishedProducts: publishedDetails?.publishedProducts
        ?? (run.status === 'completed' ? products.length : 0),
      publishedOptionCount: publishedDetails?.publishedOptionCount
        ?? (run.status === 'completed' ? state.optionCount : 0),
      publishedMediaCount: publishedDetails?.publishedMediaCount
        ?? (run.status === 'completed' ? state.mediaCount : 0),
      publishedChunks: publishedDetails?.publishedChunks
        ?? (run.status === 'completed'
          ? run.chunks.filter((chunk) =>
            stage === 'basics'
              ? chunk.kind === 'listing_basics'
              : chunk.kind === 'product_details',
          ).length
          : 0),
      firstPublishedAt: publishedDetails?.firstPublishedAt
        ?? (run.status === 'completed' ? (run.finishedAt?.toISOString() ?? null) : null),
      lastPublishedAt: publishedDetails?.lastPublishedAt
        ?? (run.status === 'completed' ? (run.finishedAt?.toISOString() ?? null) : null),
    },
    missing: {
      discoverySequences: missingDiscoverySequences(state),
      productIds: stage === 'full'
        ? missingHydratedProductIds(state)
        : missingStageProductIds(
          state.discovered,
          products,
        ).split(', ').filter(Boolean),
    },
    snapshotHash:
      typeof metadata.snapshotHash === 'string' ? metadata.snapshotHash : readySnapshotHash,
    error:
      run.status === 'running' && effective === 'FAILED'
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
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    rootAttemptId,
    currentAttemptId,
    currentStage,
    overallState,
  });
}

type PublishedDetailProgress = {
  publishedProducts: number;
  publishedOptionCount: number;
  publishedMediaCount: number;
  publishedChunks: number;
  firstPublishedAt: string | null;
  lastPublishedAt: string | null;
};

function publishedDetailProgress(
  chunks: readonly ChannelCatalogCollectionChunkRecord[],
): PublishedDetailProgress {
  const publishedChunks = chunks.filter((chunk) =>
    chunk.kind === 'full_details' && chunk.publishedAt instanceof Date,
  );
  let publishedProducts = 0;
  let publishedOptionCount = 0;
  let publishedMediaCount = 0;
  const publishedAt = publishedChunks
    .map((chunk) => chunk.publishedAt!.getTime())
    .filter((value) => Number.isFinite(value));

  for (const chunk of publishedChunks) {
    const receipt = jsonRecord(chunk.publicationJson);
    const projection = jsonRecord(receipt?.projection);
    const projectedProducts = Array.isArray(projection?.products)
      ? projection.products
        .map((value) => jsonRecord(value))
        .filter((value): value is Record<string, unknown> => value !== null)
      : [];
    if (projectedProducts.length > 0) {
      publishedProducts += projectedProducts.length;
      publishedOptionCount += projectedProducts.reduce(
        (sum, product) => sum + requiredNonNegativeInteger(product.optionCount, 'detail option count'),
        0,
      );
      publishedMediaCount += projectedProducts.reduce(
        (sum, product) => sum + requiredNonNegativeInteger(product.mediaCount, 'detail media count'),
        0,
      );
      continue;
    }

    if (chunk.payload === undefined) {
      throw new ConflictException(
        `Published full-details chunk ${chunk.sequence} has no receipt projection or payload`,
      );
    }
    const payload = parseStoredChunk(CoupangCatalogFullDetailsChunkV1Schema, chunk);
    publishedProducts += payload.products.length;
    publishedOptionCount += payload.products.reduce(
      (sum, item) => sum + item.product.options.length,
      0,
    );
    publishedMediaCount += payload.products.reduce(
      (sum, item) => sum + item.product.media.length,
      0,
    );
  }

  const first = publishedAt.length > 0 ? Math.min(...publishedAt) : null;
  const last = publishedAt.length > 0 ? Math.max(...publishedAt) : null;
  return {
    publishedProducts,
    publishedOptionCount,
    publishedMediaCount,
    publishedChunks: publishedChunks.length,
    firstPublishedAt: first === null ? null : new Date(first).toISOString(),
    lastPublishedAt: last === null ? null : new Date(last).toISOString(),
  };
}

function requiredNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ConflictException(`Published full-details receipt has an invalid ${label}`);
  }
  return value;
}

type InspectedChunks = {
  manifest: CoupangCatalogManifestV1 | null;
  confirmation: CoupangCatalogManifestV1 | null;
  discoveryPages: Set<number>;
  discovered: Array<{
    ordinal: number;
    externalProductId: string;
    saleStatus: string | null;
  }>;
  products: CanonicalProduct[];
  basicProducts: CanonicalBasicProduct[];
  detailProducts: CanonicalDetailProduct[];
  optionCount: number;
  mediaCount: number;
};

function inspectChunks(chunks: ChannelCatalogCollectionChunkRecord[]): InspectedChunks {
  let manifest: CoupangCatalogManifestV1 | null = null;
  let confirmation: CoupangCatalogManifestV1 | null = null;
  const discoveryPages = new Set<number>();
  const discovered: InspectedChunks['discovered'] = [];
  const products: CanonicalProduct[] = [];
  const basicProducts: CanonicalBasicProduct[] = [];
  const detailProducts: CanonicalDetailProduct[] = [];
  let optionCount = 0;
  let mediaCount = 0;

  for (const chunk of chunks) {
    if (chunk.payload === undefined) {
      applyCompactProjection(chunk, {
        get manifest() { return manifest; },
        set manifest(value) { manifest = value; },
        get confirmation() { return confirmation; },
        set confirmation(value) { confirmation = value; },
        discoveryPages,
        discovered,
        products,
        basicProducts,
        detailProducts,
        get optionCount() { return optionCount; },
        set optionCount(value) { optionCount = value; },
        get mediaCount() { return mediaCount; },
        set mediaCount(value) { mediaCount = value; },
      });
      continue;
    }
    if (chunk.kind === 'discovery_page') {
      const payload = parseStoredChunk(CoupangCatalogDiscoveryPageV1Schema, chunk);
      manifest ??= payload.manifest;
      assertSameManifest(manifest, payload.manifest);
      discoveryPages.add(payload.page);
      discovered.push(
        ...payload.items.map(({ ordinal, externalProductId, saleStatus }) => ({
          ordinal,
          externalProductId,
          saleStatus: saleStatus ?? null,
        })),
      );
    } else if (chunk.kind === 'product_details') {
      const payload = parseStoredChunk(CoupangCatalogProductDetailsChunkV1Schema, chunk);
      products.push(...payload.products);
      optionCount += payload.products.reduce((sum, item) => sum + item.product.options.length, 0);
      mediaCount += payload.products.reduce((sum, item) => sum + item.product.media.length +
        item.product.options.reduce((optionSum, option) => optionSum + option.media.length, 0), 0);
    } else if (chunk.kind === 'listing_basics') {
      const payload = parseStoredChunk(CoupangCatalogListingBasicsChunkV1Schema, chunk);
      basicProducts.push(...payload.products);
      optionCount += payload.products.reduce((sum, item) => sum + item.product.options.length, 0);
      mediaCount += payload.products.reduce((sum, item) => sum + item.product.media.length +
        item.product.options.reduce((optionSum, option) => optionSum + option.media.length, 0), 0);
    } else if (chunk.kind === 'full_details') {
      const payload = parseStoredChunk(CoupangCatalogFullDetailsChunkV1Schema, chunk);
      detailProducts.push(...payload.products);
      optionCount += payload.products.reduce((sum, item) => sum + item.product.options.length, 0);
      mediaCount += payload.products.reduce((sum, item) => sum + item.product.media.length, 0);
    } else if (chunk.kind === 'manifest_confirmation') {
      const payload = parseStoredChunk(CoupangCatalogManifestConfirmationV1Schema, chunk);
      confirmation = payload.manifest;
    } else if (chunk.kind === 'detail_manifest_confirmation') {
      const payload = parseStoredChunk(CoupangCatalogDetailManifestConfirmationV1Schema, chunk);
      confirmation = payload.manifest;
    } else {
      throw new ConflictException(`Unknown stored catalog chunk kind: ${chunk.kind}`);
    }
  }
  return {
    manifest,
    confirmation,
    discoveryPages,
    discovered: discovered.sort((a, b) => a.ordinal - b.ordinal),
    products: products.sort((a, b) => a.ordinal - b.ordinal),
    basicProducts: basicProducts.sort((a, b) => a.ordinal - b.ordinal),
    detailProducts: detailProducts.sort((a, b) => a.ordinal - b.ordinal),
    optionCount,
    mediaCount,
  };
}

function applyCompactProjection(
  chunk: ChannelCatalogCollectionChunkRecord,
  state: InspectedChunks,
): void {
  const publication = jsonRecord(chunk.publicationJson);
  const projection = jsonRecord(publication?.projection);
  if (!projection) {
    throw new ConflictException(`Stored ${chunk.kind} chunk ${chunk.sequence} has no receipt projection`);
  }
  if (chunk.kind === 'discovery_page') {
    const manifest = CoupangCatalogManifestV1Schema.safeParse(projection.manifest);
    const page = numberValue(projection.page);
    if (!manifest.success || page === null) throw new ConflictException('Stored discovery receipt is invalid');
    if (state.manifest) assertSameManifest(state.manifest, manifest.data);
    else state.manifest = manifest.data;
    state.discoveryPages.add(page);
    const items = Array.isArray(projection.items) ? projection.items : [];
    for (const value of items) {
      const item = jsonRecord(value);
      const ordinal = numberValue(item?.ordinal);
      const externalProductId = stringValue(item?.externalProductId);
      if (ordinal === null || !externalProductId) throw new ConflictException('Stored discovery receipt item is invalid');
      state.discovered.push({
        ordinal,
        externalProductId,
        saleStatus: stringValue(item?.saleStatus),
      });
    }
    return;
  }
  if (chunk.kind === 'manifest_confirmation' || chunk.kind === 'detail_manifest_confirmation') {
    const manifest = CoupangCatalogManifestV1Schema.safeParse(projection.manifest);
    if (!manifest.success) throw new ConflictException('Stored manifest receipt is invalid');
    if (state.manifest) assertSameManifest(state.manifest, manifest.data);
    state.confirmation = manifest.data;
    return;
  }
  if (chunk.kind !== 'product_details' && chunk.kind !== 'listing_basics' && chunk.kind !== 'full_details') {
    throw new ConflictException(`Unknown stored catalog chunk kind: ${chunk.kind}`);
  }
  const products = Array.isArray(projection.products) ? projection.products : [];
  for (const value of products) {
    const item = jsonRecord(value);
    const ordinal = numberValue(item?.ordinal);
    const externalProductId = stringValue(item?.externalProductId);
    const optionCount = numberValue(item?.optionCount);
    const mediaCount = numberValue(item?.mediaCount);
    if (ordinal === null || !externalProductId || optionCount === null || mediaCount === null) {
      throw new ConflictException(`Stored ${chunk.kind} receipt product is invalid`);
    }
    const placeholder = {
      ordinal,
      product: {
        externalProductId,
        options: Array.from({ length: optionCount }, () => ({})),
        media: Array.from({ length: mediaCount }, () => ({})),
      },
    } as unknown as CanonicalProduct;
    state.optionCount += optionCount;
    state.mediaCount += mediaCount;
    if (chunk.kind === 'product_details') state.products.push(placeholder);
    else if (chunk.kind === 'listing_basics') state.basicProducts.push(placeholder as unknown as CanonicalBasicProduct);
    else state.detailProducts.push(placeholder as unknown as CanonicalDetailProduct);
  }
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function assembleCompleteSnapshot(
  chunks: ChannelCatalogCollectionChunkRecord[],
): CompleteSnapshot {
  const state = inspectChunks(chunks);
  if (!state.manifest) throw new BadRequestException('Discovery manifest is missing');
  if (!state.confirmation) {
    throw new BadRequestException('Stable manifest confirmation is missing');
  }
  assertSameManifest(state.manifest, state.confirmation);
  const missingPages = missingDiscoverySequences(state);
  if (missingPages.length > 0) {
    throw new BadRequestException(`Discovery pages are missing: ${missingPages.join(', ')}`);
  }
  if (state.discovered.length !== state.manifest.totalItems) {
    throw new BadRequestException(
      `Discovered product count ${state.discovered.length} does not match manifest ${state.manifest.totalItems}`,
    );
  }

  const discoveredIds = new Set<string>();
  const ordinals = new Set<number>();
  for (const item of state.discovered) {
    if (discoveredIds.has(item.externalProductId)) {
      throw new BadRequestException(`Duplicate discovered product ID: ${item.externalProductId}`);
    }
    if (ordinals.has(item.ordinal)) {
      throw new BadRequestException(`Duplicate discovery ordinal: ${item.ordinal}`);
    }
    discoveredIds.add(item.externalProductId);
    ordinals.add(item.ordinal);
  }
  for (let ordinal = 0; ordinal < state.manifest.totalItems; ordinal += 1) {
    if (!ordinals.has(ordinal)) {
      throw new BadRequestException(`Discovery ordinal is missing: ${ordinal}`);
    }
  }

  const hydratedIds = new Set<string>();
  const externalOptionOwners = new Map<string, string>();
  const products: CanonicalProduct[] = [];
  for (const item of state.products) {
    const expected = state.discovered.find((discovered) => discovered.ordinal === item.ordinal);
    if (!expected || expected.externalProductId !== item.product.externalProductId) {
      throw new BadRequestException(
        `Hydrated product does not match discovery ordinal ${item.ordinal}`,
      );
    }
    if (hydratedIds.has(item.product.externalProductId)) {
      throw new BadRequestException(
        `Duplicate hydrated product ID: ${item.product.externalProductId}`,
      );
    }
    hydratedIds.add(item.product.externalProductId);
    products.push(withDiscoverySaleStatus(item, expected.saleStatus));
    for (const option of item.product.options) {
      const owner = externalOptionOwners.get(option.externalOptionId);
      if (owner && owner !== item.product.externalProductId) {
        throw new BadRequestException(
          `Option ${option.externalOptionId} belongs to multiple products`,
        );
      }
      if (owner) {
        throw new BadRequestException(`Duplicate option ID: ${option.externalOptionId}`);
      }
      externalOptionOwners.set(option.externalOptionId, item.product.externalProductId);
    }
  }
  const missingProducts = missingHydratedProductIds(state);
  if (missingProducts.length > 0 || state.products.length !== state.discovered.length) {
    throw new BadRequestException(`Product details are missing: ${missingProducts.join(', ')}`);
  }
  return { manifest: state.manifest, products };
}

export function assembleListingBasicsSnapshot(
  chunks: ChannelCatalogCollectionChunkRecord[],
): { manifest: CoupangCatalogManifestV1; products: CanonicalBasicProduct[] } {
  const state = inspectChunks(chunks);
  assertDiscoveryCoverage(state);
  const discoveredByOrdinal = new Map(state.discovered.map((item) => [item.ordinal, item]));
  const ids = new Set<string>();
  const optionOwners = new Map<string, string>();
  const products: CanonicalBasicProduct[] = [];
  for (const item of state.basicProducts) {
    const expected = discoveredByOrdinal.get(item.ordinal);
    if (!expected || expected.externalProductId !== item.product.externalProductId) {
      throw new BadRequestException(`Basic product does not match discovery ordinal ${item.ordinal}`);
    }
    if (ids.has(item.product.externalProductId)) {
      throw new BadRequestException(`Duplicate basic product ID: ${item.product.externalProductId}`);
    }
    ids.add(item.product.externalProductId);
    for (const option of item.product.options) {
      const owner = optionOwners.get(option.externalOptionId);
      if (owner && owner !== item.product.externalProductId) {
        throw new BadRequestException(`Option ${option.externalOptionId} belongs to multiple products`);
      }
      if (owner) throw new BadRequestException(`Duplicate option ID: ${option.externalOptionId}`);
      optionOwners.set(option.externalOptionId, item.product.externalProductId);
    }
    products.push(item);
  }
  if (products.length !== state.manifest!.totalItems) {
    throw new BadRequestException(`Basic products are missing: ${missingStageProductIds(state.discovered, products)}`);
  }
  return { manifest: state.manifest!, products };
}

export function assembleFullDetailsSnapshot(
  chunks: ChannelCatalogCollectionChunkRecord[],
  rawPlan: unknown,
): { manifest: CoupangCatalogManifestV1; products: CanonicalDetailProduct[] } {
  const state = inspectChunks(chunks);
  assertDiscoveryCoverage(state);
  const plan = CoupangCatalogCollectionPlanSchema.parse(rawPlan);
  const expectedIds = new Set(plan.basicProductIds ?? state.discovered.map((item) => item.externalProductId));
  const discoveredByOrdinal = new Map(state.discovered.map((item) => [item.ordinal, item]));
  const ids = new Set<string>();
  const optionOwners = new Map<string, string>();
  const products: CanonicalDetailProduct[] = [];
  for (const item of state.detailProducts) {
    const expected = discoveredByOrdinal.get(item.ordinal);
    if (!expected || expected.externalProductId !== item.product.externalProductId || !expectedIds.has(item.product.externalProductId)) {
      throw new BadRequestException(`Detail product does not match the completed basics manifest at ordinal ${item.ordinal}`);
    }
    if (ids.has(item.product.externalProductId)) {
      throw new BadRequestException(`Duplicate detail product ID: ${item.product.externalProductId}`);
    }
    ids.add(item.product.externalProductId);
    for (const option of item.product.options) {
      const owner = optionOwners.get(option.externalOptionId);
      if (owner && owner !== item.product.externalProductId) {
        throw new BadRequestException(`Option ${option.externalOptionId} belongs to multiple products`);
      }
      if (owner) throw new BadRequestException(`Duplicate option ID: ${option.externalOptionId}`);
      optionOwners.set(option.externalOptionId, item.product.externalProductId);
    }
    products.push(item);
  }
  if (products.length !== expectedIds.size || products.length !== state.manifest!.totalItems) {
    throw new BadRequestException(`Full details are missing: ${missingStageProductIds(state.discovered, products)}`);
  }
  return { manifest: state.manifest!, products };
}

function assertDiscoveryCoverage(state: InspectedChunks): void {
  if (!state.manifest) throw new BadRequestException('Discovery manifest is missing');
  if (!state.confirmation) throw new BadRequestException('Stable manifest confirmation is missing');
  assertSameManifest(state.manifest, state.confirmation);
  const missingPages = missingDiscoverySequences(state);
  if (missingPages.length > 0) {
    throw new BadRequestException(`Discovery pages are missing: ${missingPages.join(', ')}`);
  }
  if (state.discovered.length !== state.manifest.totalItems) {
    throw new BadRequestException(
      `Discovered product count ${state.discovered.length} does not match manifest ${state.manifest.totalItems}`,
    );
  }
  const ids = new Set<string>();
  const ordinals = new Set<number>();
  for (const item of state.discovered) {
    if (ids.has(item.externalProductId)) throw new BadRequestException(`Duplicate discovered product ID: ${item.externalProductId}`);
    if (ordinals.has(item.ordinal)) throw new BadRequestException(`Duplicate discovery ordinal: ${item.ordinal}`);
    ids.add(item.externalProductId);
    ordinals.add(item.ordinal);
  }
  for (let ordinal = 0; ordinal < state.manifest.totalItems; ordinal += 1) {
    if (!ordinals.has(ordinal)) throw new BadRequestException(`Discovery ordinal is missing: ${ordinal}`);
  }
}

function missingStageProductIds(
  discovered: Array<{ externalProductId: string }>,
  products: Array<{ product: { externalProductId: string } }>,
): string {
  const present = new Set(products.map(({ product }) => product.externalProductId));
  return discovered.filter(({ externalProductId }) => !present.has(externalProductId)).map(({ externalProductId }) => externalProductId).join(', ');
}

function missingDiscoverySequences(state: InspectedChunks): number[] {
  if (!state.manifest) return [];
  return Array.from({ length: state.manifest.expectedPages }, (_, index) => index + 1).filter(
    (sequence) => !state.discoveryPages.has(sequence),
  );
}

function missingHydratedProductIds(state: InspectedChunks): string[] {
  const hydrated = new Set(state.products.map((item) => item.product.externalProductId));
  return state.discovered
    .filter((item) => !hydrated.has(item.externalProductId))
    .map((item) => item.externalProductId);
}

function withDiscoverySaleStatus(
  item: CanonicalProduct,
  saleStatus: string | null,
): CanonicalProduct {
  return {
    ...item,
    product: {
      ...item.product,
      raw: {
        ...item.product.raw,
        saleStatus,
      },
    },
  };
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
  stage: CoupangCatalogStage = 'full',
  plan?: ReturnType<typeof CoupangCatalogCollectionPlanSchema.parse>,
): CoupangCatalogCollectionPhase {
  if (status === 'completed') return 'finished';
  if (!state.manifest || !state.confirmation || missingDiscoverySequences(state).length > 0)
    return 'discovery';
  const products = stage === 'basics'
    ? state.basicProducts
    : stage === 'details'
      ? state.detailProducts
      : state.products;
  const expected = stage === 'details'
    ? plan?.basicProductIds?.length ?? state.manifest.totalItems
    : state.manifest.totalItems;
  if (products.length < expected) return 'hydration';
  return 'ready_to_finalize';
}

function stageFromPlan(rawPlan: unknown): CoupangCatalogStage {
  const plan = CoupangCatalogCollectionPlanSchema.safeParse(rawPlan);
  return plan.success ? plan.data.stage ?? 'full' : 'full';
}

function assertSameManifest(
  expected: CoupangCatalogManifestV1,
  actual: CoupangCatalogManifestV1,
): void {
  if (stableStringify(expected) !== stableStringify(actual)) {
    throw new BadRequestException('Catalog manifest changed during collection');
  }
}

function parseStoredChunk<T>(schema: ZodType<T>, chunk: ChannelCatalogCollectionChunkRecord): T {
  const result = schema.safeParse(chunk.payload);
  if (!result.success) {
    throw new ConflictException(
      `Stored ${chunk.kind} chunk ${chunk.sequence} is invalid: ${result.error.issues[0]?.message}`,
    );
  }
  return result.data;
}

function parseRequest<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Invalid request');
  }
  return result.data;
}

export function hashCatalogChunkPayload(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export function hashCatalogChunkReceipts(chunks: ChannelCatalogCollectionChunkRecord[]): string {
  return hashCatalogChunkPayload(
    chunks
      .map(({ id, kind, sequence, checksum, itemCount }) => ({
        id,
        kind,
        sequence,
        checksum,
        itemCount,
      }))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.sequence - b.sequence),
  );
}

export function hashCoupangCatalogSnapshot(products: CanonicalProduct[]): string {
  const canonical = [...products].sort((a, b) => a.ordinal - b.ordinal);
  return createHash('sha256')
    .update(stableStringify({ version: 1, products: canonical }))
    .digest('hex');
}

export function hashCatalogStageSnapshot(products: Array<{ ordinal: number; product: unknown }>): string {
  const canonical = [...products].sort((a, b) => a.ordinal - b.ordinal);
  return createHash('sha256')
    .update(stableStringify({ version: 1, products: canonical }))
    .digest('hex');
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
    .join(',')}}`;
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
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
