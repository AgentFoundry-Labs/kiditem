import { sourcingWingCatalogKeywordIdentity } from '@kiditem/shared/sourcing';
import type { Prisma } from '@prisma/client';

export interface CurrentCompleteRunFilter {
  organizationId: string;
  sourceKey?: string | string[];
  scopeKey?: string;
  targetKey?: string | string[];
  collectorKey?: string | string[];
  collectorVersion?: string;
  cutoffAt?: Date;
  completedFrom?: Date;
  sourceWindowStartFrom?: Date;
  sourceWindowStartTo?: Date;
}

export function currentCompleteRunWhere(
  input: CurrentCompleteRunFilter,
): Prisma.SourcingEvidenceIngestionRunWhereInput {
  return {
    ...completeRunWhere(input),
    isCurrentComplete: true,
  };
}

export function completeRunWhere(
  input: CurrentCompleteRunFilter,
): Prisma.SourcingEvidenceIngestionRunWhereInput {
  return {
    organizationId: input.organizationId,
    ...(input.sourceKey
      ? { sourceKey: Array.isArray(input.sourceKey) ? { in: input.sourceKey } : input.sourceKey }
      : {}),
    ...(input.scopeKey ? { scopeKey: input.scopeKey } : {}),
    ...(input.targetKey
      ? { targetKey: Array.isArray(input.targetKey) ? { in: input.targetKey } : input.targetKey }
      : {}),
    ...(input.collectorKey
      ? { collectorKey: Array.isArray(input.collectorKey) ? { in: input.collectorKey } : input.collectorKey }
      : {}),
    ...(input.collectorVersion ? { collectorVersion: input.collectorVersion } : {}),
    status: 'COMPLETE',
    completedAt: {
      not: null,
      ...(input.completedFrom ? { gte: input.completedFrom } : {}),
      ...(input.cutoffAt ? { lte: input.cutoffAt } : {}),
    },
    ...((input.sourceWindowStartFrom || input.sourceWindowStartTo)
      ? { sourceWindowStartAt: {
          ...(input.sourceWindowStartFrom ? { gte: input.sourceWindowStartFrom } : {}),
          ...(input.sourceWindowStartTo ? { lte: input.sourceWindowStartTo } : {}),
        } }
      : {}),
  };
}

export function readCurrentCompleteRuns(
  tx: Prisma.TransactionClient,
  input: CurrentCompleteRunFilter,
) {
  return tx.sourcingEvidenceIngestionRun.findMany({
    where: currentCompleteRunWhere(input),
    orderBy: [
      { completedAt: 'desc' },
      { generation: 'desc' },
      { id: 'desc' },
    ],
  });
}

export function readCompleteRunsForDeclaredCoverage(
  tx: Prisma.TransactionClient,
  input: CurrentCompleteRunFilter,
) {
  return tx.sourcingEvidenceIngestionRun.findMany({
    where: completeRunWhere(input),
    orderBy: [
      { completedAt: 'desc' },
      { generation: 'desc' },
      { id: 'desc' },
    ],
  });
}

export function readExactSourcingRun(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    id: string;
    sourceKey?: string;
    scopeKey?: string;
    statuses?: string[];
  },
) {
  return tx.sourcingEvidenceIngestionRun.findFirst({
    where: {
      id: input.id,
      organizationId: input.organizationId,
      ...(input.sourceKey ? { sourceKey: input.sourceKey } : {}),
      ...(input.scopeKey ? { scopeKey: input.scopeKey } : {}),
      ...(input.statuses ? { status: { in: input.statuses } } : {}),
    },
  });
}

export function readCompleteSourcingRunsByIds(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    ids: string[];
    sourceKeys?: string[];
    collectorKeys?: string[];
  },
) {
  if (input.ids.length === 0) return Promise.resolve([]);
  return tx.sourcingEvidenceIngestionRun.findMany({
    where: {
      organizationId: input.organizationId,
      id: { in: input.ids },
      ...(input.sourceKeys ? { sourceKey: { in: input.sourceKeys } } : {}),
      ...(input.collectorKeys ? { collectorKey: { in: input.collectorKeys } } : {}),
      status: 'COMPLETE',
      completedAt: { not: null },
    },
    orderBy: [{ completedAt: 'desc' }, { generation: 'desc' }, { id: 'desc' }],
  });
}

export function readSourcingRunByIdempotencyKey(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    sourceKey: string;
    scopeKey: string;
    idempotencyKey: string;
  },
) {
  return tx.sourcingEvidenceIngestionRun.findFirst({
    where: input,
  });
}

export function readLatestSourcingAttempt(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    sourceKey: string;
    scopeKey?: string;
    targetKey?: string;
  },
) {
  return tx.sourcingEvidenceIngestionRun.findFirst({
    where: {
      organizationId: input.organizationId,
      sourceKey: input.sourceKey,
      ...(input.scopeKey ? { scopeKey: input.scopeKey } : {}),
      ...(input.targetKey ? { targetKey: input.targetKey } : {}),
    },
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
  });
}

export interface CurrentObservationHeadFilter {
  organizationId: string;
  sourceKey?: string;
  scopeKey?: string;
  targetKey?: string;
  collectorVersion?: string;
  platform?: string;
  evidenceFamily?: string;
  schemaVersion?: string;
  conceptKey?: string;
  sourceEntityType?: string;
  sourceEntityKeys?: string[];
  observationKeys?: string[];
  supportsCandidate?: boolean;
  signalRoles?: string[];
  ingestionRunIds?: string[];
  runBindings?: Array<{ conceptKey: string; ingestionRunId: string }>;
  cutoffAt?: Date;
  availableFrom?: Date;
  ingestedFrom?: Date;
  eventAtTo?: Date;
  sourceWindowStartFrom?: Date;
  sourceWindowStartTo?: Date;
  order?: 'observedAt' | 'sourceWindowStartAt';
  limit?: number;
}

const observationRunSelect = {
  id: true,
  organizationId: true,
  sourceKey: true,
  scopeKey: true,
  targetKey: true,
  generation: true,
  status: true,
  isCurrentComplete: true,
  sourceWindowStartAt: true,
  sourceWindowEndAt: true,
  discoveredCount: true,
  acceptedCount: true,
  rejectedCount: true,
  duplicateCount: true,
  coverageNumerator: true,
  coverageDenominator: true,
  qualityReport: true,
  completedAt: true,
  startedAt: true,
} satisfies Prisma.SourcingEvidenceIngestionRunSelect;

export const currentObservationInclude = {
  ingestionRun: { select: observationRunSelect },
} satisfies Prisma.SourcingEvidenceObservationInclude;

export type CurrentObservationHead = Prisma.SourcingEvidenceObservationGetPayload<{
  include: typeof currentObservationInclude;
}>;

export function currentObservationRevisionWhere(): Prisma.SourcingEvidenceObservationWhereInput {
  return { supersededByObservation: null };
}

export async function readCurrentObservationHeads(
  tx: Prisma.TransactionClient,
  input: CurrentObservationHeadFilter,
): Promise<CurrentObservationHead[]> {
  return readObservationHeads(tx, input, true);
}

export async function readCompleteObservationHeadsForRuns(
  tx: Prisma.TransactionClient,
  input: CurrentObservationHeadFilter & { ingestionRunIds: string[] },
): Promise<CurrentObservationHead[]> {
  if (input.ingestionRunIds.length === 0) return [];
  return readObservationHeads(tx, input, false);
}

async function readObservationHeads(
  tx: Prisma.TransactionClient,
  input: CurrentObservationHeadFilter,
  requireCurrentComplete: boolean,
): Promise<CurrentObservationHead[]> {
  const rows = await tx.sourcingEvidenceObservation.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.cutoffAt ? {} : currentObservationRevisionWhere()),
      ...(input.sourceKey ? { sourceKey: input.sourceKey } : {}),
      ...(input.platform ? { platform: input.platform } : {}),
      ...(input.evidenceFamily ? { evidenceFamily: input.evidenceFamily } : {}),
      ...(input.schemaVersion ? { schemaVersion: input.schemaVersion } : {}),
      ...(input.conceptKey ? { conceptKey: input.conceptKey } : {}),
      ...(input.sourceEntityType ? { sourceEntityType: input.sourceEntityType } : {}),
      ...(input.sourceEntityKeys ? { sourceEntityKey: { in: input.sourceEntityKeys } } : {}),
      ...(input.observationKeys ? { observationKey: { in: input.observationKeys } } : {}),
      ...(input.supportsCandidate === undefined
        ? {}
        : { supportsCandidate: input.supportsCandidate }),
      ...(input.signalRoles ? { signalRole: { in: input.signalRoles } } : {}),
      ...(input.runBindings?.length
        ? { OR: input.runBindings.map((binding) => ({
            conceptKey: binding.conceptKey,
            ingestionRunId: binding.ingestionRunId,
          })) }
        : {}),
      availableAt: {
        ...(input.availableFrom ? { gte: input.availableFrom } : {}),
        ...(input.cutoffAt ? { lte: input.cutoffAt } : {}),
      },
      ingestedAt: {
        ...(input.ingestedFrom ? { gte: input.ingestedFrom } : {}),
        ...(input.cutoffAt ? { lte: input.cutoffAt } : {}),
      },
      ...(input.eventAtTo ? { eventAt: { lte: input.eventAtTo } } : {}),
      ingestionRun: {
        ...(requireCurrentComplete ? currentCompleteRunWhere : completeRunWhere)({
          organizationId: input.organizationId,
          sourceKey: input.sourceKey,
          scopeKey: input.scopeKey,
          targetKey: input.targetKey,
          collectorVersion: input.collectorVersion,
          cutoffAt: input.cutoffAt,
          sourceWindowStartFrom: input.sourceWindowStartFrom,
          sourceWindowStartTo: input.sourceWindowStartTo,
        }),
        ...(input.ingestionRunIds ? { id: { in: input.ingestionRunIds } } : {}),
      },
    },
    include: currentObservationInclude,
    orderBy: [
      { observationKey: 'asc' },
      { revision: 'desc' },
      { availableAt: 'desc' },
      { ingestedAt: 'desc' },
      { id: 'desc' },
    ],
  });
  const heads = new Map<string, CurrentObservationHead>();
  for (const row of rows) {
    if (!heads.has(row.observationKey)) heads.set(row.observationKey, row);
  }
  return [...heads.values()].sort((left, right) =>
    (input.order === 'sourceWindowStartAt'
      ? (right.ingestionRun.sourceWindowStartAt?.getTime() ?? -Infinity)
        - (left.ingestionRun.sourceWindowStartAt?.getTime() ?? -Infinity)
      : 0)
    || right.observedAt.getTime() - left.observedAt.getTime()
    || right.availableAt.getTime() - left.availableAt.getTime()
    || right.ingestedAt.getTime() - left.ingestedAt.getTime()
    || right.id.localeCompare(left.id),
  ).slice(0, input.limit);
}

export async function readCurrentSupportingObservation(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    observationId: string;
    observationKey: string;
    sourceKey: string;
    scopeKey: string;
    cutoffAt: Date;
  },
): Promise<CurrentObservationHead | null> {
  const [head] = await readCurrentObservationHeads(tx, {
    organizationId: input.organizationId,
    observationKeys: [input.observationKey],
    sourceKey: input.sourceKey,
    targetKey: input.scopeKey,
    supportsCandidate: true,
    signalRoles: ['demand', 'supply'],
    cutoffAt: input.cutoffAt,
    eventAtTo: input.cutoffAt,
  });
  return head?.id === input.observationId ? head : null;
}

export function readCompleteObservationProvenanceByIds(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; observationIds: string[] },
) {
  if (input.observationIds.length === 0) return Promise.resolve([]);
  return tx.sourcingEvidenceObservation.findMany({
    where: {
      id: { in: input.observationIds },
      organizationId: input.organizationId,
      ingestionRun: {
        organizationId: input.organizationId,
        status: 'COMPLETE',
        completedAt: { not: null },
      },
    },
    include: currentObservationInclude,
  });
}

/**
 * Resolves exact observation references that are still published by the
 * source owner's current complete snapshot. Downstream publishers use this
 * before retaining immutable evidence links.
 */
export function readCurrentCompleteObservationReferencesByIds(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; observationIds: string[] },
) {
  if (input.observationIds.length === 0) return Promise.resolve([]);
  return tx.sourcingEvidenceObservation.findMany({
    where: {
      id: { in: input.observationIds },
      organizationId: input.organizationId,
      ...currentObservationRevisionWhere(),
      ingestionRun: currentCompleteRunWhere({
        organizationId: input.organizationId,
      }),
    },
    select: { id: true },
  });
}

export function readCompleteObservationsForAttempt(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    ingestionRunId: string;
    sourceKey?: string;
    evidenceFamily?: string;
    schemaVersion?: string;
    conceptKey?: string;
    limit?: number;
  },
) {
  return tx.sourcingEvidenceObservation.findMany({
    where: {
      organizationId: input.organizationId,
      ingestionRunId: input.ingestionRunId,
      ...(input.sourceKey ? { sourceKey: input.sourceKey } : {}),
      ...(input.evidenceFamily ? { evidenceFamily: input.evidenceFamily } : {}),
      ...(input.schemaVersion ? { schemaVersion: input.schemaVersion } : {}),
      ...(input.conceptKey ? { conceptKey: input.conceptKey } : {}),
      ingestionRun: {
        organizationId: input.organizationId,
        status: 'COMPLETE',
        completedAt: { not: null },
      },
    },
    include: currentObservationInclude,
    orderBy: [
      { observationKey: 'asc' },
      { revision: 'desc' },
      { availableAt: 'desc' },
      { ingestedAt: 'desc' },
      { id: 'desc' },
    ],
    take: input.limit,
  });
}

export function readCompleteNaverKeywordHistoryRuns(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; start: Date },
) {
  return tx.sourcingEvidenceIngestionRun.findMany({
    where: {
      ...completeRunWhere({
        organizationId: input.organizationId,
        sourceKey: 'naver.trend',
        scopeKey: 'default',
      }),
      sourceWindowStartAt: { gte: input.start },
    },
    include: {
      naverKeywordDailySnapshots: {
        where: { businessDate: { gte: input.start } },
        orderBy: [{ capturedAt: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      },
    },
    orderBy: [{ completedAt: 'desc' }, { generation: 'desc' }, { id: 'desc' }],
  });
}

export function readCompleteNaverPopularKeywordHistoryRuns(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; start: Date },
) {
  return tx.sourcingEvidenceIngestionRun.findMany({
    where: {
      ...completeRunWhere({
        organizationId: input.organizationId,
        sourceKey: 'naver.trend',
        scopeKey: 'default',
      }),
      sourceWindowStartAt: { gte: input.start },
    },
    include: {
      naverPopularKeywordDailySnapshots: {
        where: { businessDate: { gte: input.start } },
      },
    },
    orderBy: [{ completedAt: 'desc' }, { generation: 'desc' }, { id: 'desc' }],
  });
}

export function readComplete1688OfferHistoryRuns(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    start: Date;
    sourceKeys?: string[];
    scopeKey?: string;
    targetKey?: string;
    collectorKeys?: string[];
  },
) {
  return tx.sourcingEvidenceIngestionRun.findMany({
    where: {
      ...completeRunWhere({
        organizationId: input.organizationId,
        sourceKey: input.sourceKeys ?? '1688.hot_product',
        scopeKey: input.scopeKey,
        targetKey: input.targetKey,
        collectorKey: input.collectorKeys,
      }),
      sourceWindowEndAt: { gte: input.start },
    },
    include: {
      offerKeywordObservations: {
        where: { businessDate: { gte: input.start } },
        orderBy: [{ businessDate: 'asc' }, { rank: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      },
    },
    orderBy: [{ completedAt: 'desc' }, { generation: 'desc' }, { id: 'desc' }],
  });
}

export function readCompleteShortsHistoryRuns(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; start: Date },
) {
  return tx.sourcingEvidenceIngestionRun.findMany({
    where: {
      ...completeRunWhere({
        organizationId: input.organizationId,
        sourceKey: 'shortstrend.trend',
        scopeKey: 'default',
      }),
      sourceWindowStartAt: { gte: input.start },
    },
    include: {
      shortsTrendDailySnapshots: {
        where: { businessDate: { gte: input.start } },
        orderBy: [{ capturedAt: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      },
    },
    orderBy: [{ completedAt: 'desc' }, { generation: 'desc' }, { id: 'desc' }],
  });
}

export function readCompleteTiktokHistoryRuns(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; start: Date },
) {
  return tx.sourcingEvidenceIngestionRun.findMany({
    where: {
      ...completeRunWhere({
        organizationId: input.organizationId,
        sourceKey: 'tiktok.creative',
        scopeKey: 'default',
        targetKey: 'all',
      }),
      sourceWindowEndAt: { gte: input.start },
    },
    include: {
      tiktokCreativeTrendDailySnapshots: {
        where: { businessDate: { gte: input.start } },
        orderBy: [
          { businessDate: 'asc' },
          { trendType: 'asc' },
          { rank: { sort: 'asc', nulls: 'last' } },
          { id: 'asc' },
        ],
      },
    },
    orderBy: [{ completedAt: 'desc' }, { generation: 'desc' }, { id: 'desc' }],
  });
}

export function readCompleteLiveCommerceHistoryRuns(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; sourceKeys: string[]; start: Date; source?: string },
) {
  const sourceFilter = input.source ? { source: input.source } : {};
  return tx.sourcingEvidenceIngestionRun.findMany({
    where: {
      ...completeRunWhere({
        organizationId: input.organizationId,
        sourceKey: input.sourceKeys,
      }),
      sourceWindowEndAt: { gte: input.start },
    },
    include: {
      liveCommerceBroadcastDailySnapshots: {
        where: { businessDate: { gte: input.start }, ...sourceFilter },
        orderBy: [{ businessDate: 'desc' }, { viewerCount: { sort: 'desc', nulls: 'last' } }, { capturedAt: 'desc' }],
      },
      liveCommerceProductDailySnapshots: {
        where: { businessDate: { gte: input.start }, ...sourceFilter },
        orderBy: [{ businessDate: 'desc' }, { rank: { sort: 'asc', nulls: 'last' } }, { capturedAt: 'desc' }],
      },
    },
    orderBy: [{ completedAt: 'desc' }, { generation: 'desc' }, { id: 'desc' }],
  });
}

/** Returns the source owner's daily coverage date without consulting fact rows. */
export function read1688OfferSnapshotsForRuns(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; ingestionRunIds: string[] },
) {
  if (input.ingestionRunIds.length === 0) return Promise.resolve([]);
  return tx.sourcing1688OfferKeywordObservation.findMany({
    where: {
      organizationId: input.organizationId,
      ingestionRunId: { in: input.ingestionRunIds },
    },
    orderBy: [
      { capturedAt: 'desc' },
      { rank: { sort: 'asc', nulls: 'last' } },
      { id: 'asc' },
    ],
  });
}

/** Resolves exact typed 1688 rows that remain in a current complete source snapshot. */
export function readCurrentComplete1688OfferSnapshotsByIds(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; observationIds: string[] },
) {
  if (input.observationIds.length === 0) return Promise.resolve([]);
  const currentRun = currentCompleteRunWhere({
    organizationId: input.organizationId,
    sourceKey: ['1688.hot_product', '1688.image_search'],
  });
  return tx.sourcing1688OfferKeywordObservation.findMany({
    where: {
      id: { in: input.observationIds },
      organizationId: input.organizationId,
      ingestionRun: currentRun,
      evidenceObservation: {
        organizationId: input.organizationId,
        ...currentObservationRevisionWhere(),
        ingestionRun: currentRun,
      },
    },
    select: {
      id: true,
      externalOfferId: true,
      variantKeyNormalized: true,
    },
  });
}

export async function readCurrent1688OfferSnapshots(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    capturedFrom: Date;
    cutoffAt: Date;
    limit: number;
  },
) {
  const observations = await readCurrentObservationHeads(tx, {
    organizationId: input.organizationId,
    sourceKey: '1688.hot_product',
    schemaVersion: '1688-hot-product/v2',
    cutoffAt: input.cutoffAt,
  });
  if (observations.length === 0) return [];
  return tx.sourcing1688OfferKeywordObservation.findMany({
    where: {
      organizationId: input.organizationId,
      evidenceObservationId: { in: observations.map((row) => row.id) },
      capturedAt: { gte: input.capturedFrom, lte: input.cutoffAt },
    },
    orderBy: [
      { capturedAt: 'desc' },
      { rank: { sort: 'asc', nulls: 'last' } },
      { id: 'desc' },
    ],
    take: input.limit,
  });
}

export async function readCurrentKeywordSuggestionFact(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    normalizedKeyword: string;
    schemaVersion: string;
    collectorVersion: string;
  },
) {
  return tx.sourcingKeywordSuggestionFact.findFirst({
    where: {
      organizationId: input.organizationId,
      keywordNormalized: input.normalizedKeyword,
      schemaVersion: input.schemaVersion,
      evidenceObservation: {
        organizationId: input.organizationId,
        sourceKey: 'coupang.keyword_suggestion',
        evidenceFamily: 'keyword_suggestion',
        schemaVersion: input.schemaVersion,
        conceptKey: input.normalizedKeyword,
        supersededByObservation: null,
      },
      ingestionRun: {
        ...currentCompleteRunWhere({
          organizationId: input.organizationId,
          sourceKey: 'coupang.keyword_suggestion',
          scopeKey: 'default',
          targetKey: `keyword:${input.normalizedKeyword}`,
        }),
        collectorVersion: input.collectorVersion,
      },
    },
    orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
  });
}

export async function readKeywordAnalysisFact(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    inputHash: string;
    schemaVersion: string;
    attemptId?: string;
  },
) {
  return tx.sourcingNaverKeywordAnalysisFact.findFirst({
    where: {
      organizationId: input.organizationId,
      inputHash: input.inputHash,
      schemaVersion: input.schemaVersion,
      evidenceObservation: {
        organizationId: input.organizationId,
        sourceKey: 'naver.keyword_analysis',
        evidenceFamily: 'keyword_analysis',
        schemaVersion: input.schemaVersion,
        conceptKey: input.inputHash,
        supersededByObservation: null,
      },
      ingestionRun: input.attemptId
        ? {
            ...completeRunWhere({
              organizationId: input.organizationId,
              sourceKey: 'naver.keyword_analysis',
              scopeKey: 'default',
              targetKey: input.inputHash,
            }),
            id: input.attemptId,
          }
        : currentCompleteRunWhere({
            organizationId: input.organizationId,
            sourceKey: 'naver.keyword_analysis',
            scopeKey: 'default',
            targetKey: input.inputHash,
          }),
    },
    orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
  });
}

interface WingCatalogFactFilter {
  organizationId: string;
  runBindings: Array<{ ingestionRunId: string; normalizedKeyword: string }>;
  schemaVersion: string;
  capturedFrom?: Date;
  cutoffAt?: Date;
  productIds?: string[];
}

interface LatestWingCatalogPublicationFilter {
  organizationId: string;
  normalizedKeywords?: string[];
  capturedFrom?: Date;
  cutoffAt?: Date;
  productIds?: string[];
}

interface WingPublicationRun {
  id: string;
  acceptedCount: number;
  completedAt: Date | null;
  qualityReport: unknown;
}

interface WingPublicationCoverage {
  normalizedKeyword: string;
  ingestionRunId: string;
  completedAt: Date | null;
  acceptedCount: number | null;
  rejectedCount: number;
}

function wingCatalogFactWhere(input: WingCatalogFactFilter): Prisma.SourcingWingCatalogProductFactWhereInput {
  return {
    organizationId: input.organizationId,
    schemaVersion: input.schemaVersion,
    OR: input.runBindings.map(({ ingestionRunId, normalizedKeyword }) => ({
      ingestionRunId,
      sourceKeywordNormalized: normalizedKeyword,
    })),
    ...(input.productIds ? { productId: { in: input.productIds } } : {}),
    ...(input.capturedFrom || input.cutoffAt
      ? {
          capturedAt: {
            ...(input.capturedFrom ? { gte: input.capturedFrom } : {}),
            ...(input.cutoffAt ? { lte: input.cutoffAt } : {}),
          },
        }
      : {}),
    evidenceObservation: {
      organizationId: input.organizationId,
      sourceKey: 'coupang.wing_catalog',
      platform: 'coupang',
      evidenceFamily: 'wing_catalog',
      schemaVersion: input.schemaVersion,
      supersededByObservation: null,
    },
    ingestionRun: {
      ...completeRunWhere({
        organizationId: input.organizationId,
        sourceKey: 'coupang.wing_catalog',
        scopeKey: 'default',
        targetKey: 'catalog',
      }),
    },
  };
}

async function readWingCatalogFactsForRuns(
  tx: Prisma.TransactionClient,
  input: WingCatalogFactFilter & { limit: number },
) {
  if (input.runBindings.length === 0 || input.limit <= 0) return [];
  return tx.sourcingWingCatalogProductFact.findMany({
    where: wingCatalogFactWhere(input),
    orderBy: [
      { capturedAt: 'desc' },
      { productId: 'asc' },
      { vendorItemId: { sort: 'asc', nulls: 'last' } },
      { itemId: { sort: 'asc', nulls: 'last' } },
      { id: 'asc' },
    ],
    take: input.limit,
  });
}

async function countWingCatalogFactsForRuns(
  tx: Prisma.TransactionClient,
  input: WingCatalogFactFilter,
) {
  if (input.runBindings.length === 0) return [];
  return tx.sourcingWingCatalogProductFact.groupBy({
    by: ['ingestionRunId', 'sourceKeywordNormalized'],
    where: wingCatalogFactWhere(input),
    _count: { _all: true },
  });
}

/**
 * Reads the latest complete Wing publication for each keyword. The newest
 * declaration always masks older facts, including when its typed publication
 * is missing or partial. A publication is readable only when its owner receipt
 * and persisted fact count agree exactly.
 */
export async function readLatestWingCatalogPublicationFacts(
  tx: Prisma.TransactionClient,
  input: LatestWingCatalogPublicationFilter,
) {
  const requestedKeywords = input.normalizedKeywords
    ? new Set(input.normalizedKeywords.map(sourcingWingCatalogKeywordIdentity))
    : null;
  const runs = await readCompleteRunsForDeclaredCoverage(tx, {
    organizationId: input.organizationId,
    sourceKey: 'coupang.wing_catalog',
    scopeKey: 'default',
    targetKey: 'catalog',
    completedFrom: input.capturedFrom,
    cutoffAt: input.cutoffAt,
  });
  const latestByKeyword = new Map<string, WingPublicationCoverage>();
  for (const run of runs) {
    for (const publication of wingPublicationCoverage(run)) {
      if (requestedKeywords && !requestedKeywords.has(publication.normalizedKeyword)) continue;
      if (!latestByKeyword.has(publication.normalizedKeyword)) {
        latestByKeyword.set(publication.normalizedKeyword, publication);
      }
    }
  }
  const candidates = [...latestByKeyword.values()];
  const countable = candidates.filter((publication) => publication.acceptedCount !== null);
  const factCounts = await countWingCatalogFactsForRuns(tx, {
    organizationId: input.organizationId,
    schemaVersion: 'coupang-wing-catalog/v2',
    capturedFrom: input.capturedFrom,
    cutoffAt: input.cutoffAt,
    runBindings: countable.map((publication) => ({
      normalizedKeyword: publication.normalizedKeyword,
      ingestionRunId: publication.ingestionRunId,
    })),
  });
  const actualByPublication = new Map(factCounts.map((count) => [
    `${count.ingestionRunId}\u001f${count.sourceKeywordNormalized}`,
    count._count._all,
  ]));
  const publications = candidates.map((publication) => {
    const actualCount = actualByPublication.get(
      `${publication.ingestionRunId}\u001f${publication.normalizedKeyword}`,
    ) ?? 0;
    const available = publication.acceptedCount !== null
      && publication.acceptedCount === actualCount;
    return {
      ...publication,
      actualCount,
      available,
      rejectedCount: available
        ? 0
        : publication.acceptedCount === null
          ? publication.rejectedCount
          : Math.max(1, publication.acceptedCount, actualCount),
    };
  });
  const available = publications.filter((publication) => publication.available);
  const acceptedFactCount = available.reduce(
    (sum, publication) => sum + (publication.acceptedCount ?? 0),
    0,
  );
  const rows = acceptedFactCount === 0
    ? []
    : await readWingCatalogFactsForRuns(tx, {
        organizationId: input.organizationId,
        schemaVersion: 'coupang-wing-catalog/v2',
        capturedFrom: input.capturedFrom,
        cutoffAt: input.cutoffAt,
        productIds: input.productIds,
        runBindings: available.map((publication) => ({
          normalizedKeyword: publication.normalizedKeyword,
          ingestionRunId: publication.ingestionRunId,
        })),
        limit: acceptedFactCount,
      });
  return {
    rows,
    publications,
    rejectedCount: publications.reduce((sum, publication) => sum + publication.rejectedCount, 0),
  };
}

function wingPublicationCoverage(run: WingPublicationRun): WingPublicationCoverage[] {
  const report = isRecord(run.qualityReport) ? run.qualityReport : null;
  const snapshots = Array.isArray(report?.snapshots) ? report.snapshots : [];
  const receipts = Array.isArray(report?.wingReceipts) ? report.wingReceipts : [];
  return snapshots.flatMap((snapshot, index) => {
    if (!isRecord(snapshot) || typeof snapshot.keyword !== 'string') return [];
    const normalizedKeyword = sourcingWingCatalogKeywordIdentity(snapshot.keyword);
    if (!normalizedKeyword) return [];
    const receipt = isRecord(receipts[index]) ? receipts[index] : null;
    const count = nonNegativeInteger(receipt?.count);
    if (count === null) {
      return [{
        normalizedKeyword,
        ingestionRunId: run.id,
        completedAt: run.completedAt,
        acceptedCount: run.acceptedCount === 0 ? 0 : null,
        rejectedCount: run.acceptedCount === 0 ? 0 : Math.max(1, run.acceptedCount),
      }];
    }
    const hasExplicitAcceptedCount = receipt !== null && 'acceptedCount' in receipt;
    const explicitAcceptedCount = hasExplicitAcceptedCount
      ? nonNegativeInteger(receipt.acceptedCount)
      : null;
    const duplicateCount = receipt?.duplicateCount === undefined
      ? 0
      : nonNegativeInteger(receipt.duplicateCount);
    const acceptedCount = hasExplicitAcceptedCount
      ? explicitAcceptedCount !== null && explicitAcceptedCount <= count
        && (duplicateCount === null || explicitAcceptedCount + duplicateCount === count)
        ? explicitAcceptedCount
        : null
      : duplicateCount !== null && duplicateCount <= count
        ? count - duplicateCount
        : null;
    return [{
      normalizedKeyword,
      ingestionRunId: run.id,
      completedAt: run.completedAt,
      acceptedCount,
      rejectedCount: acceptedCount === null ? Math.max(1, count) : 0,
    }];
  });
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const marketFactWhere = (organizationId: string) => ({
  organizationId,
  schemaVersion: 'market-shadow-signals.v1',
  evidenceObservation: {
    organizationId,
    sourceKey: 'market_shadow_signals',
    evidenceFamily: 'market_shadow_snapshot',
    schemaVersion: 'market-shadow-signals.v1',
    supersededByObservation: null,
  },
  ingestionRun: completeRunWhere({
    organizationId,
    sourceKey: 'market_shadow_signals',
    scopeKey: 'day',
  }),
} as const);

const marketFactInclude = {
  ingestionRun: {
    select: {
      startedAt: true,
      completedAt: true,
      sourceWindowStartAt: true,
      sourceWindowEndAt: true,
      isCurrentComplete: true,
    },
  },
} satisfies Prisma.SourcingMarketShadowFactInclude;

export async function readMarketShadowFactForAttempt(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; ingestionRunId: string },
) {
  return tx.sourcingMarketShadowFact.findFirst({
    where: {
      ...marketFactWhere(input.organizationId),
      ingestionRunId: input.ingestionRunId,
    },
    include: marketFactInclude,
    orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
  });
}

export async function readLatestCurrentMarketShadowFact(
  tx: Prisma.TransactionClient,
  organizationId: string,
) {
  return tx.sourcingMarketShadowFact.findFirst({
    where: {
      ...marketFactWhere(organizationId),
      ingestionRun: currentCompleteRunWhere({
        organizationId,
        sourceKey: 'market_shadow_signals',
        scopeKey: 'day',
      }),
    },
    include: marketFactInclude,
    orderBy: [
      { businessDate: 'desc' },
      { capturedAt: 'desc' },
      { id: 'desc' },
    ],
  });
}

export async function readRecentCurrentMarketShadowFacts(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    fromBusinessDate: Date;
    toBusinessDate: Date;
    limit: number;
  },
) {
  return tx.sourcingMarketShadowFact.findMany({
    where: {
      ...marketFactWhere(input.organizationId),
      businessDate: {
        gte: input.fromBusinessDate,
        lte: input.toBusinessDate,
      },
      ingestionRun: currentCompleteRunWhere({
        organizationId: input.organizationId,
        sourceKey: 'market_shadow_signals',
        scopeKey: 'day',
      }),
    },
    include: marketFactInclude,
    orderBy: [
      { businessDate: 'desc' },
      { capturedAt: 'desc' },
      { id: 'desc' },
    ],
    take: input.limit,
  });
}
