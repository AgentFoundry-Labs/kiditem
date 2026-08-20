import { Injectable } from '@nestjs/common';
import {
  Sourcing1688SearchItemSchema,
  SourcingWingCatalogObservationSchema,
  buildSourcing1688TargetId,
  deriveSourcing1688SearchQuery,
  sourcingWingCatalogKeywordIdentity,
  type Sourcing1688SearchItem,
} from '@kiditem/shared/sourcing';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  SOURCING_1688_IMAGE_COLLECTOR_KEY,
  SOURCING_1688_KEYWORD_COLLECTOR_KEY,
  SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION,
  SOURCING_1688_ALL_RESULTS_REJECTED,
  type Sourcing1688CompletedImageRunInput,
  type Sourcing1688CompletedKeywordRunInput,
  type Sourcing1688CompletedSearchRun,
  type Sourcing1688SearchResultRepositoryPort,
  type Sourcing1688StoredSearchObservation,
  type Sourcing1688StoredSearchSnapshot,
} from '../../../application/port/out/repository/sourcing-1688-search-result.repository.port';

const TERMINAL_COLLECTION_STATUSES = ['complete', 'partial'] as const;
const MAX_LATEST_RUN_CANDIDATES = 120;
const MAX_TARGET_OBSERVATION_CANDIDATES = 500;
const MAX_LATEST_IDENTITIES = 30;

@Injectable()
export class Sourcing1688SearchResultRepositoryAdapter
implements Sourcing1688SearchResultRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async resolveImageTargets(input: {
    organizationId: string;
    targetIds: string[];
  }) {
    const requested = new Set(input.targetIds);
    const productIds = [...new Set(input.targetIds.map((targetId) =>
      targetId.slice(0, targetId.indexOf(':'))))];
    const rows = await this.prisma.sourcingEvidenceObservation.findMany({
      where: {
        organizationId: input.organizationId,
        sourceKey: 'coupang.wing_catalog',
        sourceEntityType: 'coupang_product',
        sourceEntityKey: { in: productIds },
        schemaVersion: { in: ['coupang-wing-catalog/v1', 'coupang-wing-catalog/v2'] },
        supersededByObservation: null,
        ingestionRun: { status: { in: [...TERMINAL_COLLECTION_STATUSES] } },
      },
      select: { payload: true },
      orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
      take: MAX_TARGET_OBSERVATION_CANDIDATES,
    });
    const targetsById = new Map<string, {
      targetId: string;
      imageUrl: string;
      searchQuery: string;
    }>();
    for (const row of rows) {
      const observation = SourcingWingCatalogObservationSchema.safeParse(row.payload);
      if (!observation.success) continue;
      const targetId = buildSourcing1688TargetId(observation.data);
      if (!requested.has(targetId) || targetsById.has(targetId)) continue;
      const imageUrl = resolveCoupangImageUrl(observation.data.imagePath);
      if (!imageUrl) continue;
      targetsById.set(targetId, {
        targetId,
        imageUrl,
        searchQuery: deriveSourcing1688SearchQuery({
          productName: observation.data.productName,
          primaryKeyword: observation.data.sourceKeyword,
          keywords: [observation.data.sourceKeyword],
        }),
      });
    }
    return {
      targets: input.targetIds.flatMap((targetId) => {
        const target = targetsById.get(targetId);
        return target ? [target] : [];
      }),
      missingTargetIds: input.targetIds.filter((targetId) => !targetsById.has(targetId)),
    };
  }

  async findLatest(input: {
    organizationId: string;
    keywords?: string[];
    targetIds?: string[];
  }): Promise<Sourcing1688StoredSearchSnapshot> {
    const runs = await this.prisma.sourcingEvidenceIngestionRun.findMany({
      where: {
        organizationId: input.organizationId,
        status: { in: [...TERMINAL_COLLECTION_STATUSES] },
        OR: [
          { sourceKey: '1688.hot_product', collectorKey: SOURCING_1688_KEYWORD_COLLECTOR_KEY },
          { sourceKey: '1688.image_search', collectorKey: SOURCING_1688_IMAGE_COLLECTOR_KEY },
        ],
      },
      select: {
        id: true,
        sourceKey: true,
        collectorKey: true,
        status: true,
        completedAt: true,
        qualityReport: true,
      },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: MAX_LATEST_RUN_CANDIDATES,
    });
    const keywordFilter = input.keywords
      ? new Set(input.keywords.map(sourcingWingCatalogKeywordIdentity))
      : null;
    const targetFilter = input.targetIds ? new Set(input.targetIds) : null;
    const latestByIdentity = new Map<string, ResultRun>();
    for (const run of runs) {
      const marker = parseResultMarker(run.qualityReport);
      if (!marker || !run.completedAt) continue;
      const isImage = run.sourceKey === '1688.image_search'
        && run.collectorKey === SOURCING_1688_IMAGE_COLLECTOR_KEY
        && marker.targetId !== null;
      const isKeyword = run.sourceKey === '1688.hot_product'
        && run.collectorKey === SOURCING_1688_KEYWORD_COLLECTOR_KEY
        && marker.targetId === null;
      if (!isImage && !isKeyword) continue;
      if (isImage && targetFilter && !targetFilter.has(marker.targetId!)) continue;
      if (isKeyword && keywordFilter
        && !keywordFilter.has(sourcingWingCatalogKeywordIdentity(marker.keyword))) continue;
      const identity = marker.targetId === null
        ? `keyword:${sourcingWingCatalogKeywordIdentity(marker.keyword)}`
        : `target:${marker.targetId}`;
      if (latestByIdentity.has(identity)) continue;
      latestByIdentity.set(identity, {
        id: run.id,
        completedAt: run.completedAt,
        keyword: marker.keyword,
        targetId: marker.targetId,
      });
      if (latestByIdentity.size >= MAX_LATEST_IDENTITIES) break;
    }
    const selectedRuns = [...latestByIdentity.values()];
    if (selectedRuns.length === 0) {
      return { generatedAt: null, observations: [] };
    }
    const rows = await this.prisma.sourcing1688OfferKeywordObservation.findMany({
      where: {
        organizationId: input.organizationId,
        ingestionRunId: { in: selectedRuns.map((run) => run.id) },
      },
      select: {
        ingestionRunId: true,
        sourceKeywordNormalized: true,
        externalOfferId: true,
        title: true,
        priceCny: true,
        sourceUrl: true,
        imageUrl: true,
        rank: true,
        monthlySales: true,
        supplierName: true,
        capturedAt: true,
        rawOffer: true,
      },
      orderBy: [{ capturedAt: 'desc' }, { rank: 'asc' }, { id: 'asc' }],
    });
    const itemsByRun = new Map<string, Array<{
      capturedAt: Date;
      item: Sourcing1688SearchItem;
    }>>();
    for (const row of rows) {
      const item = parseSearchItem(row);
      if (!item) continue;
      const values = itemsByRun.get(row.ingestionRunId) ?? [];
      values.push({ capturedAt: row.capturedAt, item });
      itemsByRun.set(row.ingestionRunId, values);
    }
    return {
      generatedAt: selectedRuns[0]?.completedAt ?? null,
      observations: selectedRuns.map((run) => {
        const values = itemsByRun.get(run.id) ?? [];
        return {
          keyword: run.keyword,
          targetId: run.targetId,
          capturedAt: values[0]?.capturedAt ?? run.completedAt,
          items: values.map(({ item }) => item),
        };
      }),
    };
  }

  async findCompletedKeywordRun(
    input: Sourcing1688CompletedKeywordRunInput,
  ): Promise<Sourcing1688CompletedSearchRun | null> {
    const run = await this.prisma.sourcingEvidenceIngestionRun.findFirst({
      where: {
        id: input.runId,
        organizationId: input.organizationId,
        sourceKey: '1688.hot_product',
        scopeKey: 'default',
        targetKey: input.targetKey,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        collectorKey: SOURCING_1688_KEYWORD_COLLECTOR_KEY,
        collectorVersion: SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION,
        status: { in: [...TERMINAL_COLLECTION_STATUSES] },
        completedAt: { not: null },
      },
      select: {
        id: true,
        status: true,
        completedAt: true,
        discoveredCount: true,
        acceptedCount: true,
        duplicateCount: true,
        rejectedCount: true,
        staleDiscardedCount: true,
        errorCode: true,
        qualityReport: true,
      },
    });
    if (!run || !run.completedAt || !matchesCompletedKeywordRun(run.qualityReport, input)) {
      return null;
    }
    const counters = exactReplayCounters(run, input.maxResults);
    if (!counters) return null;
    const result = await this.readExactRunItems({
      organizationId: input.organizationId,
      ingestionRunId: run.id,
      keyword: input.keyword,
      maxResults: input.maxResults,
    });
    if (!result || result.items.length > counters.discoveredCount) return null;
    return {
      keyword: input.keyword,
      targetId: null,
      capturedAt: result.capturedAt ?? run.completedAt,
      items: result.items,
      ...counters,
    };
  }

  async findCompletedImageRun(
    input: Sourcing1688CompletedImageRunInput,
  ): Promise<Sourcing1688CompletedSearchRun | null> {
    const run = await this.prisma.sourcingEvidenceIngestionRun.findFirst({
      where: {
        id: input.runId,
        organizationId: input.organizationId,
        sourceKey: '1688.image_search',
        scopeKey: 'default',
        targetKey: input.targetKey,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        collectorKey: SOURCING_1688_IMAGE_COLLECTOR_KEY,
        collectorVersion: SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION,
        status: { in: [...TERMINAL_COLLECTION_STATUSES] },
        completedAt: { not: null },
      },
      select: {
        id: true,
        status: true,
        completedAt: true,
        discoveredCount: true,
        acceptedCount: true,
        duplicateCount: true,
        rejectedCount: true,
        staleDiscardedCount: true,
        errorCode: true,
        qualityReport: true,
      },
    });
    if (!run || !run.completedAt || !matchesCompletedImageRun(run.qualityReport, input)) {
      return null;
    }
    const counters = exactReplayCounters(run, input.maxResults);
    if (!counters) return null;
    const result = await this.readExactRunItems({
      organizationId: input.organizationId,
      ingestionRunId: run.id,
      keyword: input.keyword,
      maxResults: input.maxResults,
    });
    if (!result || result.items.length > counters.discoveredCount) return null;
    return {
      keyword: input.keyword,
      targetId: input.targetId,
      capturedAt: result.capturedAt ?? run.completedAt,
      items: result.items,
      ...counters,
    };
  }

  private async readExactRunItems(input: {
    organizationId: string;
    ingestionRunId: string;
    keyword: string;
    maxResults: number;
  }): Promise<{
    capturedAt: Date | null;
    items: Sourcing1688SearchItem[];
  } | null> {
    const rows = await this.prisma.sourcing1688OfferKeywordObservation.findMany({
      where: {
        organizationId: input.organizationId,
        ingestionRunId: input.ingestionRunId,
      },
      select: {
        sourceKeywordNormalized: true,
        externalOfferId: true,
        title: true,
        priceCny: true,
        sourceUrl: true,
        imageUrl: true,
        rank: true,
        monthlySales: true,
        supplierName: true,
        capturedAt: true,
        rawOffer: true,
      },
      orderBy: [{ capturedAt: 'desc' }, { rank: 'asc' }, { id: 'asc' }],
    });
    if (rows.length > input.maxResults) return null;
    const values = rows.map((row) => ({
      capturedAt: row.capturedAt,
      item: row.sourceKeywordNormalized === input.keyword ? parseSearchItem(row) : null,
    }));
    if (values.some(({ item }) => !item)) return null;
    return {
      capturedAt: values[0]?.capturedAt ?? null,
      items: values.map(({ item }) => item as Sourcing1688SearchItem),
    };
  }
}

interface ResultRun {
  id: string;
  completedAt: Date;
  keyword: string;
  targetId: string | null;
}

function exactReplayCounters(input: {
  status: string;
  discoveredCount: number;
  acceptedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  staleDiscardedCount: number;
  errorCode: string | null;
}, maxResults: number): Pick<Sourcing1688CompletedSearchRun,
  'terminalStatus' | 'discoveredCount' | 'acceptedCount' | 'duplicateCount' | 'rejectedCount' | 'errorCode'
> | null {
  if (!Number.isSafeInteger(maxResults) || maxResults < 1) return null;
  const boundedValues = [
    input.discoveredCount,
    input.acceptedCount,
    input.rejectedCount,
    input.staleDiscardedCount,
  ];
  if (boundedValues.some((value) =>
    !Number.isSafeInteger(value) || value < 0 || value > maxResults)
    || !Number.isSafeInteger(input.duplicateCount)
    || input.duplicateCount < 0
    || input.duplicateCount > maxResults * 2) {
    return null;
  }
  if (input.status !== 'complete' && input.status !== 'partial') return null;
  if (input.discoveredCount > maxResults
    || input.acceptedCount + input.rejectedCount + input.staleDiscardedCount > input.discoveredCount
    || (input.status === 'complete' && input.rejectedCount !== 0)
    || (input.status === 'partial' && input.rejectedCount === 0)) return null;
  const allRejected = input.discoveredCount > 0
    && input.acceptedCount + input.duplicateCount === 0
    && input.rejectedCount > 0;
  return {
    terminalStatus: input.status,
    discoveredCount: input.discoveredCount,
    acceptedCount: input.acceptedCount,
    duplicateCount: input.duplicateCount,
    rejectedCount: input.rejectedCount,
    errorCode: allRejected ? SOURCING_1688_ALL_RESULTS_REJECTED : null,
  };
}

function parseResultMarker(value: unknown): {
  keyword: string;
  targetId: string | null;
} | null {
  if (!isRecord(value)
    || value.resultSchemaVersion !== SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION
    || typeof value.keyword !== 'string'
    || (value.targetId !== null && typeof value.targetId !== 'string')) return null;
  const keyword = value.keyword.trim();
  const targetId = typeof value.targetId === 'string' ? value.targetId.trim() : null;
  if (!keyword || (value.targetId !== null && !targetId)) return null;
  return { keyword, targetId };
}

function matchesCompletedKeywordRun(
  value: unknown,
  input: Sourcing1688CompletedKeywordRunInput,
): boolean {
  const marker = parseResultMarker(value);
  return marker?.targetId === null
    && marker.keyword === input.keyword
    && isRecord(value)
    && value.operationRunId === input.operationRunId;
}

function matchesCompletedImageRun(
  value: unknown,
  input: Sourcing1688CompletedImageRunInput,
): boolean {
  const marker = parseResultMarker(value);
  return marker?.targetId === input.targetId
    && marker.keyword === input.keyword
    && isRecord(value)
    && value.operationRunId === input.operationRunId;
}

function parseSearchItem(row: {
  externalOfferId: string;
  title: string | null;
  priceCny: unknown;
  sourceUrl: string | null;
  imageUrl: string | null;
  monthlySales: number | null;
  supplierName: string | null;
  rawOffer: unknown;
}): Sourcing1688SearchItem | null {
  if (!row.title || !row.sourceUrl) return null;
  const raw = isRecord(row.rawOffer) ? row.rawOffer : {};
  const parsed = Sourcing1688SearchItemSchema.safeParse({
    offerId: row.externalOfferId || null,
    title: row.title,
    priceCny: finiteNumber(row.priceCny),
    sourceUrl: row.sourceUrl,
    imageUrl: row.imageUrl,
    score: finiteNumber(raw.score) ?? 0,
    monthlySales: row.monthlySales,
    tradeScore: finiteNumber(raw.tradeScore),
    repurchaseRate: nullableString(raw.repurchaseRate),
    supplierName: row.supplierName,
    salesText: nullableString(raw.salesText),
    supplierFactoryUrl: nullableString(raw.supplierFactoryUrl),
    supplierTags: stringArray(raw.supplierTags),
    purchaseTags: stringArray(raw.purchaseTags),
    minOrderQuantity: finiteNumber(raw.minOrderQuantity),
    shippingFulfillmentRate: nullableString(raw.shippingFulfillmentRate),
    shippingPickupRate: nullableString(raw.shippingPickupRate),
    shipFrom: nullableString(raw.shipFrom),
    serviceScore: finiteNumber(raw.serviceScore),
  });
  return parsed.success ? parsed.data : null;
}

function resolveCoupangImageUrl(imagePath: string | null): string | null {
  if (!imagePath) return null;
  if (/^https?:\/\//iu.test(imagePath)) return imagePath;
  const normalized = imagePath.replace(/^\/+/, '');
  return normalized
    ? `https://thumbnail10.coupangcdn.com/thumbnails/remote/160x160ex/image/${normalized}`
    : null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const string = nullableString(item);
        return string ? [string] : [];
      }).slice(0, 40)
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
