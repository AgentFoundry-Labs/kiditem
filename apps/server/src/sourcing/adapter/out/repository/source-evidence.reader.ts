import { sourcingWingCatalogKeywordIdentity } from '@kiditem/shared/sourcing';
import type { Prisma } from '@prisma/client';

/**
 * 소싱 원장 리더(KID-360). "완결"과 "현재"는 발행 이력 표(`sourcing_source_publications`)가 정한다:
 * 성공한 수집 하나가 발행 1행이고, 그 대상의 현재 스냅샷은 `isCurrent` 행이다. 원장 행은 자기 발행의
 * `operationId`로 이어진다(FK 없음). 리더는 실행 표도 run 표도 읽지 않는다 — 진행 중인 시도 읽기
 * (`readExactSourcingRun` 등)는 아직 run 표를 쓰는 서버 구동 kind의 몫이다.
 */
export interface PublicationFilter {
  organizationId: string;
  sourceKey?: string | string[];
  scopeKey?: string;
  targetKey?: string | string[];
  collectorKey?: string | string[];
  collectorVersion?: string;
  cutoffAt?: Date;
  completedFrom?: Date;
  windowEndFrom?: Date;
  windowStartFrom?: Date;
}

export function publicationWhere(
  input: PublicationFilter,
  options: { current: boolean },
): Prisma.SourcingSourcePublicationWhereInput {
  return {
    organizationId: input.organizationId,
    ...(options.current ? { isCurrent: true } : {}),
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
    ...((input.completedFrom || input.cutoffAt)
      ? { completedAt: {
          ...(input.completedFrom ? { gte: input.completedFrom } : {}),
          ...(input.cutoffAt ? { lte: input.cutoffAt } : {}),
        } }
      : {}),
    ...(input.windowStartFrom ? { windowStartAt: { gte: input.windowStartFrom } } : {}),
    ...(input.windowEndFrom ? { windowEndAt: { gte: input.windowEndFrom } } : {}),
  };
}

const PUBLICATION_ORDER = [
  { completedAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.SourcingSourcePublicationOrderByWithRelationInput[];

export type SourcePublication = Prisma.SourcingSourcePublicationGetPayload<{}>;

/** 대상마다 하나뿐인 현재 발행. 최근 완료 순. */
export function readCurrentPublications(tx: Prisma.TransactionClient, input: PublicationFilter) {
  return tx.sourcingSourcePublication.findMany({
    where: publicationWhere(input, { current: true }),
    orderBy: PUBLICATION_ORDER,
  });
}

/** 걸러진 모든 발행(이력). 최근 완료 순. */
export function readPublications(tx: Prisma.TransactionClient, input: PublicationFilter) {
  return tx.sourcingSourcePublication.findMany({
    where: publicationWhere(input, { current: false }),
    orderBy: PUBLICATION_ORDER,
  });
}

export function readPublicationsByOperationIds(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    operationIds: string[];
    sourceKeys?: string[];
    collectorKeys?: string[];
  },
) {
  if (input.operationIds.length === 0) return Promise.resolve([]);
  return tx.sourcingSourcePublication.findMany({
    where: {
      organizationId: input.organizationId,
      operationId: { in: input.operationIds },
      ...(input.sourceKeys ? { sourceKey: { in: input.sourceKeys } } : {}),
      ...(input.collectorKeys ? { collectorKey: { in: input.collectorKeys } } : {}),
    },
    orderBy: PUBLICATION_ORDER,
  });
}

// ── 서버 구동 kind의 시도(run 표). KID-360 I-b에서 실행 계약으로 옮겨지면 사라진다. ──

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

// ── 관측(evidence observation) ──

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
  cutoffAt?: Date;
  eventAtTo?: Date;
  limit?: number;
}

export type ObservationRow = Prisma.SourcingEvidenceObservationGetPayload<{}>;
/** 관측 한 행과 그 행을 쓴 발행. 발행이 없는 관측(실패한 시도)은 리더가 내지 않는다. */
export type CurrentObservationHead = ObservationRow & { publication: SourcePublication };

export function currentObservationRevisionWhere(): Prisma.SourcingEvidenceObservationWhereInput {
  return { supersededByObservation: null };
}

function withPublications<T extends { operationId: string }>(
  rows: T[],
  publications: readonly SourcePublication[],
): Array<T & { publication: SourcePublication }> {
  const byOperation = new Map(publications.map((publication) => [publication.operationId, publication]));
  return rows.flatMap((row) => {
    const publication = byOperation.get(row.operationId);
    return publication ? [{ ...row, publication }] : [];
  });
}

/** 현재 발행에 속한 관측의 최신 revision 머리들. */
export async function readCurrentObservationHeads(
  tx: Prisma.TransactionClient,
  input: CurrentObservationHeadFilter,
): Promise<CurrentObservationHead[]> {
  const publications = await readCurrentPublications(tx, {
    organizationId: input.organizationId,
    sourceKey: input.sourceKey,
    scopeKey: input.scopeKey,
    targetKey: input.targetKey,
    collectorVersion: input.collectorVersion,
    cutoffAt: input.cutoffAt,
  });
  if (publications.length === 0) return [];
  const rows = await tx.sourcingEvidenceObservation.findMany({
    where: {
      organizationId: input.organizationId,
      operationId: { in: publications.map((publication) => publication.operationId) },
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
      ...(input.cutoffAt
        ? { availableAt: { lte: input.cutoffAt }, ingestedAt: { lte: input.cutoffAt } }
        : {}),
      ...(input.eventAtTo ? { eventAt: { lte: input.eventAtTo } } : {}),
    },
    orderBy: [
      { observationKey: 'asc' },
      { revision: 'desc' },
      { availableAt: 'desc' },
      { ingestedAt: 'desc' },
      { id: 'desc' },
    ],
  });
  const heads = new Map<string, CurrentObservationHead>();
  for (const row of withPublications(rows, publications)) {
    if (!heads.has(row.observationKey)) heads.set(row.observationKey, row);
  }
  return [...heads.values()].sort((left, right) =>
    right.observedAt.getTime() - left.observedAt.getTime()
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

/** 발행된(성공한 수집의) 관측을 id로. 현재가 아니어도 된다 — 불변 provenance다. */
export async function readCompleteObservationProvenanceByIds(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; observationIds: string[] },
): Promise<CurrentObservationHead[]> {
  if (input.observationIds.length === 0) return [];
  const rows = await tx.sourcingEvidenceObservation.findMany({
    where: { id: { in: input.observationIds }, organizationId: input.organizationId },
  });
  const publications = await readPublicationsByOperationIds(tx, {
    organizationId: input.organizationId,
    operationIds: [...new Set(rows.map((row) => row.operationId))],
  });
  return withPublications(rows, publications);
}

/**
 * Resolves exact observation references that are still published by the
 * source owner's current complete snapshot. Downstream publishers use this
 * before retaining immutable evidence links.
 */
export async function readCurrentCompleteObservationReferencesByIds(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; observationIds: string[] },
): Promise<Array<{ id: string }>> {
  if (input.observationIds.length === 0) return [];
  const rows = await tx.sourcingEvidenceObservation.findMany({
    where: {
      id: { in: input.observationIds },
      organizationId: input.organizationId,
      ...currentObservationRevisionWhere(),
    },
    select: { id: true, operationId: true },
  });
  const current = await currentOperationIds(tx, input.organizationId, rows.map((row) => row.operationId));
  return rows.filter((row) => current.has(row.operationId)).map(({ id }) => ({ id }));
}

async function currentOperationIds(
  tx: Prisma.TransactionClient,
  organizationId: string,
  operationIds: string[],
  sourceKeys?: string[],
): Promise<Set<string>> {
  if (operationIds.length === 0) return new Set();
  const publications = await tx.sourcingSourcePublication.findMany({
    where: {
      organizationId,
      isCurrent: true,
      operationId: { in: [...new Set(operationIds)] },
      ...(sourceKeys ? { sourceKey: { in: sourceKeys } } : {}),
    },
    select: { operationId: true },
  });
  return new Set(publications.map((publication) => publication.operationId));
}

// ── 이력: 발행마다 그 발행의 원장 행을 붙인다 ──

type WithRows<K extends string, R> = SourcePublication & Record<K, R[]>;

async function attachRows<K extends string, R extends { operationId: string }>(
  publications: SourcePublication[],
  key: K,
  rows: R[],
): Promise<Array<WithRows<K, R>>> {
  const byOperation = new Map<string, R[]>();
  for (const row of rows) {
    const list = byOperation.get(row.operationId) ?? [];
    list.push(row);
    byOperation.set(row.operationId, list);
  }
  return publications.map((publication) => ({
    ...publication,
    [key]: byOperation.get(publication.operationId) ?? [],
  }) as WithRows<K, R>);
}

function operationIdsOf(publications: readonly SourcePublication[]): string[] {
  return publications.map((publication) => publication.operationId);
}

export async function readCompleteNaverKeywordHistoryPublications(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; start: Date },
) {
  const publications = await readPublications(tx, {
    organizationId: input.organizationId,
    sourceKey: 'naver.trend',
    scopeKey: 'default',
    windowStartFrom: input.start,
  });
  const rows = publications.length === 0 ? [] : await tx.naverKeywordDailySnapshot.findMany({
    where: {
      organizationId: input.organizationId,
      operationId: { in: operationIdsOf(publications) },
      businessDate: { gte: input.start },
    },
    orderBy: [{ capturedAt: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  return attachRows(publications, 'naverKeywordDailySnapshots', rows);
}

export async function readCompleteNaverPopularKeywordHistoryPublications(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; start: Date },
) {
  const publications = await readPublications(tx, {
    organizationId: input.organizationId,
    sourceKey: 'naver.trend',
    scopeKey: 'default',
    windowStartFrom: input.start,
  });
  const rows = publications.length === 0 ? [] : await tx.naverPopularKeywordDailySnapshot.findMany({
    where: {
      organizationId: input.organizationId,
      operationId: { in: operationIdsOf(publications) },
      businessDate: { gte: input.start },
    },
  });
  return attachRows(publications, 'naverPopularKeywordDailySnapshots', rows);
}

export async function readComplete1688OfferHistoryPublications(
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
  const publications = await readPublications(tx, {
    organizationId: input.organizationId,
    sourceKey: input.sourceKeys ?? '1688.hot_product',
    scopeKey: input.scopeKey,
    targetKey: input.targetKey,
    collectorKey: input.collectorKeys,
    windowEndFrom: input.start,
  });
  const rows = publications.length === 0 ? [] : await tx.sourcing1688OfferKeywordObservation.findMany({
    where: {
      organizationId: input.organizationId,
      operationId: { in: operationIdsOf(publications) },
      businessDate: { gte: input.start },
    },
    orderBy: [{ businessDate: 'asc' }, { rank: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
  });
  return attachRows(publications, 'offerKeywordObservations', rows);
}

export async function readCompleteShortsHistoryPublications(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; start: Date },
) {
  const publications = await readPublications(tx, {
    organizationId: input.organizationId,
    sourceKey: 'shortstrend.trend',
    scopeKey: 'default',
    windowStartFrom: input.start,
  });
  const rows = publications.length === 0 ? [] : await tx.shortsTrendDailySnapshot.findMany({
    where: {
      organizationId: input.organizationId,
      operationId: { in: operationIdsOf(publications) },
      businessDate: { gte: input.start },
    },
    orderBy: [{ capturedAt: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  return attachRows(publications, 'shortsTrendDailySnapshots', rows);
}

export async function readCompleteTiktokHistoryPublications(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; start: Date },
) {
  const publications = await readPublications(tx, {
    organizationId: input.organizationId,
    sourceKey: 'tiktok.creative',
    scopeKey: 'default',
    targetKey: 'all',
    windowEndFrom: input.start,
  });
  const rows = publications.length === 0 ? [] : await tx.tiktokCreativeTrendDailySnapshot.findMany({
    where: {
      organizationId: input.organizationId,
      operationId: { in: operationIdsOf(publications) },
      businessDate: { gte: input.start },
    },
    orderBy: [
      { businessDate: 'asc' },
      { trendType: 'asc' },
      { rank: { sort: 'asc', nulls: 'last' } },
      { id: 'asc' },
    ],
  });
  return attachRows(publications, 'tiktokCreativeTrendDailySnapshots', rows);
}

export async function readCompleteLiveCommerceHistoryPublications(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; sourceKeys: string[]; start: Date; source?: string },
) {
  const sourceFilter = input.source ? { source: input.source } : {};
  const publications = await readPublications(tx, {
    organizationId: input.organizationId,
    sourceKey: input.sourceKeys,
    windowEndFrom: input.start,
  });
  if (publications.length === 0) return [];
  const where = {
    organizationId: input.organizationId,
    operationId: { in: operationIdsOf(publications) },
    businessDate: { gte: input.start },
    ...sourceFilter,
  };
  const [broadcasts, products] = await Promise.all([
    tx.liveCommerceBroadcastDailySnapshot.findMany({
      where,
      orderBy: [{ businessDate: 'desc' }, { viewerCount: { sort: 'desc', nulls: 'last' } }, { capturedAt: 'desc' }],
    }),
    tx.liveCommerceProductDailySnapshot.findMany({
      where,
      orderBy: [{ businessDate: 'desc' }, { rank: { sort: 'asc', nulls: 'last' } }, { capturedAt: 'desc' }],
    }),
  ]);
  const withBroadcasts = await attachRows(publications, 'liveCommerceBroadcastDailySnapshots', broadcasts);
  const productsByOperation = await attachRows(publications, 'liveCommerceProductDailySnapshots', products);
  return withBroadcasts.map((publication, index) => ({
    ...publication,
    liveCommerceProductDailySnapshots: productsByOperation[index].liveCommerceProductDailySnapshots,
  }));
}

export function read1688OfferSnapshotsForOperations(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; operationIds: string[] },
) {
  if (input.operationIds.length === 0) return Promise.resolve([]);
  return tx.sourcing1688OfferKeywordObservation.findMany({
    where: {
      organizationId: input.organizationId,
      operationId: { in: input.operationIds },
    },
    orderBy: [
      { capturedAt: 'desc' },
      { rank: { sort: 'asc', nulls: 'last' } },
      { id: 'asc' },
    ],
  });
}

/** Resolves exact typed 1688 rows that remain in a current complete source snapshot. */
export async function readCurrentComplete1688OfferSnapshotsByIds(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; observationIds: string[] },
) {
  if (input.observationIds.length === 0) return [];
  const rows = await tx.sourcing1688OfferKeywordObservation.findMany({
    where: {
      id: { in: input.observationIds },
      organizationId: input.organizationId,
      evidenceObservation: {
        organizationId: input.organizationId,
        ...currentObservationRevisionWhere(),
      },
    },
    select: {
      id: true,
      operationId: true,
      externalOfferId: true,
      variantKeyNormalized: true,
      evidenceObservation: { select: { operationId: true } },
    },
  });
  const current = await currentOperationIds(
    tx,
    input.organizationId,
    rows.flatMap((row) => [row.operationId, row.evidenceObservation.operationId]),
    ['1688.hot_product', '1688.image_search'],
  );
  return rows
    .filter((row) => current.has(row.operationId) && current.has(row.evidenceObservation.operationId))
    .map(({ id, externalOfferId, variantKeyNormalized }) => ({ id, externalOfferId, variantKeyNormalized }));
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
  const [publication] = await readCurrentPublications(tx, {
    organizationId: input.organizationId,
    sourceKey: 'coupang.keyword_suggestion',
    scopeKey: 'default',
    targetKey: `keyword:${input.normalizedKeyword}`,
    collectorVersion: input.collectorVersion,
  });
  if (!publication) return null;
  return tx.sourcingKeywordSuggestionFact.findFirst({
    where: {
      organizationId: input.organizationId,
      operationId: publication.operationId,
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
  const filter = {
    organizationId: input.organizationId,
    sourceKey: 'naver.keyword_analysis',
    scopeKey: 'default',
    targetKey: input.inputHash,
  };
  const publications = input.attemptId
    ? (await readPublications(tx, filter)).filter((publication) => publication.operationId === input.attemptId)
    : await readCurrentPublications(tx, filter);
  const [publication] = publications;
  if (!publication) return null;
  return tx.sourcingNaverKeywordAnalysisFact.findFirst({
    where: {
      organizationId: input.organizationId,
      operationId: publication.operationId,
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
    },
    orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
  });
}

interface WingCatalogFactFilter {
  organizationId: string;
  runBindings: Array<{ operationId: string; normalizedKeyword: string }>;
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

interface WingPublicationCoverage {
  normalizedKeyword: string;
  operationId: string;
  completedAt: Date | null;
  acceptedCount: number | null;
  rejectedCount: number;
}

function wingCatalogFactWhere(input: WingCatalogFactFilter): Prisma.SourcingWingCatalogProductFactWhereInput {
  return {
    organizationId: input.organizationId,
    schemaVersion: input.schemaVersion,
    OR: input.runBindings.map(({ operationId, normalizedKeyword }) => ({
      operationId,
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
    by: ['operationId', 'sourceKeywordNormalized'],
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
  const publications = await readPublications(tx, {
    organizationId: input.organizationId,
    sourceKey: 'coupang.wing_catalog',
    scopeKey: 'default',
    targetKey: 'catalog',
    completedFrom: input.capturedFrom,
    cutoffAt: input.cutoffAt,
  });
  const latestByKeyword = new Map<string, WingPublicationCoverage>();
  for (const publication of publications) {
    for (const coverage of wingPublicationCoverage(publication)) {
      if (requestedKeywords && !requestedKeywords.has(coverage.normalizedKeyword)) continue;
      if (!latestByKeyword.has(coverage.normalizedKeyword)) {
        latestByKeyword.set(coverage.normalizedKeyword, coverage);
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
      operationId: publication.operationId,
    })),
  });
  const actualByPublication = new Map(factCounts.map((count) => [
    `${count.operationId}\u001f${count.sourceKeywordNormalized}`,
    count._count._all,
  ]));
  const resolved = candidates.map((publication) => {
    const actualCount = actualByPublication.get(
      `${publication.operationId}\u001f${publication.normalizedKeyword}`,
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
  const available = resolved.filter((publication) => publication.available);
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
          operationId: publication.operationId,
        })),
        limit: acceptedFactCount,
      });
  return {
    rows,
    publications: resolved,
    rejectedCount: resolved.reduce((sum, publication) => sum + publication.rejectedCount, 0),
  };
}

function wingPublicationCoverage(publication: SourcePublication): WingPublicationCoverage[] {
  const report = isRecord(publication.qualityReport) ? publication.qualityReport : null;
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
        operationId: publication.operationId,
        completedAt: publication.completedAt,
        acceptedCount: publication.acceptedCount === 0 ? 0 : null,
        rejectedCount: publication.acceptedCount === 0 ? 0 : Math.max(1, publication.acceptedCount),
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
      operationId: publication.operationId,
      completedAt: publication.completedAt,
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

// ── 시장 그림자(market shadow) ──

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
} as const);

const MARKET_SHADOW_PUBLICATIONS = { sourceKey: 'market_shadow_signals', scopeKey: 'day' } as const;

export type MarketShadowFactWithPublication =
  Prisma.SourcingMarketShadowFactGetPayload<{}> & { publication: SourcePublication };

export async function readMarketShadowFactForAttempt(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; operationId: string },
): Promise<MarketShadowFactWithPublication | null> {
  const publications = await readPublicationsByOperationIds(tx, {
    organizationId: input.organizationId,
    operationIds: [input.operationId],
    sourceKeys: [MARKET_SHADOW_PUBLICATIONS.sourceKey],
  });
  if (publications.length === 0) return null;
  const fact = await tx.sourcingMarketShadowFact.findFirst({
    where: { ...marketFactWhere(input.organizationId), operationId: input.operationId },
    orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
  });
  return fact ? withPublications([fact], publications)[0] ?? null : null;
}

async function readCurrentMarketShadowFacts(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; fromBusinessDate?: Date; toBusinessDate?: Date; limit: number },
): Promise<MarketShadowFactWithPublication[]> {
  const publications = await readCurrentPublications(tx, {
    organizationId: input.organizationId,
    ...MARKET_SHADOW_PUBLICATIONS,
  });
  if (publications.length === 0) return [];
  const facts = await tx.sourcingMarketShadowFact.findMany({
    where: {
      ...marketFactWhere(input.organizationId),
      operationId: { in: operationIdsOf(publications) },
      ...(input.fromBusinessDate || input.toBusinessDate
        ? { businessDate: {
            ...(input.fromBusinessDate ? { gte: input.fromBusinessDate } : {}),
            ...(input.toBusinessDate ? { lte: input.toBusinessDate } : {}),
          } }
        : {}),
    },
    orderBy: [
      { businessDate: 'desc' },
      { capturedAt: 'desc' },
      { id: 'desc' },
    ],
    take: input.limit,
  });
  return withPublications(facts, publications);
}

export async function readLatestCurrentMarketShadowFact(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<MarketShadowFactWithPublication | null> {
  const [fact] = await readCurrentMarketShadowFacts(tx, { organizationId, limit: 1 });
  return fact ?? null;
}

export function readRecentCurrentMarketShadowFacts(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    fromBusinessDate: Date;
    toBusinessDate: Date;
    limit: number;
  },
): Promise<MarketShadowFactWithPublication[]> {
  return readCurrentMarketShadowFacts(tx, input);
}
