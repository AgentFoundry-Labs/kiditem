import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  CoupangCatalogCollectionErrorRequestSchema,
  CoupangCatalogCollectionRunSchema,
  CoupangCatalogCollectionPermitSchema,
  CoupangCatalogCollectionPlanSchema,
  CoupangCatalogDiscoveryPageV1Schema,
  CoupangCatalogManifestConfirmationV1Schema,
  CoupangCatalogProductDetailsChunkV1Schema,
  FinalizeCoupangCatalogCollectionRequestSchema,
  PutCoupangCatalogChunkRequestSchema,
  StartCoupangCatalogCollectionRequestSchema,
  type CoupangCatalogCollectionPhase,
  type CoupangCatalogCollectionRun,
  type CoupangCatalogCollectionPermit,
  type CoupangCatalogManifestV1,
  type CoupangCatalogProductV1,
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
    return buildCollectionStatus(await this.repository.getOwnedRunWithChunks(input));
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

  async finalize(
    input: Parameters<ChannelCatalogCollectionPort['finalize']>[0],
  ): Promise<CoupangCatalogCollectionRun> {
    const request = parseRequest(FinalizeCoupangCatalogCollectionRequestSchema, input.request);
    const run = await this.repository.getOwnedRunWithChunks(input);
    if (!input.attemptToken || input.attemptToken !== run.attemptToken)
      throw new ConflictException('Catalog attempt token mismatch');
    if (
      run.status === 'completed' &&
      jsonRecord(run.metaJson)?.snapshotHash !== request.snapshotHash
    )
      throw new ConflictException('Completed collection has a different snapshot hash');
    const snapshot = assembleCompleteSnapshot(run.chunks);
    const serverHash = hashCoupangCatalogSnapshot(snapshot.products);
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
): CoupangCatalogCollectionRun {
  const state = inspectChunks(run.chunks);
  const metadata = jsonRecord(run.metaJson) ?? {};
  const error = jsonRecord(run.errorJson);
  const publication = jsonRecord(metadata.publication);
  const effective = effectiveState(run);
  const plan = CoupangCatalogCollectionPlanSchema.parse(run.plan);

  const phase = derivePhase(run.status, state, metadata);
  const readySnapshotHash =
    phase === 'ready_to_finalize'
      ? hashCoupangCatalogSnapshot(assembleCompleteSnapshot(run.chunks).products)
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
      hydratedProducts: state.products.length,
      optionCount: state.products.reduce((sum, item) => sum + item.product.options.length, 0),
      mediaCount: state.products.reduce(
        (sum, item) =>
          sum +
          item.product.media.length +
          item.product.options.reduce((optionSum, option) => optionSum + option.media.length, 0),
        0,
      ),
      storedChunks: run.chunks.length,
      publishedProducts: run.status === 'completed' ? state.products.length : 0,
      publishedOptionCount: run.status === 'completed' ? countOptions(state.products) : 0,
      publishedMediaCount: run.status === 'completed' ? countMedia(state.products) : 0,
      publishedChunks:
        run.status === 'completed'
          ? run.chunks.filter((chunk) => chunk.kind === 'product_details').length
          : 0,
      firstPublishedAt: run.status === 'completed' ? (run.finishedAt?.toISOString() ?? null) : null,
      lastPublishedAt: run.status === 'completed' ? (run.finishedAt?.toISOString() ?? null) : null,
    },
    missing: {
      discoverySequences: missingDiscoverySequences(state),
      productIds: missingHydratedProductIds(state),
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
          }
        : error
          ? {
              code: stringValue(error.code, 'collection_error'),
              message: stringValue(error.message, 'Collection failed'),
              phase: phaseValue(error.phase, phase),
              recoverable: false,
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
  });
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
};

function inspectChunks(chunks: ChannelCatalogCollectionChunkRecord[]): InspectedChunks {
  let manifest: CoupangCatalogManifestV1 | null = null;
  let confirmation: CoupangCatalogManifestV1 | null = null;
  const discoveryPages = new Set<number>();
  const discovered: InspectedChunks['discovered'] = [];
  const products: CanonicalProduct[] = [];

  for (const chunk of chunks) {
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
    } else if (chunk.kind === 'manifest_confirmation') {
      const payload = parseStoredChunk(CoupangCatalogManifestConfirmationV1Schema, chunk);
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
  };
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

function countOptions(products: CanonicalProduct[]): number {
  return products.reduce((sum, item) => sum + item.product.options.length, 0);
}

function countMedia(products: CanonicalProduct[]): number {
  return products.reduce(
    (sum, item) =>
      sum +
      item.product.media.length +
      item.product.options.reduce((optionSum, option) => optionSum + option.media.length, 0),
    0,
  );
}

function derivePhase(
  status: string,
  state: InspectedChunks,
  metadata: Record<string, unknown>,
): CoupangCatalogCollectionPhase {
  if (status === 'completed') return 'finished';
  const storedPhase = metadata.phase;
  if (storedPhase === 'publishing') return 'publishing';
  if (!state.manifest || !state.confirmation || missingDiscoverySequences(state).length > 0)
    return 'discovery';
  if (missingHydratedProductIds(state).length > 0) return 'hydration';
  return 'ready_to_finalize';
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

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function phaseValue(
  value: unknown,
  fallback: CoupangCatalogCollectionPhase,
): CoupangCatalogCollectionPhase {
  return value === 'discovery' ||
    value === 'hydration' ||
    value === 'ready_to_finalize' ||
    value === 'publishing' ||
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
