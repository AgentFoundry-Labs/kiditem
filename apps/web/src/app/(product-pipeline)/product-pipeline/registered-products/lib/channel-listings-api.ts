import {
  CoupangCatalogCollectionPermitSchema,
  CoupangCatalogCollectionRunSchema,
  CoupangCatalogStageSchema,
  type CoupangCatalogCollectionErrorRequest,
  type CoupangCatalogCollectionPermit,
  type CoupangCatalogCollectionRun,
  type StartCoupangCatalogCollectionRequest,
  type CoupangCatalogStage,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';

export const COUPANG_CATALOG_ATTEMPT_STORAGE_KEY =
  'kiditem:coupang-catalog-import:active-attempt';

export type ActiveCoupangCatalogAttempt = {
  channelAccountId: string;
  attemptId: string | null;
  idempotencyKey: string | null;
  stage?: CoupangCatalogStage;
};

export type CoupangCatalogCollectionLink = {
  attemptId: string;
  channelAccountId: string;
  stage: CoupangCatalogStage;
};

export type CoupangCatalogCollectionLinkResult =
  | CoupangCatalogCollectionLink
  | { invalid: true };

export type CoupangCatalogSearchParams = Pick<URLSearchParams, 'get' | 'has'>;

/**
 * Read an explicit collection handoff without ever starting provider work.
 * Keep malformed links distinguishable from ordinary navigation so a bad
 * account/attempt pair cannot silently turn into a fresh collection.
 */
export function readCoupangCatalogCollectionLink(
  input?: CoupangCatalogSearchParams | string | null,
): CoupangCatalogCollectionLinkResult | null {
  const query = typeof input === 'string'
    ? new URLSearchParams(input)
    : input ?? (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search));
  if (!query) return null;
  const hasLinkParam = ['collectionAttempt', 'channelAccountId', 'collectionStage']
    .some((key) => query.has(key));
  if (!hasLinkParam) return null;
  const parsed = z.object({
    attemptId: CoupangCatalogCollectionRunSchema.shape.attemptId,
    channelAccountId: CoupangCatalogCollectionRunSchema.shape.channelAccountId,
    stage: CoupangCatalogStageSchema.default('full'),
  }).safeParse({
    attemptId: query.get('collectionAttempt'),
    channelAccountId: query.get('channelAccountId'),
    stage: query.get('collectionStage') ?? undefined,
  });
  return parsed.success ? parsed.data : { invalid: true };
}

const ActiveCoupangCatalogAttemptSchema = CoupangCatalogCollectionRunSchema
  .pick({ channelAccountId: true, attemptId: true, idempotencyKey: true })
  .extend({
    attemptId: CoupangCatalogCollectionRunSchema.shape.attemptId.nullable(),
    idempotencyKey: z.string().uuid().nullable(),
    stage: CoupangCatalogStageSchema.optional(),
  })
  .strict();

export function readActiveCoupangCatalogAttempt(): ActiveCoupangCatalogAttempt | null {
  return readActiveCoupangCatalogAttemptForStage('full');
}

export function readActiveCoupangCatalogAttemptForStage(
  stage: CoupangCatalogStage,
): ActiveCoupangCatalogAttempt | null {
  const raw = safeStorageGet('local', storageKeyForStage(stage));
  if (!raw) return null;
  try {
    const parsed = ActiveCoupangCatalogAttemptSchema.safeParse(JSON.parse(raw));
    return parsed.success && (parsed.data.stage ?? 'full') === stage ? parsed.data : null;
  } catch {
    return null;
  }
}

export function rememberCoupangCatalogAttempt(
  attempt: ActiveCoupangCatalogAttempt,
): void {
  rememberCoupangCatalogAttemptForStage(attempt.stage ?? 'full', attempt);
}

export function rememberCoupangCatalogAttemptForStage(
  stage: CoupangCatalogStage,
  attempt: ActiveCoupangCatalogAttempt,
): void {
  if (!attempt.idempotencyKey) return;
  // `full` is the legacy/default stage. Keep its historical storage shape so
  // existing pending keys survive the staged rollout; staged attempts carry
  // an explicit discriminator because their storage keys are separate.
  const value = stage === 'full'
    ? {
        channelAccountId: attempt.channelAccountId,
        attemptId: attempt.attemptId,
        idempotencyKey: attempt.idempotencyKey,
      }
    : { ...attempt, stage };
  safeStorageSet(
    'local',
    storageKeyForStage(stage),
    JSON.stringify(value),
  );
}

function storageKeyForStage(stage: CoupangCatalogStage): string {
  return stage === 'full'
    ? COUPANG_CATALOG_ATTEMPT_STORAGE_KEY
    : `${COUPANG_CATALOG_ATTEMPT_STORAGE_KEY}:${stage}`;
}

export type RegisteredListingSort = 'newest' | 'oldest' | 'name_asc';

export interface RegisteredChannelListing {
  id: string;
  listingName: string;
  thumbnailUrl: string | null;
  detailPageArtifactId: string | null;
  detailPageRevisionId: string | null;
  channel: string;
  channelAccountId: string | null;
  channelAccountName: string | null;
  externalId: string;
  channelName: string | null;
  category: string | null;
  brand: string | null;
  manufacturer: string | null;
  channelPrice: number | null;
  sourceCandidateId: string | null;
  contentWorkspaceId: string | null;
  status: string | null;
  exposureStatus: string | null;
  optionCount: number;
  mappingStatus: 'matched' | 'unmatched' | 'needs_review';
  createdAt: string;
  updatedAt: string;
  providerDetail?: RegisteredChannelListingProviderDetail;
}

export interface RegisteredChannelListingProviderDetail {
  category: string | null;
  brand: string | null;
  manufacturer: string | null;
  sourceDetail: {
    documents: Array<Record<string, unknown>>;
    options: Array<{
      externalOptionId: string;
      documentIds: string[];
    }>;
  } | null;
  options: Array<{
    externalOptionId: string;
    itemName: string | null;
    vendorItemId: string | null;
    sellerProductItemId: string | null;
    salePrice: number | null;
    sellerSku: string | null;
    barcode: string | null;
    modelNumber: string | null;
    status: string | null;
    attributes: unknown;
  }>;
  media: Array<{
    sourceUrl: string;
    role: string;
    sortOrder: number;
    externalOptionIds: string[];
  }>;
}

export interface RegisteredMarketCount {
  channel: string;
  channelAccountId: string | null;
  channelAccountName: string | null;
  count: number;
}

export interface RegisteredChannelListingResponse {
  items: RegisteredChannelListing[];
  total: number;
  page: number;
  limit: number;
  marketCounts: RegisteredMarketCount[];
}

export interface ChannelAccountOption {
  id: string;
  channel: string;
  name: string;
  externalAccountId: string | null;
  vendorId?: string | null;
  sellerId?: string | null;
  isPrimary?: boolean | null;
}

export const channelListingsApi = {
  list(params?: {
    page?: number;
    limit?: number;
    sort?: RegisteredListingSort;
    channel?: string | null;
    channelAccountId?: string | null;
    search?: string | null;
    createdSince?: string | null;
    tab?: 'registered' | 'deleted';
  }): Promise<RegisteredChannelListingResponse> {
    const qs = new URLSearchParams({
      page: String(params?.page ?? 1),
      limit: String(params?.limit ?? 20),
    });
    if (params?.sort) qs.set('sort', params.sort);
    if (params?.channel) qs.set('channel', params.channel);
    if (params?.channelAccountId) qs.set('channelAccountId', params.channelAccountId);
    if (params?.search?.trim()) qs.set('search', params.search.trim());
    if (params?.createdSince) qs.set('createdSince', params.createdSince);
    if (params?.tab) qs.set('tab', params.tab);
    return apiClient.get<RegisteredChannelListingResponse>(`/api/channels/listings?${qs}`);
  },
  getWorkspace(listingId: string): Promise<RegisteredChannelListing> {
    return apiClient.get<RegisteredChannelListing>(
      `/api/channels/listings/${encodeURIComponent(listingId)}/workspace`,
    );
  },
  listAccounts(): Promise<ChannelAccountOption[]> {
    return apiClient.get<ChannelAccountOption[]>('/api/channels/accounts');
  },
  async startCoupangCatalogCollection(
    channelAccountId: string,
    request: StartCoupangCatalogCollectionRequest,
    idempotencyKey: string,
  ): Promise<CoupangCatalogCollectionPermit> {
    const permit = CoupangCatalogCollectionPermitSchema.parse(await apiClient.post(
      `/api/channels/accounts/${encodeURIComponent(channelAccountId)}` +
        '/catalog-imports/coupang-wing/attempts',
      request,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    ));
    if (permit.plan.channelAccountId !== channelAccountId) throw new Error('쿠팡 수집 계정 응답이 일치하지 않습니다.');
    const expectedStage = request.stage ?? 'full';
    if ((permit.plan.stage ?? 'full') !== expectedStage) throw new Error('쿠팡 수집 단계 응답이 일치하지 않습니다.');
    return permit;
  },
  async getCoupangCatalogCollection(
    channelAccountId: string,
    attemptId: string,
    expectedStage: CoupangCatalogStage = 'full',
  ): Promise<CoupangCatalogCollectionRun> {
    const owner = CoupangCatalogCollectionRunSchema.parse(await apiClient.get(
      `/api/channels/accounts/${encodeURIComponent(channelAccountId)}` +
        `/catalog-imports/coupang-wing/attempts/${encodeURIComponent(attemptId)}`,
    ));
    if (owner.attemptId !== attemptId || owner.channelAccountId !== channelAccountId ||
        owner.plan.channelAccountId !== channelAccountId || (owner.plan.stage ?? 'full') !== expectedStage)
      throw new Error('쿠팡 수집 시도 응답이 일치하지 않습니다.');
    return owner;
  },
  async failCoupangCatalogCollection(
    channelAccountId: string,
    attemptId: string,
    attemptToken: string,
    request: CoupangCatalogCollectionErrorRequest,
  ): Promise<void> {
    await apiClient.post(
      `/api/channels/accounts/${encodeURIComponent(channelAccountId)}` +
        `/catalog-imports/coupang-wing/attempts/${encodeURIComponent(attemptId)}/fail`,
      request,
      { headers: { 'x-source-attempt-token': attemptToken } },
    );
  },
};
