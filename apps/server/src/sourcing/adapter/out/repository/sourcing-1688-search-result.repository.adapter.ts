import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  Sourcing1688SearchItemSchema,
  Sourcing1688BatchUnitResultSchema,
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
  type Sourcing1688SearchResultRepositoryPort,
  type Sourcing1688StoredSearchObservation,
  type Sourcing1688StoredSearchSnapshot,
} from '../../../application/port/out/repository/sourcing-1688-search-result.repository.port';
import {
  readCompleteSourcingRunsByIds,
  readCurrentCompleteRuns,
  readExactSourcingRun,
  readLatestWingCatalogPublicationFacts,
} from '../../../read/source-evidence.reader';
import { read1688OfferSnapshotsForRuns } from '../../../read/source-evidence.reader';

const MAX_LATEST_RUN_CANDIDATES = 120;
const MAX_TARGET_OBSERVATION_CANDIDATES = 500;
const MAX_LATEST_IDENTITIES = 30;

@Injectable()
export class Sourcing1688SearchResultRepositoryAdapter
implements Sourcing1688SearchResultRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findUnitResult(input: { organizationId: string; attemptId: string; sourceKey: '1688.hot_product' | '1688.image_search' }) {
    const image = input.sourceKey === '1688.image_search';
    const maxResults = image ? 18 : 6;
    const run = await readExactSourcingRun(this.prisma, {
      id: input.attemptId,
      organizationId: input.organizationId,
      sourceKey: input.sourceKey,
      scopeKey: 'default',
      statuses: ['COMPLETE', 'FAILED'],
    });
    const parsed = Sourcing1688BatchUnitResultSchema.safeParse(isRecord(run?.qualityReport) ? run.qualityReport.unitResult : null);
    if (!parsed.success || !isRecord(run?.attemptPlan) || !isRecord(run?.qualityReport)
      || run.collectorKey !== (image ? SOURCING_1688_IMAGE_COLLECTOR_KEY : SOURCING_1688_KEYWORD_COLLECTOR_KEY)
      || run.collectorVersion !== SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION
      || run.qualityReport.resultSchemaVersion !== SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION
      || run.attemptPlan.maxResults !== maxResults) return null;
    const unit = parsed.data;
    if (unit.keyword !== run.attemptPlan.keyword || unit.targetId !== (image ? run.attemptPlan.targetId : null)
      || unit.discovered > maxResults || unit.accepted > unit.discovered || unit.failed > maxResults
      || unit.duplicate > maxResults * 2) return null;
    return unit;
  }

  async resolveImageTargets(input: {
    organizationId: string;
    targetIds: string[];
  }) {
    const requested = new Set(input.targetIds);
    const productIds = [...new Set(input.targetIds.map((targetId) =>
      targetId.slice(0, targetId.indexOf(':'))))];
    const publication = await this.prisma.$transaction(
      (tx) => readLatestWingCatalogPublicationFacts(tx, {
        organizationId: input.organizationId,
        productIds,
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const targetsById = new Map<string, {
      targetId: string;
      imageUrl: string;
      searchQuery: string;
    }>();
    for (const row of publication.rows.slice(0, MAX_TARGET_OBSERVATION_CANDIDATES)) {
      const observation = {
        productId: row.productId,
        itemId: row.itemId,
        vendorItemId: row.vendorItemId,
      };
      const targetId = buildSourcing1688TargetId(observation);
      if (!requested.has(targetId) || targetsById.has(targetId)) continue;
      const imageUrl = resolveCoupangImageUrl(row.imagePath);
      if (!imageUrl) continue;
      targetsById.set(targetId, {
        targetId,
        imageUrl,
        searchQuery: deriveSourcing1688SearchQuery({
          productName: row.productName,
          primaryKeyword: row.sourceKeyword,
          keywords: [row.sourceKeyword],
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
    completeAttemptIds?: string[];
  }): Promise<Sourcing1688StoredSearchSnapshot> {
    const sourceKeys = ['1688.hot_product', '1688.image_search'];
    const collectorKeys = [
      SOURCING_1688_KEYWORD_COLLECTOR_KEY,
      SOURCING_1688_IMAGE_COLLECTOR_KEY,
    ];
    const runs = (input.completeAttemptIds
      ? await readCompleteSourcingRunsByIds(this.prisma, {
          organizationId: input.organizationId,
          ids: input.completeAttemptIds,
          sourceKeys,
          collectorKeys,
        })
      : await readCurrentCompleteRuns(this.prisma, {
          organizationId: input.organizationId,
          sourceKey: sourceKeys,
          collectorKey: collectorKeys,
        }))
      .slice(0, MAX_LATEST_RUN_CANDIDATES);
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
    const rows = await read1688OfferSnapshotsForRuns(this.prisma, {
      organizationId: input.organizationId,
      ingestionRunIds: selectedRuns.map((run) => run.id),
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


}

interface ResultRun {
  id: string;
  completedAt: Date;
  keyword: string;
  targetId: string | null;
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
    score: finiteNumber(raw.score),
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
