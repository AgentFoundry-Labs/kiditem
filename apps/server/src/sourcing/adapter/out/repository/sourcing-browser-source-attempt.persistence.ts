import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { sourcingWingCatalogKeywordIdentity } from '@kiditem/shared/sourcing';
import { sourcingCandidateIdentityLockKey } from '../../../domain/sourcing-candidate-identity';
import type {
  AuthorizedCollectionOutput,
  Sourcing1688OfferKeywordObservationUpsert,
  SourcingCollectionPermit,
  SourcingExtensionCandidateProjection,
} from '../../../application/port/out/repository/sourcing-collection.repository.port';
import type { TiktokCcSnapshotUpsert } from '../../../application/port/out/repository/trend-collection.repository.port';
import type {
  LiveCommerceBroadcastSnapshotUpsert,
  LiveCommerceProductSnapshotUpsert,
} from '../../../application/port/out/repository/live-commerce.repository.port';
import type { AppendSourcingEvidenceObservationCommand } from '../../../application/port/out/repository/sourcing-evidence-ledger.repository.port';

type Transaction = Prisma.TransactionClient;

type PreparedObservation = {
  identity: string;
  observation: AppendSourcingEvidenceObservationCommand;
  envelopeHash: string;
};

type PersistedObservation = {
  id: string;
  organizationId: string;
  observationKey: string;
  revision: number;
  envelopeHash: string;
};

/**
 * Canonical one-shot fact persistence for a browser source-attempt terminal
 * transaction. The caller already owns the source-scope xact lock, so this
 * uses bounded fact-set reads and inserts rather than per-row locks.
 */
export async function persistBrowserSourceAttemptFacts(
  tx: Transaction,
  permit: SourcingCollectionPermit,
  output: AuthorizedCollectionOutput,
  now: Date,
): Promise<{ duplicateCount: number; staleDiscardedCount: number }> {
  const prepared = prepareObservations(permit, output.observations);
  if (prepared.rows.length === 0) {
    if (output.typedRecords.length > 0) {
      throw new Error('Typed source facts require an immutable evidence observation.');
    }
    return { duplicateCount: prepared.duplicateCount, staleDiscardedCount: 0 };
  }

  const existing = await findObservations(tx, permit.organizationId, prepared.rows);
  assertMatchingEnvelopes(prepared.byIdentity, existing);
  const existingIdentities = new Set(existing.map(observationIdentity));
  const missing = prepared.rows.filter(({ identity }) => !existingIdentities.has(identity));
  let duplicateCount = prepared.duplicateCount + existing.length;

  if (missing.length > 0) {
    const created = await tx.sourcingEvidenceObservation.createMany({
      data: missing.map(({ observation, envelopeHash }) => toObservationCreateInput(
        observation,
        envelopeHash,
        now,
      )),
      skipDuplicates: true,
    });
    duplicateCount += missing.length - created.count;
  }

  const evidence = await findObservations(tx, permit.organizationId, prepared.rows);
  assertResolvedEvidence(prepared.byIdentity, evidence);
  const evidenceByIdentity = new Map(evidence.map((row) => [observationIdentity(row), row]));
  const productRecords = output.typedRecords.filter((record) => record.kind === 'extension_candidate');
  for (const { row } of productRecords) {
    const source = row.sourcePlatform === 'ALIBABA_1688' ? '1688.product_extension' : 'alibaba.product_extension';
    if (row.organizationId !== permit.organizationId || source !== permit.sourceKey) {
      throw new Error('Product candidate does not match its authorized source attempt.');
    }
    if (await persistExtensionCandidateProjection(tx, row) === 'duplicate') duplicateCount += 1;
  }
  const typedRecords = toTypedCreateInputs(output.typedRecords.filter((record) => record.kind !== 'extension_candidate'), permit, evidenceByIdentity);

  if (typedRecords.offer1688.length > 0) {
    const created = await tx.sourcing1688OfferKeywordObservation.createMany({
      data: typedRecords.offer1688,
      skipDuplicates: true,
    });
    duplicateCount += typedRecords.offer1688.length - created.count;
  }
  if (typedRecords.liveCommerceBroadcast.length > 0) {
    const created = await tx.liveCommerceBroadcastDailySnapshot.createMany({
      data: typedRecords.liveCommerceBroadcast,
      skipDuplicates: true,
    });
    duplicateCount += typedRecords.liveCommerceBroadcast.length - created.count;
  }
  if (typedRecords.liveCommerceProduct.length > 0) {
    const created = await tx.liveCommerceProductDailySnapshot.createMany({
      data: typedRecords.liveCommerceProduct,
      skipDuplicates: true,
    });
    duplicateCount += typedRecords.liveCommerceProduct.length - created.count;
  }
  if (typedRecords.tiktokCreative.length > 0) {
    const created = await tx.tiktokCreativeTrendDailySnapshot.createMany({
      data: typedRecords.tiktokCreative,
      skipDuplicates: true,
    });
    duplicateCount += typedRecords.tiktokCreative.length - created.count;
  }
  if (typedRecords.naverKeyword.length > 0) {
    const created = await tx.naverKeywordDailySnapshot.createMany({ data: typedRecords.naverKeyword, skipDuplicates: true });
    duplicateCount += typedRecords.naverKeyword.length - created.count;
  }
  if (typedRecords.naverPopular.length > 0) {
    const created = await tx.naverPopularKeywordDailySnapshot.createMany({ data: typedRecords.naverPopular, skipDuplicates: true });
    duplicateCount += typedRecords.naverPopular.length - created.count;
  }
  if (typedRecords.shorts.length > 0) {
    const created = await tx.shortsTrendDailySnapshot.createMany({ data: typedRecords.shorts, skipDuplicates: true });
    duplicateCount += typedRecords.shorts.length - created.count;
  }
  if (typedRecords.wingCatalog.length > 0) {
    const created = await tx.sourcingWingCatalogProductFact.createMany({
      data: typedRecords.wingCatalog,
      skipDuplicates: true,
    });
    duplicateCount += typedRecords.wingCatalog.length - created.count;
  }
  if (typedRecords.keywordSuggestion.length > 0) {
    const created = await tx.sourcingKeywordSuggestionFact.createMany({
      data: typedRecords.keywordSuggestion,
      skipDuplicates: true,
    });
    duplicateCount += typedRecords.keywordSuggestion.length - created.count;
  }
  if (typedRecords.naverKeywordAnalysis.length > 0) {
    const created = await tx.sourcingNaverKeywordAnalysisFact.createMany({
      data: typedRecords.naverKeywordAnalysis,
      skipDuplicates: true,
    });
    duplicateCount += typedRecords.naverKeywordAnalysis.length - created.count;
  }
  if (typedRecords.marketShadow.length > 0) {
    const created = await tx.sourcingMarketShadowFact.createMany({
      data: typedRecords.marketShadow,
      skipDuplicates: true,
    });
    duplicateCount += typedRecords.marketShadow.length - created.count;
  }
  return { duplicateCount, staleDiscardedCount: 0 };
}

// Retained product-extension projection policy, committed with the owner facts.
async function persistExtensionCandidateProjection(
  tx: Transaction,
  row: SourcingExtensionCandidateProjection,
): Promise<'accepted' | 'duplicate'> {
  // sourcingCandidateIdentityLockKey composes row.organizationId into the key.
  const lockKey = sourcingCandidateIdentityLockKey(row);
  await tx.$queryRaw`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock keyed by organizationId; reads no tenant data.
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
  `;
  if (row.pageType === 'description') {
    const existing = await tx.sourcingCandidate.findFirst({
      where: { organizationId: row.organizationId, sourceUrl: row.sourceUrl, isDeleted: false, status: 'sourced' },
      select: { id: true, rawData: true, description: true, thumbnailUrl: true, imageUrl: true },
    });
    if (!existing) return 'duplicate';
    await tx.sourcingCandidate.update({ where: { id: existing.id }, data: {
      rawData: mergeProjectionJson(existing.rawData, row.rawData) as Prisma.InputJsonValue,
      description: row.description ?? existing.description,
      thumbnailUrl: existing.thumbnailUrl ?? row.thumbnailUrl,
      imageUrl: existing.imageUrl ?? row.imageUrl,
    } });
    await ensureProjectedCandidateImages(tx, existing.id, row);
    return 'accepted';
  }
  const existing = await tx.sourcingCandidate.findFirst({
    where: { organizationId: row.organizationId, sourcePlatform: row.sourcePlatform,
      sourceIdentityHash: row.sourceIdentityHash, isDeleted: false, status: 'sourced' },
    select: { id: true, rawData: true },
  });
  const data = {
    sourcePlatform: row.sourcePlatform, externalOfferId: row.externalOfferId,
    variantKeyNormalized: row.variantKeyNormalized, sourceIdentityHash: row.sourceIdentityHash,
    rawData: mergeProjectionJson(existing?.rawData, row.rawData) as Prisma.InputJsonValue,
    name: row.name ?? row.externalOfferId, description: row.description ?? '', category: row.category,
    tags: row.tags as Prisma.InputJsonValue, thumbnailUrl: row.thumbnailUrl, imageUrl: row.imageUrl,
    costCny: row.costCny ?? undefined,
  };
  const candidate = existing
    ? await tx.sourcingCandidate.update({ where: { id: existing.id }, data })
    : await tx.sourcingCandidate.create({ data: { organizationId: row.organizationId,
      sourceUrl: row.sourceUrl, triggeredByUserId: row.triggeredByUserId, status: 'sourced', ...data } });
  await ensureProjectedCandidateImages(tx, candidate.id, row);
  return 'accepted';
}

async function ensureProjectedCandidateImages(tx: Transaction, candidateId: string, row: SourcingExtensionCandidateProjection): Promise<void> {
  if (row.images.length === 0) return;
  const existing = await tx.candidateImage.count({ where: { candidateId, organizationId: row.organizationId, isDeleted: false } });
  if (existing > 0) return;
  await tx.candidateImage.createMany({ data: row.images.map((image) => ({
    organizationId: row.organizationId, candidateId, url: image.url, role: image.role, label: image.label,
    sortOrder: image.sortOrder, source: image.source, isPrimary: image.isPrimary,
  })) });
}

function mergeProjectionJson(previous: unknown, incoming: Record<string, unknown>): Record<string, unknown> {
  const base = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous as Record<string, unknown> : {};
  return { ...base, ...incoming };
}

function prepareObservations(
  permit: SourcingCollectionPermit,
  observations: AppendSourcingEvidenceObservationCommand[],
): { rows: PreparedObservation[]; byIdentity: Map<string, PreparedObservation>; duplicateCount: number } {
  const byIdentity = new Map<string, PreparedObservation>();
  let duplicateCount = 0;
  for (const observation of observations) {
    assertObservationMatchesPermit(observation, permit);
    const prepared: PreparedObservation = {
      identity: observationIdentity(observation),
      observation,
      envelopeHash: observationEnvelopeHash(observation),
    };
    const previous = byIdentity.get(prepared.identity);
    if (previous) {
      if (previous.envelopeHash !== prepared.envelopeHash) {
        throw new Error(`Collection observation ${observation.observationKey} conflicts with immutable provenance.`);
      }
      duplicateCount += 1;
      continue;
    }
    byIdentity.set(prepared.identity, prepared);
  }
  return { rows: [...byIdentity.values()], byIdentity, duplicateCount };
}

function assertObservationMatchesPermit(
  observation: AppendSourcingEvidenceObservationCommand,
  permit: SourcingCollectionPermit,
): void {
  if (
    observation.organizationId !== permit.organizationId
    || observation.ingestionRunId !== permit.runId
    || observation.sourceKey !== permit.sourceKey
  ) {
    throw new Error('Collection observation does not match its authorized permit.');
  }
}

async function findObservations(
  tx: Transaction,
  organizationId: string,
  rows: readonly PreparedObservation[],
): Promise<PersistedObservation[]> {
  return tx.sourcingEvidenceObservation.findMany({
    where: {
      organizationId,
      OR: rows.map(({ observation }) => ({
        observationKey: observation.observationKey,
        revision: observation.revision,
      })),
    },
    select: {
      id: true,
      organizationId: true,
      observationKey: true,
      revision: true,
      envelopeHash: true,
    },
  });
}

function assertMatchingEnvelopes(
  prepared: ReadonlyMap<string, PreparedObservation>,
  rows: readonly PersistedObservation[],
): void {
  for (const row of rows) {
    const expected = prepared.get(observationIdentity(row));
    if (!expected || row.envelopeHash !== expected.envelopeHash) {
      throw new Error(`Collection observation ${row.observationKey} conflicts with immutable provenance.`);
    }
  }
}

function assertResolvedEvidence(
  prepared: ReadonlyMap<string, PreparedObservation>,
  rows: readonly PersistedObservation[],
): void {
  assertMatchingEnvelopes(prepared, rows);
  if (rows.length !== prepared.size) {
    throw new Error('A source fact insert did not produce every immutable evidence observation.');
  }
}

function toObservationCreateInput(
  observation: AppendSourcingEvidenceObservationCommand,
  envelopeHash: string,
  now: Date,
): Prisma.SourcingEvidenceObservationCreateManyInput {
  return {
    organizationId: observation.organizationId,
    ingestionRunId: observation.ingestionRunId,
    sourceKey: observation.sourceKey,
    platform: observation.platform,
    evidenceFamily: observation.evidenceFamily,
    signalRole: observation.signalRole,
    conceptKey: observation.conceptKey,
    supportsCandidate: observation.supportsCandidate,
    observationKey: observation.observationKey,
    revision: observation.revision,
    sourceEntityType: observation.sourceEntityType,
    sourceEntityKey: observation.sourceEntityId,
    observationType: observation.evidenceFamily,
    schemaVersion: observation.schemaVersion,
    evidenceClass: observation.granularity,
    eventAt: observation.eventAt,
    observedAt: observation.observedAt,
    availableAt: observation.availableAt,
    revisionAt: observation.revisionAt,
    businessDate: observation.eventAt,
    sourceUrl: observation.sourceUrl,
    payloadHash: observation.payloadHash,
    envelopeHash,
    payload: toInputJson(observation.rawPayload),
    ingestedAt: now,
  };
}

function toTypedCreateInputs(
  records: AuthorizedCollectionOutput['typedRecords'],
  permit: SourcingCollectionPermit,
  evidenceByIdentity: ReadonlyMap<string, PersistedObservation>,
): {
  naverKeyword: Prisma.NaverKeywordDailySnapshotCreateManyInput[];
  naverPopular: Prisma.NaverPopularKeywordDailySnapshotCreateManyInput[];
  shorts: Prisma.ShortsTrendDailySnapshotCreateManyInput[];
  offer1688: Prisma.Sourcing1688OfferKeywordObservationCreateManyInput[];
  liveCommerceBroadcast: Prisma.LiveCommerceBroadcastDailySnapshotCreateManyInput[];
  liveCommerceProduct: Prisma.LiveCommerceProductDailySnapshotCreateManyInput[];
  tiktokCreative: Prisma.TiktokCreativeTrendDailySnapshotCreateManyInput[];
  wingCatalog: Prisma.SourcingWingCatalogProductFactCreateManyInput[];
  keywordSuggestion: Prisma.SourcingKeywordSuggestionFactCreateManyInput[];
  naverKeywordAnalysis: Prisma.SourcingNaverKeywordAnalysisFactCreateManyInput[];
  marketShadow: Prisma.SourcingMarketShadowFactCreateManyInput[];
} {
  const naverKeyword: Prisma.NaverKeywordDailySnapshotCreateManyInput[] = [];
  const naverPopular: Prisma.NaverPopularKeywordDailySnapshotCreateManyInput[] = [];
  const shorts: Prisma.ShortsTrendDailySnapshotCreateManyInput[] = [];
  const offer1688: Prisma.Sourcing1688OfferKeywordObservationCreateManyInput[] = [];
  const liveCommerceBroadcast: Prisma.LiveCommerceBroadcastDailySnapshotCreateManyInput[] = [];
  const liveCommerceProduct: Prisma.LiveCommerceProductDailySnapshotCreateManyInput[] = [];
  const tiktokCreative: Prisma.TiktokCreativeTrendDailySnapshotCreateManyInput[] = [];
  const wingCatalog: Prisma.SourcingWingCatalogProductFactCreateManyInput[] = [];
  const keywordSuggestion: Prisma.SourcingKeywordSuggestionFactCreateManyInput[] = [];
  const naverKeywordAnalysis: Prisma.SourcingNaverKeywordAnalysisFactCreateManyInput[] = [];
  const marketShadow: Prisma.SourcingMarketShadowFactCreateManyInput[] = [];
  for (const record of records) {
    if (record.kind === 'naver_keyword' || record.kind === 'naver_popular_keyword' || record.kind === 'shorts') {
      const allowed = record.kind === 'shorts' ? ['shortstrend.trend']
        : ['naver.trend'];
      if (record.row.organizationId !== permit.organizationId || !allowed.includes(permit.sourceKey)) {
        throw new Error('Trend snapshot does not match its authorized source attempt.');
      }
      if (record.kind === 'naver_keyword') naverKeyword.push({ ...record.row, ingestionRunId: permit.runId });
      if (record.kind === 'naver_popular_keyword') naverPopular.push({ ...record.row, ingestionRunId: permit.runId });
      if (record.kind === 'shorts') shorts.push({ ...record.row, ingestionRunId: permit.runId });
      continue;
    }
    if (record.kind === 'offer_1688_keyword_observation') {
      offer1688.push(to1688CreateInput(record.row, permit, evidenceByIdentity));
      continue;
    }
    if (record.kind === 'live_commerce_broadcast') {
      liveCommerceBroadcast.push(toLiveCommerceBroadcastCreateInput(record.row, permit));
      continue;
    }
    if (record.kind === 'live_commerce_product') {
      liveCommerceProduct.push(toLiveCommerceProductCreateInput(record.row, permit));
      continue;
    }
    if (record.kind === 'tiktok_creative') {
      tiktokCreative.push(toTiktokCreativeCreateInput(record.row, permit));
      continue;
    }
    if (record.kind === 'wing_catalog_product') {
      if (permit.sourceKey !== 'coupang.wing_catalog') {
        throw new Error('Wing catalog fact does not match its authorized source attempt.');
      }
      const evidence = resolveFactEvidence(record.row, permit, evidenceByIdentity);
      wingCatalog.push({
        organizationId: record.row.organizationId,
        ingestionRunId: record.row.ingestionRunId,
        evidenceObservationId: evidence.id,
        schemaVersion: 'coupang-wing-catalog/v2',
        sourceKeywordNormalized: sourcingWingCatalogKeywordIdentity(record.row.sourceKeyword),
        sourceKeyword: record.row.sourceKeyword,
        productId: record.row.productId,
        itemId: record.row.itemId,
        vendorItemId: record.row.vendorItemId,
        productName: record.row.productName,
        itemName: record.row.itemName,
        brandName: record.row.brandName,
        manufacture: record.row.manufacture,
        categoryHierarchy: record.row.categoryHierarchy,
        imagePath: record.row.imagePath,
        salePriceKrw: record.row.salePriceKrw,
        ratingAverage: record.row.ratingAverage,
        ratingCount: record.row.ratingCount,
        viewsLast28d: record.row.viewsLast28d,
        salesLast28d: record.row.salesLast28d,
        estimatedRevenue28d: record.row.estimatedRevenue28d,
        conversionRate28d: record.row.conversionRate28d,
        deliveryInfo: record.row.deliveryInfo,
        capturedAt: new Date(record.row.capturedAt),
      });
      continue;
    }
    if (record.kind === 'keyword_suggestion_snapshot') {
      if (permit.sourceKey !== 'coupang.keyword_suggestion') {
        throw new Error('Keyword suggestion fact does not match its authorized source attempt.');
      }
      const evidence = resolveFactEvidence(record.row, permit, evidenceByIdentity);
      keywordSuggestion.push({
        organizationId: record.row.organizationId,
        ingestionRunId: record.row.ingestionRunId,
        evidenceObservationId: evidence.id,
        schemaVersion: record.row.schemaVersion,
        keywordNormalized: record.row.keywordNormalized,
        document: toInputJson(record.row.document),
        capturedAt: record.row.capturedAt,
      });
      continue;
    }
    if (record.kind === 'naver_keyword_analysis_snapshot') {
      if (permit.sourceKey !== 'naver.keyword_analysis') {
        throw new Error('Naver keyword analysis fact does not match its authorized source attempt.');
      }
      const evidence = resolveFactEvidence(record.row, permit, evidenceByIdentity);
      naverKeywordAnalysis.push({
        organizationId: record.row.organizationId,
        ingestionRunId: record.row.ingestionRunId,
        evidenceObservationId: evidence.id,
        schemaVersion: record.row.schemaVersion,
        inputHash: record.row.inputHash,
        document: toInputJson(record.row.document),
        capturedAt: record.row.capturedAt,
      });
      continue;
    }
    if (record.kind === 'market_shadow_snapshot') {
      if (permit.sourceKey !== 'market_shadow_signals') {
        throw new Error('Market shadow fact does not match its authorized source attempt.');
      }
      const evidence = resolveFactEvidence(record.row, permit, evidenceByIdentity);
      marketShadow.push({
        organizationId: record.row.organizationId,
        ingestionRunId: record.row.ingestionRunId,
        evidenceObservationId: evidence.id,
        schemaVersion: record.row.schemaVersion,
        businessDate: record.row.businessDate,
        document: toInputJson(record.row.document),
        capturedAt: record.row.capturedAt,
      });
      continue;
    }
    throw new Error(`Unsupported browser source record kind: ${record.kind}`);
  }
  return {
    offer1688,
    liveCommerceBroadcast,
    liveCommerceProduct,
    tiktokCreative,
    naverKeyword,
    naverPopular,
    shorts,
    wingCatalog,
    keywordSuggestion,
    naverKeywordAnalysis,
    marketShadow,
  };
}

function resolveFactEvidence(
  row: {
    organizationId: string;
    ingestionRunId: string;
    evidenceObservationKey: string;
    evidenceRevision: number;
  },
  permit: SourcingCollectionPermit,
  evidenceByIdentity: ReadonlyMap<string, PersistedObservation>,
): PersistedObservation {
  if (row.organizationId !== permit.organizationId || row.ingestionRunId !== permit.runId) {
    throw new Error('Typed source fact does not match its authorized permit.');
  }
  const evidence = evidenceByIdentity.get(observationIdentity({
    organizationId: row.organizationId,
    observationKey: row.evidenceObservationKey,
    revision: row.evidenceRevision,
  }));
  if (!evidence) throw new Error('Typed source fact is missing its immutable evidence row.');
  return evidence;
}

function toTiktokCreativeCreateInput(
  row: TiktokCcSnapshotUpsert,
  permit: SourcingCollectionPermit,
): Prisma.TiktokCreativeTrendDailySnapshotCreateManyInput {
  if (
    row.organizationId !== permit.organizationId
    || row.ingestionRunId !== permit.runId
    || permit.sourceKey !== 'tiktok.creative'
  ) {
    throw new Error('TikTok snapshot does not match its authorized source attempt.');
  }
  return row;
}

function to1688CreateInput(
  row: Sourcing1688OfferKeywordObservationUpsert,
  permit: SourcingCollectionPermit,
  evidenceByIdentity: ReadonlyMap<string, PersistedObservation>,
): Prisma.Sourcing1688OfferKeywordObservationCreateManyInput {
  if (row.organizationId !== permit.organizationId || row.ingestionRunId !== permit.runId) {
    throw new Error('1688 offer observation does not match its authorized permit.');
  }
  const evidence = evidenceByIdentity.get(observationIdentity({
    organizationId: row.organizationId,
    observationKey: row.evidenceObservationKey,
    revision: row.evidenceRevision,
  }));
  if (!evidence) throw new Error('1688 offer observation is missing its immutable evidence row.');
  return {
    organizationId: row.organizationId,
    evidenceObservationId: evidence.id,
    ingestionRunId: row.ingestionRunId,
    businessDate: row.businessDate,
    sourceKeywordNormalized: row.sourceKeyword,
    externalOfferId: row.offerId,
    variantKeyNormalized: '',
    sourceUrl: row.sourceUrl,
    title: row.title,
    supplierName: row.supplierName,
    imageUrl: row.imageUrl,
    rank: row.rank,
    priceCny: row.priceCny,
    monthlySales: row.monthlySales,
    rawOffer: toInputJson({
      offerId: row.offerId,
      sourceKeyword: row.sourceKeyword,
      rank: row.rank,
      title: row.title,
      priceCny: row.priceCny,
      monthlySales: row.monthlySales,
      repurchaseRate: row.repurchaseRate,
      tradeScore: row.tradeScore,
      supplierName: row.supplierName,
      imageUrl: row.imageUrl,
      sourceUrl: row.sourceUrl,
      ...(row.searchMetadata ? row.searchMetadata : {}),
    }),
    capturedAt: row.capturedAt,
  };
}

function toLiveCommerceBroadcastCreateInput(
  row: LiveCommerceBroadcastSnapshotUpsert,
  permit: SourcingCollectionPermit,
): Prisma.LiveCommerceBroadcastDailySnapshotCreateManyInput {
  assertLiveCommerceMatchesPermit(row, permit);
  return row;
}

function toLiveCommerceProductCreateInput(
  row: LiveCommerceProductSnapshotUpsert,
  permit: SourcingCollectionPermit,
): Prisma.LiveCommerceProductDailySnapshotCreateManyInput {
  assertLiveCommerceMatchesPermit(row, permit);
  return row;
}

function assertLiveCommerceMatchesPermit(
  row: LiveCommerceBroadcastSnapshotUpsert | LiveCommerceProductSnapshotUpsert,
  permit: SourcingCollectionPermit,
): void {
  if (row.organizationId !== permit.organizationId || row.ingestionRunId !== permit.runId) {
    throw new Error('Live-commerce snapshot does not match its authorized permit.');
  }
  const expectedSourceKey = row.source === 'taobao'
    ? 'taobao.live'
    : `${row.source}.live_commerce`;
  if (permit.sourceKey !== expectedSourceKey) {
    throw new Error('Live-commerce snapshot source does not match its authorized permit.');
  }
}

function observationIdentity(input: {
  organizationId: string;
  observationKey: string;
  revision: number;
}): string {
  return `${input.organizationId}\u001f${input.observationKey}\u001f${input.revision}`;
}

function observationEnvelopeHash(observation: AppendSourcingEvidenceObservationCommand): string {
  return hashCanonicalJson({
    sourceKey: observation.sourceKey,
    sourceEntityType: observation.sourceEntityType,
    sourceEntityId: observation.sourceEntityId,
    platform: observation.platform,
    evidenceFamily: observation.evidenceFamily,
    signalRole: observation.signalRole,
    granularity: observation.granularity,
    conceptKey: observation.conceptKey,
    supportsCandidate: observation.supportsCandidate,
    sourceUrl: observation.sourceUrl,
    eventAt: observation.eventAt,
    observedAt: observation.observedAt,
    availableAt: observation.availableAt,
    revisionAt: observation.revisionAt,
    payloadHash: observation.payloadHash,
  });
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  const serialized = toNestedInputJson(value);
  if (serialized === null) throw new TypeError('Canonical source JSON cannot be null.');
  return serialized;
}

function toNestedInputJson(value: unknown): Prisma.InputJsonValue | null {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => toNestedInputJson(item));
  if (value && typeof value === 'object') {
    const result: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, item] of Object.entries(value)) result[key] = toNestedInputJson(item);
    return result;
  }
  throw new TypeError('Canonical source JSON must be serializable.');
}

function hashCanonicalJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
