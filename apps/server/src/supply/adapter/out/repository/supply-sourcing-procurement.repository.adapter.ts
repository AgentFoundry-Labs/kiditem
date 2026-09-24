import { Injectable } from '@nestjs/common';
import { KiditemError } from '@kiditem/shared/errors';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  readCompleteObservationProvenanceByIds,
  readCurrentObservationHeads,
  readCurrentSupportingObservation,
  type CurrentObservationHead,
} from '../../../../sourcing/adapter/out/repository/source-evidence.reader';
import { readExactDecisionBatchItem } from '../../../../sourcing/adapter/out/repository/decision-publication.reader';
import { readExactLaunchCandidatesByIds } from '../../../../sourcing/adapter/out/repository/launch-candidate.reader';
import {
  buildProcurementTestIntentRequestHash,
  evaluateSupplySourceEligibility,
  PROCUREMENT_TEST_INTENT_STATUS,
  resolveProcurementQuantityConservation,
  supplierOfferEvidencePayloadMatches,
  type SupplySourceIngestionRunPolicyRecord,
  type SupplySourceUsage,
  type ProcurementTestIntentStatus,
  type ProcurementTestIntentType,
  type SupplierOfferIdentityStatus,
} from '../../../domain/policy/sourcing-procurement';
import type {
  ProcurementTestIntentView,
  SupplierOfferSnapshotView,
} from '../../../application/port/in/procurement/supply-sourcing-procurement.port';
import type {
  CreateProcurementTestIntentRecord,
  CreateSupplierOfferSnapshotRecord,
  SupplySourcingProcurementRepositoryPort,
} from '../../../application/port/out/repository/supply-sourcing-procurement.repository.port';

const OFFER_INCLUDE = {
  priceTiers: {
    orderBy: [{ minQuantity: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.SupplierOfferSkuSnapshotInclude;

type OfferRow = Prisma.SupplierOfferSkuSnapshotGetPayload<{
  include: typeof OFFER_INCLUDE;
}>;

@Injectable()
export class SupplySourcingProcurementRepositoryAdapter implements SupplySourcingProcurementRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async createOfferSnapshot(
    organizationId: string,
    record: CreateSupplierOfferSnapshotRecord,
  ) {
    try {
      return await this.prisma.$transaction((tx) =>
        this.createOfferSnapshotInTransaction(tx, organizationId, record),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const winner = await this.findOfferByHash(
        organizationId,
        record.snapshotHash,
      );
      if (!winner) throw error;
      return { kind: 'duplicate' as const, snapshot: winner };
    }
  }

  private async createOfferSnapshotInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    record: CreateSupplierOfferSnapshotRecord,
  ) {
    const duplicate = await this.findOfferByHash(
      organizationId,
      record.snapshotHash,
      tx,
    );
    if (duplicate)
      return { kind: 'duplicate' as const, snapshot: duplicate };

    const evidenceRows: CurrentObservationHead[] =
      await readCompleteObservationProvenanceByIds(tx, {
        organizationId,
        observationIds: [record.evidenceObservationId],
      });
    const evidence = evidenceRows.find(
      (row) => row.id === record.evidenceObservationId,
    );
    if (!evidence) return { kind: 'evidence_observation_not_found' as const };
    const cutoffAt = await databaseClock(tx);
    const [currentEvidence] = await readCurrentObservationHeads(tx, {
      organizationId,
      sourceKey: evidence.sourceKey,
      targetKey: evidence.ingestionRun.targetKey,
      observationKeys: [evidence.observationKey],
      supportsCandidate: true,
      signalRoles: ['demand', 'supply'],
      cutoffAt,
      eventAtTo: cutoffAt,
      limit: 1,
    });
    if (!currentEvidence) {
      return { kind: 'evidence_observation_not_terminal' as const };
    }
    if (currentEvidence.id !== evidence.id) {
      return { kind: 'evidence_observation_not_latest' as const };
    }
    const sourceGate = this.evaluateCurrentSourceGate(
      currentEvidence.ingestionRun,
      'retain',
      cutoffAt,
    );
    if (sourceGate) return { kind: sourceGate };

    if (record.supplierId) {
      const supplier = await tx.supplier.findFirst({
        where: { id: record.supplierId, organizationId },
        select: { id: true },
      });
      if (!supplier) return { kind: 'supplier_not_found' as const };
    }
    const exactIdentityMatches =
      record.identityStatus === 'exact_variant' &&
      evidence.sourceEntityType === 'supplier_offer_sku' &&
      evidence.sourceEntityKey === record.externalSkuId;
    const offerIdentityMatches =
      record.identityStatus === 'offer_only' &&
      ['offer', 'supplier_offer'].includes(evidence.sourceEntityType) &&
      evidence.sourceEntityKey === record.externalOfferId;
    if (
      evidence.platform.trim().toLowerCase() !== record.sourcePlatform ||
      evidence.signalRole !== 'supply' ||
      (!exactIdentityMatches && !offerIdentityMatches) ||
      evidence.observedAt.getTime() !== record.capturedAt.getTime() ||
      (evidence.sourceUrl ?? null) !== record.sourceUrl
    ) {
      return { kind: 'evidence_observation_mismatch' as const };
    }
    if (!supplierOfferEvidencePayloadMatches(record, evidence.payload)) {
      return { kind: 'evidence_payload_mismatch' as const };
    }
    const row = await tx.supplierOfferSkuSnapshot.create({
      data: {
        organizationId,
        evidenceObservationId: record.evidenceObservationId,
        supplierId: record.supplierId,
        supplierName: record.supplierName,
        identityStatus: record.identityStatus,
        sourcePlatform: record.sourcePlatform,
        sourceUrl: record.sourceUrl,
        externalSupplierKey: record.externalSupplierKey,
        externalOfferId: record.externalOfferId,
        externalSkuId: record.externalSkuId,
        variantKey: record.variantKey,
        productName: record.productName,
        variantName: record.variantName,
        currency: record.currency,
        orderUnit: record.orderUnit,
        unitsPerOrderUnit: record.unitsPerOrderUnit,
        minOrderQuantity: record.minOrderQuantity,
        sampleAvailable: record.sampleAvailable,
        samplePriceCny: record.samplePriceCny,
        domesticFreightCny: record.domesticFreightCny,
        productionLeadTimeDaysMin: record.productionLeadTimeDaysMin,
        productionLeadTimeDaysMax: record.productionLeadTimeDaysMax,
        dispatchLeadTimeDaysMin: record.dispatchLeadTimeDaysMin,
        dispatchLeadTimeDaysMax: record.dispatchLeadTimeDaysMax,
        grossWeightGrams: record.grossWeightGrams,
        lengthMm: record.lengthMm,
        widthMm: record.widthMm,
        heightMm: record.heightMm,
        material: record.material,
        packCount: record.packCount,
        capturedAt: record.capturedAt,
        validUntil: record.validUntil,
        snapshotHash: record.snapshotHash,
        priceTiers: {
          create: record.priceTiers.map((tier) => ({
            minQuantity: tier.minQuantity,
            maxQuantity: tier.maxQuantity,
            unitPriceCny: tier.unitPriceCny,
          })),
        },
      },
      include: OFFER_INCLUDE,
    });
    return { kind: 'created' as const, snapshot: mapOffer(row) };
  }

  async findOfferSnapshot(
    organizationId: string,
    id: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const row = await db.supplierOfferSkuSnapshot.findFirst({
      where: { id, organizationId },
      include: OFFER_INCLUDE,
    });
    return row ? mapOffer(row) : null;
  }

  async findOfferSnapshotsByExternalOffer(input: {
    organizationId: string;
    sourcePlatform: string;
    externalOfferIds: string[];
  }) {
    if (input.externalOfferIds.length === 0) return [];
    const rows = await this.prisma.supplierOfferSkuSnapshot.findMany({
      where: {
        organizationId: input.organizationId,
        sourcePlatform: input.sourcePlatform,
        externalOfferId: { in: Array.from(new Set(input.externalOfferIds)) },
      },
      include: OFFER_INCLUDE,
      // 같은 오퍼에 스냅샷이 여럿이면 최신 캡처가 앞에 오게 둔다.
      orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(mapOffer);
  }

  async listOfferSnapshots(input: {
    organizationId: string;
    page: number;
    limit: number;
    identityStatus?: SupplierOfferIdentityStatus;
    sourcePlatform?: string;
  }) {
    const where = {
      organizationId: input.organizationId,
      ...(input.identityStatus && { identityStatus: input.identityStatus }),
      ...(input.sourcePlatform && { sourcePlatform: input.sourcePlatform }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.supplierOfferSkuSnapshot.findMany({
        where,
        include: OFFER_INCLUDE,
        orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      this.prisma.supplierOfferSkuSnapshot.count({ where }),
    ]);
    return {
      items: rows.map(mapOffer),
      total,
      page: input.page,
      limit: input.limit,
    };
  }

  async findProcurementDecisionContext(
    organizationId: string,
    decisionBatchItemId: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const row = await readExactDecisionBatchItem(db, {
      id: decisionBatchItemId,
      organizationId,
    });
    if (!row) return null;
    const launchCandidates = row.launchCandidateId
      ? await readExactLaunchCandidatesByIds(db, {
          organizationId,
          ids: [row.launchCandidateId],
        })
      : [];
    const launchCandidate = launchCandidates.find(
      (candidate) => candidate.id === row.launchCandidateId,
    );
    return {
      decisionBatchItemId: row.id,
      supplierOfferSkuSnapshotId: row.supplierOfferSkuSnapshotId,
      launchCandidateId: row.launchCandidateId,
      launchCandidate: launchCandidate
        ? {
            id: launchCandidate.id,
            supplierOfferSkuSnapshotId:
              launchCandidate.supplierOfferSkuSnapshotId,
            initialOrderQuantity: launchCandidate.initialOrderQuantity,
            unitsPerSellableBundle: launchCandidate.unitsPerSellableBundle,
          }
        : null,
      decision: row.decision,
      executionEligible: row.executionEligible,
      decisionBatchStatus: row.decisionBatch.status,
      decisionBatchExpiresAt: row.decisionBatch.expiresAt,
    };
  }

  async createTestIntent(
    organizationId: string,
    record: CreateProcurementTestIntentRecord,
  ) {
    try {
      return await this.prisma.$transaction((tx) =>
        this.createTestIntentInTransaction(tx, organizationId, record),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const winner = await this.findIntentByKey(
        organizationId,
        record.idempotencyKey,
      );
      if (!winner) throw error;
      return duplicateResult(
        winner,
        record.requestHash,
        record.requestedByUserId,
      );
    }
  }

  private async createTestIntentInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    record: CreateProcurementTestIntentRecord,
  ) {
    const duplicate = await this.findIntentByKey(
      organizationId,
      record.idempotencyKey,
      tx,
    );
    if (duplicate) {
      return duplicateResult(
        duplicate,
        record.requestHash,
        record.requestedByUserId,
      );
    }

    const snapshot = await this.findOfferSnapshot(
      organizationId,
      record.supplierOfferSkuSnapshotId,
      tx,
    );
    if (!snapshot) {
      return { kind: 'evidence_observation_not_found' as const };
    }
    const sourceRows: CurrentObservationHead[] =
      await readCompleteObservationProvenanceByIds(tx, {
        organizationId,
        observationIds: [snapshot.evidenceObservationId],
      });
    const sourceContext = sourceRows.find(
      (row) => row.id === snapshot.evidenceObservationId,
    );
    if (!sourceContext) {
      return { kind: 'evidence_observation_not_found' as const };
    }
    const now = await databaseClock(tx);
    const currentSourceContext = await readCurrentSupportingObservation(tx, {
      organizationId,
      observationId: sourceContext.id,
      observationKey: sourceContext.observationKey,
      sourceKey: sourceContext.sourceKey,
      scopeKey: sourceContext.ingestionRun.targetKey,
      cutoffAt: now,
    });
    if (!currentSourceContext) {
      return { kind: 'evidence_observation_not_terminal' as const };
    }
    const sourceGate = this.evaluateCurrentSourceGate(
      currentSourceContext.ingestionRun,
      record.intentType === 'test_order' ? 'test_order' : 'retain',
      now,
    );
    if (sourceGate) return { kind: sourceGate };

    const membership = await tx.organizationMembership.findFirst({
      where: {
        organizationId,
        userId: record.requestedByUserId,
        status: 'active',
        user: { isActive: true },
      },
      select: { id: true },
    });
    if (!membership) return { kind: 'actor_not_active' as const };

    if (record.sourceRecommendationArtifactId !== record.decisionBatchItemId) {
      return { kind: 'decision_artifact_mismatch' as const };
    }
    const decisionItem = await this.findProcurementDecisionContext(
      organizationId,
      record.decisionBatchItemId,
      tx,
    );
    if (!decisionItem) {
      return { kind: 'decision_batch_item_not_found' as const };
    }
    if (
      decisionItem.supplierOfferSkuSnapshotId !==
        record.supplierOfferSkuSnapshotId ||
      decisionItem.launchCandidateId !== record.launchCandidateId
    ) {
      return { kind: 'decision_reference_mismatch' as const };
    }
    if (decisionItem.decisionBatchExpiresAt <= now) {
      return { kind: 'decision_batch_expired' as const };
    }
    if (decisionItem.decision === 'reject') {
      return { kind: 'decision_rejected' as const };
    }
    if (
      record.intentType === 'test_order' &&
      decisionItem.decisionBatchStatus !== 'active'
    ) {
      return { kind: 'decision_batch_not_active' as const };
    }
    if (
      record.intentType === 'test_order' &&
      (decisionItem.decision !== 'test_order' ||
        !decisionItem.executionEligible)
    ) {
      return { kind: 'decision_not_execution_eligible' as const };
    }

    if (record.launchCandidateId && !decisionItem.launchCandidate) {
      return { kind: 'launch_candidate_not_found' as const };
    }
    if (
      decisionItem.launchCandidate &&
      decisionItem.launchCandidate.supplierOfferSkuSnapshotId !==
        record.supplierOfferSkuSnapshotId
    ) {
      return { kind: 'decision_reference_mismatch' as const };
    }

    if (
      record.intentType === 'test_order' &&
      snapshot.validUntil &&
      snapshot.validUntil <= now
    ) {
      return { kind: 'offer_snapshot_expired' as const };
    }
    let quantityConversion;
    try {
      quantityConversion = resolveProcurementQuantityConservation({
        intentType: record.intentType,
        requestedPurchaseUnits: record.requestedPurchaseUnits,
        unitsPerOrderUnit: snapshot.unitsPerOrderUnit,
        launchCandidate: decisionItem.launchCandidate,
      });
    } catch {
      return { kind: 'quantity_conservation_mismatch' as const };
    }
    if (
      quantityConversion.unitsPerPurchaseUnit !== record.unitsPerPurchaseUnit ||
      quantityConversion.unitsPerSellableBundle !==
        record.unitsPerSellableBundle ||
      quantityConversion.requestedSellableUnits !==
        record.requestedSellableUnits
    ) {
      return { kind: 'quantity_conservation_mismatch' as const };
    }
    const expectedRequestHash = buildProcurementTestIntentRequestHash({
      supplierOfferSkuSnapshotId: snapshot.id,
      supplierOfferSnapshotHash: snapshot.snapshotHash,
      selection: {
        intentType: record.intentType,
        sourceRecommendationArtifactId: record.sourceRecommendationArtifactId,
        launchCandidateId: record.launchCandidateId,
        decisionBatchItemId: record.decisionBatchItemId,
        selectedPriceTierId: record.selectedPriceTierId,
        requestedPurchaseUnits: record.requestedPurchaseUnits,
        ...quantityConversion,
        selectedUnitPriceCny: record.selectedUnitPriceCny,
        expectedGoodsTotalCny: record.expectedGoodsTotalCny,
        currency: record.currency,
        expiresAt: record.expiresAt,
      },
    });
    if (expectedRequestHash !== record.requestHash) {
      return { kind: 'quantity_conservation_mismatch' as const };
    }

    const row = await tx.procurementTestIntent.create({
      data: {
        organizationId,
        decisionBatchItemId: record.decisionBatchItemId,
        launchCandidateId: record.launchCandidateId,
        supplierOfferSkuSnapshotId: record.supplierOfferSkuSnapshotId,
        selectedPriceTierId: record.selectedPriceTierId,
        sourceRecommendationArtifactId: record.sourceRecommendationArtifactId,
        requestedByUserId: record.requestedByUserId,
        reviewedByUserId: null,
        kind: record.intentType,
        status: PROCUREMENT_TEST_INTENT_STATUS,
        idempotencyKey: record.idempotencyKey,
        requestHash: record.requestHash,
        requestedPurchaseUnits: record.requestedPurchaseUnits,
        unitsPerPurchaseUnit: record.unitsPerPurchaseUnit,
        unitsPerSellableBundle: record.unitsPerSellableBundle,
        requestedSellableUnits: record.requestedSellableUnits,
        selectedUnitPriceCny: record.selectedUnitPriceCny,
        expectedGoodsTotalCny: record.expectedGoodsTotalCny,
        currency: record.currency,
        expiresAt: record.expiresAt,
        reviewedAt: null,
        reviewReason: null,
      },
      include: { supplierOfferSkuSnapshot: { include: OFFER_INCLUDE } },
    });
    return { kind: 'created' as const, intent: mapIntent(row) };
  }

  async findTestIntent(organizationId: string, id: string) {
    const row = await this.prisma.procurementTestIntent.findFirst({
      where: { id, organizationId },
      include: { supplierOfferSkuSnapshot: { include: OFFER_INCLUDE } },
    });
    return row ? mapIntent(row) : null;
  }

  findTestIntentByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ) {
    return this.findIntentByKey(organizationId, idempotencyKey);
  }

  async listTestIntents(input: {
    organizationId: string;
    page: number;
    limit: number;
    intentType?: ProcurementTestIntentType;
    status?: ProcurementTestIntentStatus;
  }) {
    const where = {
      organizationId: input.organizationId,
      ...(input.intentType && { kind: input.intentType }),
      ...(input.status && { status: input.status }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.procurementTestIntent.findMany({
        where,
        include: { supplierOfferSkuSnapshot: { include: OFFER_INCLUDE } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      this.prisma.procurementTestIntent.count({ where }),
    ]);
    return {
      items: rows.map(mapIntent),
      total,
      page: input.page,
      limit: input.limit,
    };
  }

  private evaluateCurrentSourceGate(
    ingestionRun: SupplySourceIngestionRunPolicyRecord,
    usage: SupplySourceUsage,
    at: Date,
  ): 'evidence_observation_not_terminal' | null {
    const eligibility = evaluateSupplySourceEligibility({
      usage,
      ingestionRun,
      at,
    });
    if (eligibility.allowed) return null;
    return 'evidence_observation_not_terminal';
  }

  private async findOfferByHash(
    organizationId: string,
    snapshotHash: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const row = await db.supplierOfferSkuSnapshot.findUnique({
      where: { organizationId_snapshotHash: { organizationId, snapshotHash } },
      include: OFFER_INCLUDE,
    });
    return row ? mapOffer(row) : null;
  }

  private async findIntentByKey(
    organizationId: string,
    idempotencyKey: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const row = await db.procurementTestIntent.findUnique({
      where: {
        organizationId_idempotencyKey: { organizationId, idempotencyKey },
      },
      include: { supplierOfferSkuSnapshot: { include: OFFER_INCLUDE } },
    });
    return row ? mapIntent(row) : null;
  }
}

async function databaseClock(tx: Prisma.TransactionClient): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ at: Date }>>`
    SELECT clock_timestamp() AS "at"
  `;
  // queryraw-tenancy-exempt: database clock only
  const at = rows[0]?.at;
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) {
    throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'DATABASE_CLOCK_MISSING' } });
  }
  return at;
}

function mapOffer(row: OfferRow): SupplierOfferSnapshotView {
  return {
    ...row,
    identityStatus: row.identityStatus as SupplierOfferIdentityStatus,
    samplePriceCny: row.samplePriceCny?.toFixed(2) ?? null,
    domesticFreightCny: row.domesticFreightCny?.toFixed(2) ?? null,
    priceTiers: row.priceTiers.map((tier) => ({
      id: tier.id,
      minQuantity: tier.minQuantity,
      maxQuantity: tier.maxQuantity,
      unitPriceCny: tier.unitPriceCny.toFixed(2),
    })),
  };
}

type IntentRow = Prisma.ProcurementTestIntentGetPayload<{
  include: { supplierOfferSkuSnapshot: { include: typeof OFFER_INCLUDE } };
}>;

function mapIntent(row: IntentRow): ProcurementTestIntentView {
  const { kind, supplierOfferSkuSnapshot, ...rest } = row;
  return {
    ...rest,
    intentType: kind as ProcurementTestIntentType,
    status: row.status as ProcurementTestIntentStatus,
    selectedUnitPriceCny: row.selectedUnitPriceCny?.toFixed(2) ?? null,
    expectedGoodsTotalCny: row.expectedGoodsTotalCny?.toFixed(2) ?? null,
    ...(supplierOfferSkuSnapshot && {
      supplierOfferSkuSnapshot: mapOffer(supplierOfferSkuSnapshot),
    }),
  };
}

function duplicateResult(
  intent: ProcurementTestIntentView,
  requestHash: string,
  requestedByUserId: string,
) {
  if (intent.requestedByUserId !== requestedByUserId) {
    return { kind: 'idempotency_actor_mismatch' as const };
  }
  return intent.requestHash === requestHash
    ? { kind: 'duplicate' as const, intent }
    : { kind: 'idempotency_conflict' as const };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
