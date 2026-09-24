import { Inject, Injectable } from '@nestjs/common';
import { isKiditemError, KiditemConflictError, KiditemError, KiditemInvalidValueError, KiditemNotFoundError } from '@kiditem/shared/errors';
import {
  buildProcurementTestIntentRequestHash,
  buildSupplierOfferSnapshotHash,
  normalizeMoney,
  PROCUREMENT_TEST_INTENT_STATUS,
  resolveProcurementTestIntentSelection,
  SourcingProcurementPolicyError,
} from '../../domain/policy/sourcing-procurement';
import {
  SUPPLY_SOURCING_PROCUREMENT_REPOSITORY_PORT,
  type CreateProcurementTestIntentRecord,
  type CreateSupplierOfferSnapshotRecord,
  type CreateProcurementTestIntentRepositoryResult,
  type ProcurementDecisionContextView,
  type SupplySourcingProcurementRepositoryPort,
} from '../port/out/repository/supply-sourcing-procurement.repository.port';
import type {
  CreateProcurementTestIntentInput,
  CreateSupplierOfferSnapshotInput,
  ListProcurementTestIntentsInput,
  ListSupplierOfferSnapshotsInput,
  ProcurementTestIntentView,
  SupplierOfferSnapshotView,
  SupplySourcingProcurementPort,
} from '../port/in/procurement/supply-sourcing-procurement.port';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

@Injectable()
export class SupplySourcingProcurementService implements SupplySourcingProcurementPort {
  constructor(
    @Inject(SUPPLY_SOURCING_PROCUREMENT_REPOSITORY_PORT)
    private readonly repository: SupplySourcingProcurementRepositoryPort,
  ) {}

  async createOfferSnapshot(input: CreateSupplierOfferSnapshotInput) {
    const record = offerSnapshotRecord(input);
    const result = await this.repository.createOfferSnapshot(
      input.organizationId,
      record,
    );
    if (result.kind === 'supplier_not_found') {
      throw new KiditemInvalidValueError('SUPPLY_PROCUREMENT_REFERENCE_INVALID', { details: { reason: 'SUPPLIER_NOT_FOUND' } });
    }
    if (result.kind === 'evidence_observation_not_found') {
      throw new KiditemInvalidValueError('SUPPLY_PROCUREMENT_REFERENCE_INVALID', { details: { reason: 'EVIDENCE_OBSERVATION_NOT_FOUND' } });
    }
    if (result.kind === 'evidence_observation_mismatch') {
      throw new KiditemInvalidValueError('SUPPLY_PROCUREMENT_REFERENCE_INVALID', { details: { reason: 'EVIDENCE_OBSERVATION_MISMATCH' } });
    }
    if (result.kind === 'evidence_observation_not_terminal') {
      throw new KiditemInvalidValueError('SUPPLY_PROCUREMENT_REFERENCE_INVALID', { details: { reason: 'EVIDENCE_OBSERVATION_NOT_TERMINAL' } });
    }
    if (result.kind === 'evidence_observation_not_latest') {
      throw new KiditemConflictError('STATE_CONFLICT', { details: { reason: 'EVIDENCE_OBSERVATION_NOT_LATEST' } });
    }
    if (result.kind === 'evidence_payload_mismatch') {
      throw new KiditemInvalidValueError('SUPPLY_PROCUREMENT_REFERENCE_INVALID', { details: { reason: 'EVIDENCE_PAYLOAD_MISMATCH' } });
    }
    return {
      snapshot: result.snapshot,
      duplicate: result.kind === 'duplicate',
    };
  }

  findOfferSnapshot(input: { organizationId: string; id: string }) {
    return this.repository.findOfferSnapshot(input.organizationId, input.id);
  }

  findOfferSnapshotsByExternalOffer(input: {
    organizationId: string;
    sourcePlatform: string;
    externalOfferIds: string[];
  }) {
    const externalOfferIds = Array.from(
      new Set(input.externalOfferIds.map((id) => id.trim()).filter(Boolean)),
    );
    if (externalOfferIds.length === 0) return Promise.resolve([]);
    return this.repository.findOfferSnapshotsByExternalOffer({
      organizationId: input.organizationId,
      sourcePlatform: input.sourcePlatform.trim().toLowerCase(),
      externalOfferIds,
    });
  }

  listOfferSnapshots(input: ListSupplierOfferSnapshotsInput) {
    const pagination = normalizePagination(input);
    return this.repository.listOfferSnapshots({
      organizationId: input.organizationId,
      ...pagination,
      ...(input.identityStatus && { identityStatus: input.identityStatus }),
      ...(input.sourcePlatform?.trim() && {
        sourcePlatform: input.sourcePlatform.trim().toLowerCase(),
      }),
    });
  }

  async createTestIntent(input: CreateProcurementTestIntentInput) {
    const idempotencyKey = cleanIdempotencyKey(input.idempotencyKey);
    const existing = await this.repository.findTestIntentByIdempotencyKey(
      input.organizationId,
      idempotencyKey,
    );
    if (existing) {
      resolveExistingIntent(input, existing);
      const duplicateResult = await this.repository.createTestIntent(
        input.organizationId,
        intentRecordFromExisting(existing),
      );
      return resolveIntentCreationResult(duplicateResult);
    }
    const [snapshot, decisionContext] = await Promise.all([
      this.repository.findOfferSnapshot(
        input.organizationId,
        input.supplierOfferSkuSnapshotId,
      ),
      this.repository.findProcurementDecisionContext(
        input.organizationId,
        input.decisionBatchItemId?.trim() ?? '',
      ),
    ]);
    if (!snapshot) {
      throw new KiditemNotFoundError('NOT_FOUND', { details: { reason: 'supplier_offer_snapshot' } });
    }
    if (!decisionContext) {
      throw new KiditemInvalidValueError('SUPPLY_PROCUREMENT_REFERENCE_INVALID', { details: { reason: 'DECISION_BATCH_ITEM_NOT_FOUND' } });
    }

    let selection;
    try {
      selection = resolveIntentSelection(
        snapshot,
        input,
        decisionContext,
        true,
      );
    } catch (error) {
      throw policyRefusal(error);
    }

    const requestHash = buildProcurementTestIntentRequestHash({
      supplierOfferSkuSnapshotId: snapshot.id,
      supplierOfferSnapshotHash: snapshot.snapshotHash,
      selection,
    });
    const result = await this.repository.createTestIntent(
      input.organizationId,
      {
        supplierOfferSkuSnapshotId: snapshot.id,
        sourceRecommendationArtifactId:
          selection.sourceRecommendationArtifactId,
        launchCandidateId: selection.launchCandidateId,
        decisionBatchItemId: selection.decisionBatchItemId,
        intentType: selection.intentType,
        status: PROCUREMENT_TEST_INTENT_STATUS,
        selectedPriceTierId: selection.selectedPriceTierId,
        requestedPurchaseUnits: selection.requestedPurchaseUnits,
        unitsPerPurchaseUnit: selection.unitsPerPurchaseUnit,
        unitsPerSellableBundle: selection.unitsPerSellableBundle,
        requestedSellableUnits: selection.requestedSellableUnits,
        selectedUnitPriceCny: selection.selectedUnitPriceCny,
        expectedGoodsTotalCny: selection.expectedGoodsTotalCny,
        currency: selection.currency,
        expiresAt: selection.expiresAt,
        reviewedByUserId: null,
        reviewedAt: null,
        reviewReason: null,
        idempotencyKey,
        requestHash,
        requestedByUserId: input.requestedByUserId,
      },
    );

    return resolveIntentCreationResult(result);
  }

  getTestIntent(input: { organizationId: string; id: string }) {
    return this.repository.findTestIntent(input.organizationId, input.id);
  }

  listTestIntents(input: ListProcurementTestIntentsInput) {
    const pagination = normalizePagination(input);
    return this.repository.listTestIntents({
      organizationId: input.organizationId,
      ...pagination,
      ...(input.intentType && { intentType: input.intentType }),
      ...(input.status && { status: input.status }),
    });
  }
}

function resolveIntentCreationResult(
  result: CreateProcurementTestIntentRepositoryResult,
) {
  if (result.kind === 'idempotency_conflict') {
    throw idempotencyKeyReused();
  }
  if (result.kind === 'idempotency_actor_mismatch') {
    throw new KiditemConflictError('STATE_CONFLICT', { details: { reason: 'IDEMPOTENCY_ACTOR_MISMATCH' } });
  }
  if (result.kind === 'actor_not_active') {
    throw new KiditemError('AUTH_REQUIRED', { details: { reason: 'ACTOR_NOT_ACTIVE' } });
  }
  if (result.kind === 'evidence_observation_not_found') {
    throw new KiditemInvalidValueError('SUPPLY_PROCUREMENT_REFERENCE_INVALID', { details: { reason: 'EVIDENCE_OBSERVATION_NOT_FOUND' } });
  }
  if (result.kind === 'evidence_observation_not_terminal') {
    throw new KiditemConflictError('STATE_CONFLICT', { details: { reason: 'EVIDENCE_OBSERVATION_NOT_TERMINAL' } });
  }
  if (result.kind === 'launch_candidate_not_found') {
    throw new KiditemInvalidValueError('SUPPLY_PROCUREMENT_REFERENCE_INVALID', { details: { reason: 'LAUNCH_CANDIDATE_NOT_FOUND' } });
  }
  if (result.kind === 'decision_batch_item_not_found') {
    throw new KiditemInvalidValueError('SUPPLY_PROCUREMENT_REFERENCE_INVALID', { details: { reason: 'DECISION_BATCH_ITEM_NOT_FOUND' } });
  }
  if (result.kind === 'decision_artifact_mismatch') {
    throw new KiditemInvalidValueError('SUPPLY_PROCUREMENT_REFERENCE_INVALID', { details: { reason: 'DECISION_ARTIFACT_MISMATCH' } });
  }
  if (result.kind === 'decision_reference_mismatch') {
    throw new KiditemInvalidValueError('SUPPLY_PROCUREMENT_REFERENCE_INVALID', { details: { reason: 'DECISION_REFERENCE_MISMATCH' } });
  }
  if (result.kind === 'decision_batch_expired') {
    throw new KiditemConflictError('SUPPLY_DECISION_EXPIRED', { details: { reason: 'DECISION_BATCH_EXPIRED' } });
  }
  if (result.kind === 'decision_batch_not_active') {
    throw new KiditemConflictError('SUPPLY_DECISION_EXPIRED', { details: { reason: 'DECISION_BATCH_NOT_ACTIVE' } });
  }
  if (result.kind === 'decision_rejected') {
    throw new KiditemInvalidValueError('SUPPLY_PROCUREMENT_REFERENCE_INVALID', { details: { reason: 'DECISION_REJECTED' } });
  }
  if (result.kind === 'decision_not_execution_eligible') {
    throw new KiditemInvalidValueError('SUPPLY_PROCUREMENT_REFERENCE_INVALID', { details: { reason: 'DECISION_NOT_EXECUTION_ELIGIBLE' } });
  }
  if (result.kind === 'offer_snapshot_expired') {
    throw new KiditemConflictError('SUPPLY_OFFER_SNAPSHOT_EXPIRED', { details: { reason: 'offer_snapshot_expired' } });
  }
  if (result.kind === 'quantity_conservation_mismatch') {
    throw new KiditemConflictError('STATE_CONFLICT', { details: { reason: 'quantity_conservation_mismatch' } });
  }
  return {
    intent: result.intent,
    duplicate: result.kind === 'duplicate',
  };
}

function intentRecordFromExisting(
  intent: ProcurementTestIntentView,
): CreateProcurementTestIntentRecord {
  return {
    decisionBatchItemId: intent.decisionBatchItemId,
    launchCandidateId: intent.launchCandidateId,
    supplierOfferSkuSnapshotId: intent.supplierOfferSkuSnapshotId,
    selectedPriceTierId: intent.selectedPriceTierId,
    sourceRecommendationArtifactId: intent.sourceRecommendationArtifactId,
    requestedByUserId: intent.requestedByUserId,
    reviewedByUserId: intent.reviewedByUserId,
    intentType: intent.intentType,
    status: intent.status,
    idempotencyKey: intent.idempotencyKey,
    requestHash: intent.requestHash,
    requestedPurchaseUnits: intent.requestedPurchaseUnits,
    unitsPerPurchaseUnit: intent.unitsPerPurchaseUnit,
    unitsPerSellableBundle: intent.unitsPerSellableBundle,
    requestedSellableUnits: intent.requestedSellableUnits,
    selectedUnitPriceCny: intent.selectedUnitPriceCny,
    expectedGoodsTotalCny: intent.expectedGoodsTotalCny,
    currency: intent.currency,
    expiresAt: intent.expiresAt,
    reviewedAt: intent.reviewedAt,
    reviewReason: intent.reviewReason,
  };
}

function resolveExistingIntent(
  input: CreateProcurementTestIntentInput,
  existing: ProcurementTestIntentView,
) {
  const snapshot = existing.supplierOfferSkuSnapshot;
  if (
    existing.requestedByUserId !== input.requestedByUserId ||
    existing.supplierOfferSkuSnapshotId !== input.supplierOfferSkuSnapshotId ||
    !snapshot
  ) {
    throw idempotencyKeyReused();
  }
  try {
    const selection = resolveIntentSelection(
      snapshot,
      input,
      frozenDecisionContext(existing),
      false,
    );
    const requestHash = buildProcurementTestIntentRequestHash({
      supplierOfferSkuSnapshotId: snapshot.id,
      supplierOfferSnapshotHash: snapshot.snapshotHash,
      selection,
    });
    if (requestHash !== existing.requestHash) {
      throw idempotencyKeyReused();
    }
  } catch (error) {
    if (isKiditemError(error)) throw error;
    throw idempotencyKeyReused(error);
  }
  return { intent: existing, duplicate: true };
}

function idempotencyKeyReused(cause?: unknown) {
  return new KiditemConflictError('STATE_CONFLICT', { details: { reason: 'IDEMPOTENCY_KEY_REUSED' }, cause });
}

function resolveIntentSelection(
  snapshot: SupplierOfferSnapshotView,
  input: CreateProcurementTestIntentInput,
  decisionContext: ProcurementDecisionContextView,
  enforceOfferExpiry: boolean,
) {
  return resolveProcurementTestIntentSelection({
    snapshot: {
      id: snapshot.id,
      snapshotHash: snapshot.snapshotHash,
      identityStatus: snapshot.identityStatus,
      minOrderQuantity: snapshot.minOrderQuantity,
      currency: snapshot.currency,
      orderUnit: snapshot.orderUnit,
      unitsPerOrderUnit: snapshot.unitsPerOrderUnit,
      samplePriceCny: snapshot.samplePriceCny,
      validUntil: snapshot.validUntil,
      priceTiers: snapshot.priceTiers,
    },
    decisionContext,
    selection: {
      intentType: input.intentType,
      sourceRecommendationArtifactId: input.sourceRecommendationArtifactId,
      launchCandidateId: input.launchCandidateId,
      decisionBatchItemId: input.decisionBatchItemId,
      selectedPriceTierId: input.selectedPriceTierId,
      requestedPurchaseUnits: input.requestedPurchaseUnits,
    },
    enforceOfferExpiry,
  });
}

function frozenDecisionContext(
  intent: ProcurementTestIntentView,
): ProcurementDecisionContextView {
  const launchCandidate = intent.launchCandidateId
    ? {
        id: intent.launchCandidateId,
        supplierOfferSkuSnapshotId: intent.supplierOfferSkuSnapshotId,
        initialOrderQuantity:
          intent.intentType === 'test_order'
            ? intent.requestedPurchaseUnits
            : null,
        unitsPerSellableBundle: intent.unitsPerSellableBundle ?? 0,
      }
    : null;
  return {
    decisionBatchItemId: intent.decisionBatchItemId,
    supplierOfferSkuSnapshotId: intent.supplierOfferSkuSnapshotId,
    launchCandidateId: intent.launchCandidateId,
    launchCandidate,
    decision: intent.intentType === 'test_order' ? 'test_order' : 'hold',
    executionEligible: intent.intentType === 'test_order',
    decisionBatchStatus: 'active',
    decisionBatchExpiresAt: intent.expiresAt ?? intent.createdAt,
  };
}

function offerSnapshotRecord(
  input: CreateSupplierOfferSnapshotInput,
): CreateSupplierOfferSnapshotRecord {
  try {
    const snapshotHash = buildSupplierOfferSnapshotHash(input);
    return {
      evidenceObservationId: input.evidenceObservationId.trim(),
      supplierId: input.supplierId?.trim() || null,
      supplierName: input.supplierName?.trim() || null,
      identityStatus: input.identityStatus,
      sourcePlatform: input.sourcePlatform.trim().toLowerCase(),
      sourceUrl: input.sourceUrl?.trim() || null,
      externalSupplierKey: input.externalSupplierKey?.trim() || null,
      externalOfferId: input.externalOfferId.trim(),
      externalSkuId: input.externalSkuId?.trim() || null,
      variantKey: input.variantKey?.trim() || null,
      productName: input.productName.trim(),
      variantName: input.variantName?.trim() || null,
      currency: input.currency.trim().toUpperCase(),
      orderUnit: input.orderUnit?.trim() || null,
      unitsPerOrderUnit: input.unitsPerOrderUnit ?? null,
      minOrderQuantity: input.minOrderQuantity ?? null,
      sampleAvailable: input.sampleAvailable ?? null,
      samplePriceCny:
        input.samplePriceCny === null || input.samplePriceCny === undefined
          ? null
          : normalizeMoney(input.samplePriceCny),
      domesticFreightCny:
        input.domesticFreightCny === null ||
        input.domesticFreightCny === undefined
          ? null
          : normalizeMoney(input.domesticFreightCny),
      productionLeadTimeDaysMin: input.productionLeadTimeDaysMin ?? null,
      productionLeadTimeDaysMax: input.productionLeadTimeDaysMax ?? null,
      dispatchLeadTimeDaysMin: input.dispatchLeadTimeDaysMin ?? null,
      dispatchLeadTimeDaysMax: input.dispatchLeadTimeDaysMax ?? null,
      grossWeightGrams: input.grossWeightGrams ?? null,
      lengthMm: input.lengthMm ?? null,
      widthMm: input.widthMm ?? null,
      heightMm: input.heightMm ?? null,
      material: input.material?.trim() || null,
      packCount: input.packCount ?? null,
      capturedAt: input.capturedAt,
      validUntil: input.validUntil ?? null,
      snapshotHash,
      priceTiers: input.priceTiers.map((tier) => ({
        minQuantity: tier.minQuantity,
        maxQuantity: tier.maxQuantity ?? null,
        unitPriceCny: normalizeMoney(tier.unitPriceCny),
      })),
    };
  } catch (error) {
    throw policyRefusal(error);
  }
}

/** 조달 정책 거절을 VALIDATION_FAILED로 옮긴다 — 정책 철자는 details.reason에 그대로 싣는다. */
function policyRefusal(error: unknown): unknown {
  if (!(error instanceof SourcingProcurementPolicyError)) return error;
  return new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: error.code }, cause: error });
}

function cleanIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!key || key.length > 300) {
    throw new KiditemInvalidValueError('AGENT_OS_OWNER_IDEMPOTENCY_KEY_REQUIRED', { details: { reason: 'IDEMPOTENCY_KEY_LENGTH', max: 300 } });
  }
  return key;
}

function normalizePagination(input: { page?: number; limit?: number }) {
  const page = input.page ?? DEFAULT_PAGE;
  const limit = input.limit ?? DEFAULT_LIMIT;
  if (!Number.isSafeInteger(page) || page <= 0) {
    throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'PAGE_INVALID' }, message: '페이지 번호는 1 이상의 정수여야 합니다.' });
  }
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAX_LIMIT) {
    throw new KiditemInvalidValueError('VALIDATION_FAILED', {
      details: { reason: 'LIMIT_INVALID', max: MAX_LIMIT },
      message: `한 번에 볼 개수는 1부터 ${MAX_LIMIT}까지입니다.`,
    });
  }
  return { page, limit };
}
