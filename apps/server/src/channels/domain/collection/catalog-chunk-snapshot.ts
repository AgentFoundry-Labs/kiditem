/**
 * Pure assembly of stored Coupang catalog collection chunks into a complete
 * discovery/basics/details snapshot. The collection service and the catalog
 * publication adapter both assemble through this module (KID-258).
 */
import {
  CoupangCatalogCollectionPlanSchema,
  CoupangCatalogDeletionConfirmationChunkV1Schema,
  CoupangCatalogDetailManifestConfirmationV1Schema,
  CoupangCatalogDiscoveryPageV1Schema,
  CoupangCatalogFullDetailsChunkV1Schema,
  CoupangCatalogListingBasicsChunkV1Schema,
  CoupangCatalogManifestConfirmationV1Schema,
  CoupangCatalogManifestV1Schema,
  type CoupangCatalogBasicProductV1,
  type CoupangCatalogDetailProductV1,
  type CoupangCatalogManifestV1,
} from '@kiditem/shared/coupang-catalog-snapshot';
import type { ZodType } from 'zod';
import { KiditemConflictError } from '@kiditem/shared/errors';
import { ChannelInputError as BadRequestException, ChannelConflictError as ConflictException } from '../exception/channel-business-error';
import { stableStringify } from './catalog-collection-hash';
import type { CatalogDeletionConfirmation } from './catalog-deletion-confirmation';

/** One stored collection chunk as the catalog collection ledger returns it. */
export interface CatalogCollectionChunk {
  id: string;
  kind: string;
  sequence: number;
  checksum: string;
  itemCount: number;
  /** Omitted by status reads; present when finalization needs the canonical payload. */
  payload?: unknown;
  publishedAt?: Date | null;
  publicationJson?: unknown;
}

type CanonicalBasicProduct = { ordinal: number; product: CoupangCatalogBasicProductV1 };

type CanonicalDetailProduct = { ordinal: number; product: CoupangCatalogDetailProductV1 };

export type InspectedChunks = {
  manifest: CoupangCatalogManifestV1 | null;
  confirmation: CoupangCatalogManifestV1 | null;
  discoveryPages: Set<number>;
  discovered: Array<{
    ordinal: number;
    externalProductId: string;
    saleStatus: string | null;
  }>;
  basicProducts: CanonicalBasicProduct[];
  detailProducts: CanonicalDetailProduct[];
  /** details 단계가 받은 삭제 확인 (KID-348). 청크 순서대로다. */
  deletionConfirmations: CatalogDeletionConfirmation[];
  optionCount: number;
  mediaCount: number;
};

export function inspectChunks(chunks: CatalogCollectionChunk[]): InspectedChunks {
  let manifest: CoupangCatalogManifestV1 | null = null;
  let confirmation: CoupangCatalogManifestV1 | null = null;
  const discoveryPages = new Set<number>();
  const discovered: InspectedChunks['discovered'] = [];
  const basicProducts: CanonicalBasicProduct[] = [];
  const detailProducts: CanonicalDetailProduct[] = [];
  const deletionConfirmations: CatalogDeletionConfirmation[] = [];
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
        basicProducts,
        detailProducts,
        deletionConfirmations,
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
    } else if (chunk.kind === 'deletion_confirmation') {
      const payload = parseStoredChunk(CoupangCatalogDeletionConfirmationChunkV1Schema, chunk);
      deletionConfirmations.push(...payload.products.map(({ externalProductId, outcome }) => ({ externalProductId, outcome })));
    } else {
      throw new ConflictException(`Unknown stored catalog chunk kind: ${chunk.kind}`);
    }
  }
  return {
    manifest,
    confirmation,
    discoveryPages,
    discovered: discovered.sort((a, b) => a.ordinal - b.ordinal),
    basicProducts: basicProducts.sort((a, b) => a.ordinal - b.ordinal),
    detailProducts: detailProducts.sort((a, b) => a.ordinal - b.ordinal),
    deletionConfirmations,
    optionCount,
    mediaCount,
  };
}

function applyCompactProjection(
  chunk: CatalogCollectionChunk,
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
  if (chunk.kind === 'deletion_confirmation') {
    const products = Array.isArray(projection.products) ? projection.products : [];
    for (const value of products) {
      const item = jsonRecord(value);
      const externalProductId = stringValue(item?.externalProductId);
      const outcome = item?.outcome;
      if (!externalProductId || (outcome !== 'deleted' && outcome !== 'present' && outcome !== 'not_found')) {
        throw new KiditemConflictError('STATE_CONFLICT', {
          details: { reason: 'CATALOG_DELETION_RECEIPT_INVALID', sequence: chunk.sequence },
        });
      }
      state.deletionConfirmations.push({ externalProductId, outcome });
    }
    return;
  }
  if (chunk.kind !== 'listing_basics' && chunk.kind !== 'full_details') {
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
    };
    state.optionCount += optionCount;
    state.mediaCount += mediaCount;
    if (chunk.kind === 'listing_basics') state.basicProducts.push(placeholder as unknown as CanonicalBasicProduct);
    else state.detailProducts.push(placeholder as unknown as CanonicalDetailProduct);
  }
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function assembleListingBasicsSnapshot(
  chunks: CatalogCollectionChunk[],
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
  chunks: CatalogCollectionChunk[],
  rawPlan: unknown,
): { manifest: CoupangCatalogManifestV1 | null; products: CanonicalDetailProduct[] } {
  const state = inspectChunks(chunks);
  const plan = CoupangCatalogCollectionPlanSchema.parse(rawPlan);
  const refetch = isDetailRefetchPlan(plan);
  // 다시 받기는 목록을 발견하지 않는다: 순번은 지목한 상품 목록의 자리다 (KID-348).
  if (!refetch) assertDiscoveryCoverage(state);
  const expectedIds = new Set(detailTargetProductIds(plan, state.discovered));
  const discoveredByOrdinal = refetch
    ? new Map((plan.detailTargetProductIds ?? []).map((externalProductId, ordinal) => [ordinal, { externalProductId }]))
    : new Map(state.discovered.map((item) => [item.ordinal, item]));
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
  if (products.length !== expectedIds.size) {
    throw new BadRequestException(`Full details are missing: ${missingDetailTargetIds([...expectedIds], products).join(', ')}`);
  }
  return { manifest: state.manifest, products };
}

/**
 * 운영자가 상품을 지목해 연 details 시도(목록 단계 기준 없음, KID-348). 목록 발견·확인 없이
 * 지목한 상품의 상세만 받는다.
 */
export function isDetailRefetchPlan(plan: { stage?: string; basicAttemptId?: string; detailTargetProductIds?: string[] }): boolean {
  return plan.stage === 'details' && !plan.basicAttemptId && Array.isArray(plan.detailTargetProductIds);
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

/**
 * details 단계가 상세를 받아야 하는 상품 (KID-348). 목록 단계가 계산한 대상이 있으면 그것만,
 * 그 전 계획은 목록 전체(`basicProductIds`, 없으면 발견한 상품 전부)다.
 */
export function detailTargetProductIds(
  plan: { detailTargetProductIds?: string[]; basicProductIds?: string[] },
  discovered: ReadonlyArray<{ externalProductId: string }>,
): string[] {
  return plan.detailTargetProductIds
    ?? plan.basicProductIds
    ?? discovered.map((item) => item.externalProductId);
}

export function missingDetailTargetIds(
  targets: readonly string[],
  products: ReadonlyArray<{ product: { externalProductId: string } }>,
): string[] {
  const present = new Set(products.map(({ product }) => product.externalProductId));
  return targets.filter((id) => !present.has(id));
}

export function missingStageProductIds(
  discovered: Array<{ externalProductId: string }>,
  products: Array<{ product: { externalProductId: string } }>,
): string {
  const present = new Set(products.map(({ product }) => product.externalProductId));
  return discovered.filter(({ externalProductId }) => !present.has(externalProductId)).map(({ externalProductId }) => externalProductId).join(', ');
}

export function missingDiscoverySequences(state: InspectedChunks): number[] {
  if (!state.manifest) return [];
  return Array.from({ length: state.manifest.expectedPages }, (_, index) => index + 1).filter(
    (sequence) => !state.discoveryPages.has(sequence),
  );
}

function assertSameManifest(
  expected: CoupangCatalogManifestV1,
  actual: CoupangCatalogManifestV1,
): void {
  if (stableStringify(expected) !== stableStringify(actual)) {
    throw new BadRequestException('Catalog manifest changed during collection');
  }
}

export function parseStoredChunk<T>(schema: ZodType<T>, chunk: CatalogCollectionChunk): T {
  const result = schema.safeParse(chunk.payload);
  if (!result.success) {
    throw new ConflictException(
      `Stored ${chunk.kind} chunk ${chunk.sequence} is invalid: ${result.error.issues[0]?.message}`,
    );
  }
  return result.data;
}

export function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}
