import { createHash } from 'node:crypto';

export const SUPPLIER_OFFER_IDENTITY_STATUSES = [
  'offer_only',
  'exact_variant',
] as const;

export type SupplierOfferIdentityStatus =
  (typeof SUPPLIER_OFFER_IDENTITY_STATUSES)[number];

export const PROCUREMENT_TEST_INTENT_TYPES = [
  'request_rfq',
  'request_sample',
  'test_order',
] as const;

export type ProcurementTestIntentType =
  (typeof PROCUREMENT_TEST_INTENT_TYPES)[number];

export const PROCUREMENT_TEST_INTENT_STATUS = 'proposed' as const;
export type ProcurementTestIntentStatus = typeof PROCUREMENT_TEST_INTENT_STATUS;

export const SUPPLY_PERSISTED_INT_MAX = 2_147_483_647;
const DECIMAL_12_2_MAX_MINOR_UNITS = 999_999_999_999n;

export type SupplySourceUsage = 'retain' | 'test_order';

export type SupplySourceIngestionRunPolicyRecord = {
  status: string;
  completedAt: Date | null;
  coverageNumerator: number | null;
  coverageDenominator: number | null;
};

export type SupplySourceEligibilityDenialReason =
  | 'ingestion_run_not_complete'
  | 'ingestion_run_not_completed';

export type SupplySourceEligibilityResult =
  | { allowed: true; reason: null; coverageBps: number | null }
  | {
      allowed: false;
      reason: SupplySourceEligibilityDenialReason;
      coverageBps: number | null;
    };

export type SupplierOfferPriceTierPolicyRecord = {
  id: string;
  minQuantity: number;
  maxQuantity: number | null;
  unitPriceCny: string;
};

export type SupplierOfferSnapshotPolicyRecord = {
  id: string;
  snapshotHash: string;
  identityStatus: SupplierOfferIdentityStatus;
  minOrderQuantity: number | null;
  currency: string;
  orderUnit: string | null;
  unitsPerOrderUnit: number | null;
  samplePriceCny: string | null;
  validUntil: Date | null;
  priceTiers: SupplierOfferPriceTierPolicyRecord[];
};

export type ProcurementDecisionContextPolicyRecord = {
  decisionBatchItemId: string;
  supplierOfferSkuSnapshotId: string | null;
  launchCandidateId: string | null;
  launchCandidate: {
    id: string;
    supplierOfferSkuSnapshotId: string;
    initialOrderQuantity: number | null;
    unitsPerSellableBundle: number;
  } | null;
};

export type ProcurementTestIntentSelection = {
  intentType: ProcurementTestIntentType;
  sourceRecommendationArtifactId: string;
  launchCandidateId?: string | null;
  decisionBatchItemId: string;
  selectedPriceTierId?: string | null;
  requestedPurchaseUnits?: number | null;
};

export type ResolvedProcurementTestIntentSelection = {
  intentType: ProcurementTestIntentType;
  sourceRecommendationArtifactId: string;
  launchCandidateId: string | null;
  decisionBatchItemId: string;
  selectedPriceTierId: string | null;
  requestedPurchaseUnits: number | null;
  unitsPerPurchaseUnit: number | null;
  unitsPerSellableBundle: number | null;
  requestedSellableUnits: number | null;
  selectedUnitPriceCny: string | null;
  expectedGoodsTotalCny: string | null;
  currency: string | null;
  expiresAt: Date | null;
};

export type SupplierOfferSnapshotHashInput = {
  evidenceObservationId: string;
  supplierId?: string | null;
  supplierName?: string | null;
  identityStatus: SupplierOfferIdentityStatus;
  sourcePlatform: string;
  sourceUrl?: string | null;
  externalSupplierKey?: string | null;
  externalOfferId: string;
  externalSkuId?: string | null;
  variantKey?: string | null;
  productName: string;
  variantName?: string | null;
  currency: string;
  orderUnit?: string | null;
  unitsPerOrderUnit?: number | null;
  minOrderQuantity?: number | null;
  sampleAvailable?: boolean | null;
  samplePriceCny?: string | number | null;
  domesticFreightCny?: string | number | null;
  productionLeadTimeDaysMin?: number | null;
  productionLeadTimeDaysMax?: number | null;
  dispatchLeadTimeDaysMin?: number | null;
  dispatchLeadTimeDaysMax?: number | null;
  grossWeightGrams?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  material?: string | null;
  packCount?: number | null;
  capturedAt: Date;
  validUntil?: Date | null;
  priceTiers: Array<{
    minQuantity: number;
    maxQuantity?: number | null;
    unitPriceCny: string | number;
  }>;
};

export type ProcurementTestIntentRequestHashInput = {
  supplierOfferSkuSnapshotId: string;
  supplierOfferSnapshotHash: string;
  selection: ResolvedProcurementTestIntentSelection;
};

export class SourcingProcurementPolicyError extends Error {
  constructor(
    public readonly code:
      | 'invalid_offer_identity'
      | 'invalid_offer_terms'
      | 'invalid_intent_type'
      | 'decision_batch_item_required'
      | 'decision_artifact_mismatch'
      | 'decision_reference_mismatch'
      | 'exact_variant_required'
      | 'positive_quantity_required'
      | 'launch_candidate_required'
      | 'launch_initial_order_quantity_mismatch'
      | 'complete_quantity_conversion_required'
      | 'sellable_bundle_divisibility_required'
      | 'invalid_launch_quantity_context'
      | 'complete_commercial_terms_required'
      | 'price_tier_required'
      | 'price_tier_not_found'
      | 'quantity_outside_price_tier'
      | 'minimum_order_quantity_not_met'
      | 'offer_snapshot_expired',
    message: string,
  ) {
    super(message);
    this.name = 'SourcingProcurementPolicyError';
  }
}

export function buildSupplierOfferSnapshotHash(
  input: SupplierOfferSnapshotHashInput,
): string {
  assertSupplierOfferHashInput(input);
  const supplierOffer = canonicalSupplierOffer(input);
  const canonical = {
    evidenceObservationId: cleanRequired(input.evidenceObservationId),
    supplierId: cleanOptional(input.supplierId),
    ...supplierOffer,
  };

  return sha256(JSON.stringify(canonical));
}

export function buildCanonicalSupplierOfferEvidencePayload(
  input: SupplierOfferSnapshotHashInput,
): { supplierOffer: Record<string, unknown> } {
  assertSupplierOfferHashInput(input);
  return { supplierOffer: canonicalSupplierOffer(input) };
}

export function supplierOfferEvidencePayloadMatches(
  input: SupplierOfferSnapshotHashInput,
  rawPayload: unknown,
): boolean {
  if (!isPlainObject(rawPayload) || !isPlainObject(rawPayload.supplierOffer)) {
    return false;
  }
  const expected = buildCanonicalSupplierOfferEvidencePayload(input);
  try {
    return canonicalizeComparableJson(rawPayload.supplierOffer) ===
      canonicalizeComparableJson(expected.supplierOffer);
  } catch {
    return false;
  }
}

/**
 * Supply owns this narrow anti-corruption policy instead of importing a
 * Sourcing service. Supply accepts immutable source facts only after their
 * collection run has completed; source enablement controls future collection,
 * not the continued validity of an already persisted fact.
 */
export function evaluateSupplySourceEligibility(input: {
  usage: SupplySourceUsage;
  ingestionRun: SupplySourceIngestionRunPolicyRecord;
  at?: Date;
}): SupplySourceEligibilityResult {
  const at = input.at ?? new Date();
  if (!Number.isFinite(at.getTime())) {
    throw new TypeError('Supply source eligibility time must be valid.');
  }

  if (input.ingestionRun.status !== 'COMPLETE') {
    return sourceDenied('ingestion_run_not_complete');
  }
  if (
    !input.ingestionRun.completedAt ||
    !Number.isFinite(input.ingestionRun.completedAt.getTime()) ||
    input.ingestionRun.completedAt.getTime() > at.getTime()
  ) {
    return sourceDenied('ingestion_run_not_completed');
  }
  return { allowed: true, reason: null, coverageBps: null };
}

export function resolveProcurementTestIntentSelection(input: {
  snapshot: SupplierOfferSnapshotPolicyRecord;
  decisionContext: ProcurementDecisionContextPolicyRecord;
  selection: ProcurementTestIntentSelection;
  now?: Date;
  enforceOfferExpiry?: boolean;
}): ResolvedProcurementTestIntentSelection {
  const now = input.now ?? new Date();
  const selection = input.selection;
  if (!PROCUREMENT_TEST_INTENT_TYPES.includes(selection.intentType)) {
    throw new SourcingProcurementPolicyError(
      'invalid_intent_type',
      'Unknown procurement test intent type.',
    );
  }
  const callerRequestedPurchaseUnits = optionalPositiveInteger(
    selection.requestedPurchaseUnits,
  );
  const decisionBatchItemId = selection.decisionBatchItemId?.trim();
  if (!decisionBatchItemId) {
    throw new SourcingProcurementPolicyError(
      'decision_batch_item_required',
      'A decision batch item is required for every procurement intent.',
    );
  }
  const sourceRecommendationArtifactId = cleanRequired(
    selection.sourceRecommendationArtifactId,
  );
  if (sourceRecommendationArtifactId !== decisionBatchItemId) {
    throw new SourcingProcurementPolicyError(
      'decision_artifact_mismatch',
      'Source recommendation artifact must be the decision batch item.',
    );
  }
  const launchCandidateId = cleanOptional(selection.launchCandidateId);
  const selectedPriceTierId = cleanOptional(selection.selectedPriceTierId);

  if (selection.intentType === 'test_order') {
    if (!launchCandidateId) {
      throw new SourcingProcurementPolicyError(
        'launch_candidate_required',
        'Test-order intent requires an exact launch candidate.',
      );
    }
    if (!selectedPriceTierId) {
      throw new SourcingProcurementPolicyError(
        'price_tier_required',
        'Test-order intent requires a selected supplier price tier.',
      );
    }
  }

  assertDecisionReferences({
    snapshot: input.snapshot,
    decisionContext: input.decisionContext,
    decisionBatchItemId,
    launchCandidateId,
  });
  const requestedPurchaseUnits = selection.intentType === 'test_order'
    ? canonicalTestOrderPurchaseUnits(
        callerRequestedPurchaseUnits,
        input.decisionContext.launchCandidate,
      )
    : callerRequestedPurchaseUnits;

  if (selection.intentType !== 'request_rfq') {
    assertExactVariant(input.snapshot);
    if (requestedPurchaseUnits === null) {
      throw new SourcingProcurementPolicyError(
        'positive_quantity_required',
        `${selection.intentType} requires a positive requested quantity.`,
      );
    }
  }

  if (selection.intentType === 'test_order') {
    if (
      input.snapshot.minOrderQuantity === null ||
      input.snapshot.currency.toUpperCase() !== 'CNY'
    ) {
      throw new SourcingProcurementPolicyError(
        'complete_commercial_terms_required',
        'Test-order intent requires CNY pricing and a known MOQ.',
      );
    }
    if (
      (input.enforceOfferExpiry ?? true) &&
      input.snapshot.validUntil &&
      input.snapshot.validUntil <= now
    ) {
      throw new SourcingProcurementPolicyError(
        'offer_snapshot_expired',
        'Test-order intent cannot use an expired supplier offer snapshot.',
      );
    }
    const minimumOrderQuantity = input.snapshot.minOrderQuantity;
    if (
      minimumOrderQuantity !== null &&
      requestedPurchaseUnits !== null &&
      requestedPurchaseUnits < minimumOrderQuantity
    ) {
      throw new SourcingProcurementPolicyError(
        'minimum_order_quantity_not_met',
        `Requested quantity ${requestedPurchaseUnits} is below MOQ ${minimumOrderQuantity}.`,
      );
    }
  }

  const selectedTier = selectedPriceTierId
    ? input.snapshot.priceTiers.find(({ id }) => id === selectedPriceTierId)
    : null;
  if (selectedPriceTierId && !selectedTier) {
    throw new SourcingProcurementPolicyError(
      'price_tier_not_found',
      'Selected price tier does not belong to the supplier offer snapshot.',
    );
  }
  if (selectedTier && requestedPurchaseUnits === null) {
    throw new SourcingProcurementPolicyError(
      'positive_quantity_required',
      'A selected price tier requires a positive requested quantity.',
    );
  }
  const nextTierMinimum = selectedTier
    ? input.snapshot.priceTiers
        .filter((tier) => tier.minQuantity > selectedTier.minQuantity)
        .sort((left, right) => left.minQuantity - right.minQuantity)[0]
        ?.minQuantity ?? null
    : null;
  const selectedTierMaximum = selectedTier?.maxQuantity ??
    (nextTierMinimum === null ? null : nextTierMinimum - 1);
  if (
    selectedTier &&
    requestedPurchaseUnits !== null &&
    (requestedPurchaseUnits < selectedTier.minQuantity ||
      (selectedTierMaximum !== null &&
        requestedPurchaseUnits > selectedTierMaximum))
  ) {
    throw new SourcingProcurementPolicyError(
      'quantity_outside_price_tier',
      'Requested quantity is outside the selected supplier price tier.',
    );
  }

  const selectedUnitPriceCny = selectedTier
    ? normalizeMoney(selectedTier.unitPriceCny)
    : selection.intentType === 'request_sample' && input.snapshot.samplePriceCny
      ? normalizeMoney(input.snapshot.samplePriceCny)
      : null;
  const quantityConversion = resolveProcurementQuantityConservation({
    intentType: selection.intentType,
    requestedPurchaseUnits,
    unitsPerOrderUnit: input.snapshot.unitsPerOrderUnit,
    launchCandidate: input.decisionContext.launchCandidate,
  });
  return {
    intentType: selection.intentType,
    sourceRecommendationArtifactId,
    launchCandidateId,
    decisionBatchItemId,
    selectedPriceTierId,
    requestedPurchaseUnits,
    ...quantityConversion,
    selectedUnitPriceCny,
    expectedGoodsTotalCny:
      selectedUnitPriceCny && requestedPurchaseUnits !== null
        ? multiplyMoney(selectedUnitPriceCny, requestedPurchaseUnits)
        : null,
    currency: selectedUnitPriceCny ? input.snapshot.currency.toUpperCase() : null,
    expiresAt: input.snapshot.validUntil,
  };
}

export function buildProcurementTestIntentRequestHash(
  input: ProcurementTestIntentRequestHashInput,
): string {
  const canonical = {
    supplierOfferSkuSnapshotId: cleanRequired(
      input.supplierOfferSkuSnapshotId,
    ),
    supplierOfferSnapshotHash: cleanRequired(
      input.supplierOfferSnapshotHash,
    ),
    intentType: input.selection.intentType,
    sourceRecommendationArtifactId:
      input.selection.sourceRecommendationArtifactId,
    launchCandidateId: input.selection.launchCandidateId,
    decisionBatchItemId: input.selection.decisionBatchItemId,
    selectedPriceTierId: input.selection.selectedPriceTierId,
    requestedPurchaseUnits: input.selection.requestedPurchaseUnits,
    unitsPerPurchaseUnit: input.selection.unitsPerPurchaseUnit,
    unitsPerSellableBundle: input.selection.unitsPerSellableBundle,
    requestedSellableUnits: input.selection.requestedSellableUnits,
    selectedUnitPriceCny: input.selection.selectedUnitPriceCny,
    expectedGoodsTotalCny: input.selection.expectedGoodsTotalCny,
    currency: input.selection.currency,
    expiresAt: input.selection.expiresAt?.toISOString() ?? null,
  };
  return sha256(JSON.stringify(canonical));
}

function canonicalTestOrderPurchaseUnits(
  callerRequestedPurchaseUnits: number | null,
  launchCandidate: ProcurementDecisionContextPolicyRecord['launchCandidate'],
): number {
  if (!launchCandidate) {
    throw new SourcingProcurementPolicyError(
      'launch_candidate_required',
      'Test-order intent requires an exact launch candidate.',
    );
  }
  const initialOrderQuantity = requiredLaunchPositiveInteger(
    launchCandidate.initialOrderQuantity,
    'Launch initial order quantity',
  );
  if (
    callerRequestedPurchaseUnits !== null &&
    callerRequestedPurchaseUnits !== initialOrderQuantity
  ) {
    throw new SourcingProcurementPolicyError(
      'launch_initial_order_quantity_mismatch',
      `Requested purchase units must equal launch initial order quantity ${initialOrderQuantity}.`,
    );
  }
  return initialOrderQuantity;
}

export function resolveProcurementQuantityConservation(input: {
  intentType: ProcurementTestIntentType;
  requestedPurchaseUnits: number | null;
  unitsPerOrderUnit: number | null;
  launchCandidate: ProcurementDecisionContextPolicyRecord['launchCandidate'];
}): Pick<
  ResolvedProcurementTestIntentSelection,
  'unitsPerPurchaseUnit' | 'unitsPerSellableBundle' | 'requestedSellableUnits'
> {
  const requestedPurchaseUnits = optionalPositiveInteger(
    input.requestedPurchaseUnits,
  );
  const unitsPerPurchaseUnit = requestedPurchaseUnits === null
    ? null
    : positiveIntegerOrNull(input.unitsPerOrderUnit);
  const unitsPerSellableBundle = input.launchCandidate
    ? requiredLaunchPositiveInteger(
        input.launchCandidate.unitsPerSellableBundle,
        'Launch sellable-bundle units',
      )
    : null;

  if (input.intentType === 'test_order') {
    if (!input.launchCandidate) {
      throw new SourcingProcurementPolicyError(
        'launch_candidate_required',
        'Test-order intent requires an exact launch candidate.',
      );
    }
    const initialOrderQuantity = requiredLaunchPositiveInteger(
      input.launchCandidate.initialOrderQuantity,
      'Launch initial order quantity',
    );
    if (requestedPurchaseUnits !== initialOrderQuantity) {
      throw new SourcingProcurementPolicyError(
        'launch_initial_order_quantity_mismatch',
        `Requested purchase units must equal launch initial order quantity ${initialOrderQuantity}.`,
      );
    }
  }

  if (requestedPurchaseUnits === null || !input.launchCandidate) {
    return {
      unitsPerPurchaseUnit,
      unitsPerSellableBundle,
      requestedSellableUnits: null,
    };
  }
  if (unitsPerPurchaseUnit === null || unitsPerSellableBundle === null) {
    throw new SourcingProcurementPolicyError(
      'complete_quantity_conversion_required',
      'A launch-linked intent requires supplier order-unit and sellable-bundle conversions.',
    );
  }
  const purchasedPhysicalUnits = safeMultiplyQuantities(
    requestedPurchaseUnits,
    unitsPerPurchaseUnit,
  );
  if (purchasedPhysicalUnits % unitsPerSellableBundle !== 0) {
    throw new SourcingProcurementPolicyError(
      'sellable_bundle_divisibility_required',
      'Purchased physical units must divide exactly into launch sellable bundles.',
    );
  }
  return {
    unitsPerPurchaseUnit,
    unitsPerSellableBundle,
    requestedSellableUnits: purchasedPhysicalUnits / unitsPerSellableBundle,
  };
}

function assertSupplierOfferHashInput(input: SupplierOfferSnapshotHashInput): void {
  if (!SUPPLIER_OFFER_IDENTITY_STATUSES.includes(input.identityStatus)) {
    throw new SourcingProcurementPolicyError(
      'invalid_offer_identity',
      'Unknown supplier offer identity status.',
    );
  }
  if (
    input.identityStatus === 'exact_variant' &&
    (!cleanOptional(input.externalSkuId) || !cleanOptional(input.variantKey))
  ) {
    throw new SourcingProcurementPolicyError(
      'invalid_offer_identity',
      'Exact-variant supplier offer requires both an external SKU id and a stable variant key.',
    );
  }
  cleanRequired(input.evidenceObservationId);
  cleanRequired(input.sourcePlatform);
  cleanRequired(input.externalOfferId);
  cleanRequired(input.productName);
  const currency = cleanRequired(input.currency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new SourcingProcurementPolicyError(
      'invalid_offer_terms',
      'Supplier offer currency must be a three-letter ISO currency code.',
    );
  }
  if (
    (input.priceTiers.length > 0 ||
      input.samplePriceCny !== null && input.samplePriceCny !== undefined ||
      input.domesticFreightCny !== null && input.domesticFreightCny !== undefined) &&
    currency !== 'CNY'
  ) {
    throw new SourcingProcurementPolicyError(
      'invalid_offer_terms',
      'CNY-denominated supplier prices require snapshot currency CNY.',
    );
  }
  if (Number.isNaN(input.capturedAt.getTime())) {
    throw new SourcingProcurementPolicyError(
      'invalid_offer_terms',
      'Supplier offer capture timestamp is invalid.',
    );
  }
  if (input.validUntil && Number.isNaN(input.validUntil.getTime())) {
    throw new SourcingProcurementPolicyError(
      'invalid_offer_terms',
      'Supplier offer expiry timestamp is invalid.',
    );
  }
  if (input.validUntil && input.validUntil <= input.capturedAt) {
    throw new SourcingProcurementPolicyError(
      'invalid_offer_terms',
      'Supplier offer expiry must be later than its capture timestamp.',
    );
  }
  if (input.unitsPerOrderUnit !== null && input.unitsPerOrderUnit !== undefined) {
    requiredPositiveInteger(input.unitsPerOrderUnit, 'units per order unit');
  }
  const minimum = positiveIntegerOrNull(input.minOrderQuantity);
  const sortedTiers = input.priceTiers
    .map((tier) => ({
      minQuantity: requiredPositiveInteger(tier.minQuantity, 'price tier minimum'),
      maxQuantity: positiveIntegerOrNull(tier.maxQuantity),
    }))
    .sort((left, right) => left.minQuantity - right.minQuantity);
  for (const [index, tier] of sortedTiers.entries()) {
    if (tier.maxQuantity !== null && tier.maxQuantity < tier.minQuantity) {
      throw new SourcingProcurementPolicyError(
        'invalid_offer_terms',
        'Supplier price tier maximum cannot be below its minimum.',
      );
    }
    if (index > 0 && tier.minQuantity === sortedTiers[index - 1].minQuantity) {
      throw new SourcingProcurementPolicyError(
        'invalid_offer_terms',
        'Supplier price tiers must have distinct minimum quantities.',
      );
    }
    const previous = sortedTiers[index - 1];
    if (
      previous &&
      previous.maxQuantity !== null &&
      previous.maxQuantity >= tier.minQuantity
    ) {
      throw new SourcingProcurementPolicyError(
        'invalid_offer_terms',
        'Supplier price tiers cannot overlap.',
      );
    }
  }
  if (
    minimum !== null &&
    sortedTiers.length > 0 &&
    sortedTiers[0].minQuantity < minimum
  ) {
    throw new SourcingProcurementPolicyError(
      'invalid_offer_terms',
      'Supplier price tiers cannot start below the offer MOQ.',
    );
  }
  assertRange(
    input.productionLeadTimeDaysMin,
    input.productionLeadTimeDaysMax,
    'Production lead time',
  );
  assertRange(
    input.dispatchLeadTimeDaysMin,
    input.dispatchLeadTimeDaysMax,
    'Dispatch lead time',
  );
}

function assertRange(
  minimum: number | null | undefined,
  maximum: number | null | undefined,
  label: string,
): void {
  const min = nonNegativeIntegerOrNull(minimum);
  const max = nonNegativeIntegerOrNull(maximum);
  if (min !== null && max !== null && max < min) {
    throw new SourcingProcurementPolicyError(
      'invalid_offer_terms',
      `${label} maximum cannot be below its minimum.`,
    );
  }
}

function assertExactVariant(snapshot: SupplierOfferSnapshotPolicyRecord): void {
  if (snapshot.identityStatus === 'exact_variant') return;
  throw new SourcingProcurementPolicyError(
    'exact_variant_required',
    'Sample and test-order intents require exact supplier variant identity.',
  );
}

function assertDecisionReferences(input: {
  snapshot: SupplierOfferSnapshotPolicyRecord;
  decisionContext: ProcurementDecisionContextPolicyRecord;
  decisionBatchItemId: string;
  launchCandidateId: string | null;
}): void {
  const launchCandidate = input.decisionContext.launchCandidate;
  if (
    input.decisionContext.decisionBatchItemId !== input.decisionBatchItemId ||
    input.decisionContext.supplierOfferSkuSnapshotId !== input.snapshot.id ||
    input.decisionContext.launchCandidateId !== input.launchCandidateId ||
    (launchCandidate !== null &&
      (launchCandidate.id !== input.launchCandidateId ||
        launchCandidate.supplierOfferSkuSnapshotId !== input.snapshot.id)) ||
    (input.launchCandidateId !== null && launchCandidate === null)
  ) {
    throw new SourcingProcurementPolicyError(
      'decision_reference_mismatch',
      'Decision item, launch candidate, and supplier offer snapshot must match exactly.',
    );
  }
}

function canonicalSupplierOffer(
  input: SupplierOfferSnapshotHashInput,
): Record<string, unknown> {
  return {
    supplierName: cleanOptional(input.supplierName),
    identityStatus: input.identityStatus,
    sourcePlatform: cleanRequired(input.sourcePlatform).toLowerCase(),
    sourceUrl: cleanOptional(input.sourceUrl),
    externalSupplierKey: cleanOptional(input.externalSupplierKey),
    externalOfferId: cleanRequired(input.externalOfferId),
    externalSkuId: cleanOptional(input.externalSkuId),
    variantKey: cleanOptional(input.variantKey),
    productName: cleanRequired(input.productName),
    variantName: cleanOptional(input.variantName),
    currency: cleanRequired(input.currency).toUpperCase(),
    orderUnit: cleanOptional(input.orderUnit),
    unitsPerOrderUnit: positiveIntegerOrNull(input.unitsPerOrderUnit),
    minOrderQuantity: positiveIntegerOrNull(input.minOrderQuantity),
    sampleAvailable: input.sampleAvailable ?? null,
    samplePriceCny: nullableMoney(input.samplePriceCny),
    domesticFreightCny: nullableMoney(input.domesticFreightCny),
    productionLeadTimeDaysMin: nonNegativeIntegerOrNull(
      input.productionLeadTimeDaysMin,
    ),
    productionLeadTimeDaysMax: nonNegativeIntegerOrNull(
      input.productionLeadTimeDaysMax,
    ),
    dispatchLeadTimeDaysMin: nonNegativeIntegerOrNull(
      input.dispatchLeadTimeDaysMin,
    ),
    dispatchLeadTimeDaysMax: nonNegativeIntegerOrNull(
      input.dispatchLeadTimeDaysMax,
    ),
    grossWeightGrams: positiveIntegerOrNull(input.grossWeightGrams),
    lengthMm: positiveIntegerOrNull(input.lengthMm),
    widthMm: positiveIntegerOrNull(input.widthMm),
    heightMm: positiveIntegerOrNull(input.heightMm),
    material: cleanOptional(input.material),
    packCount: positiveIntegerOrNull(input.packCount),
    capturedAt: input.capturedAt.toISOString(),
    validUntil: input.validUntil?.toISOString() ?? null,
    priceTiers: input.priceTiers
      .map((tier) => ({
        minQuantity: requiredPositiveInteger(tier.minQuantity, 'price tier minimum'),
        maxQuantity: positiveIntegerOrNull(tier.maxQuantity),
        unitPriceCny: normalizeMoney(tier.unitPriceCny),
      }))
      .sort(comparePriceTiers),
  };
}

function comparePriceTiers(
  left: { minQuantity: number; maxQuantity: number | null; unitPriceCny: string },
  right: { minQuantity: number; maxQuantity: number | null; unitPriceCny: string },
): number {
  return (
    left.minQuantity - right.minQuantity ||
    (left.maxQuantity ?? Number.MAX_SAFE_INTEGER) -
      (right.maxQuantity ?? Number.MAX_SAFE_INTEGER) ||
    left.unitPriceCny.localeCompare(right.unitPriceCny)
  );
}

function cleanRequired(value: string | null | undefined): string {
  const cleaned = value?.trim();
  if (!cleaned) {
    throw new SourcingProcurementPolicyError(
      'invalid_offer_terms',
      'A required sourcing-procurement identity field is blank.',
    );
  }
  return cleaned;
}

function cleanOptional(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function requiredPositiveInteger(value: number, label: string): number {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > SUPPLY_PERSISTED_INT_MAX
  ) {
    throw new SourcingProcurementPolicyError(
      'invalid_offer_terms',
      `${label} must fit a positive PostgreSQL Int.`,
    );
  }
  return value;
}

function requiredLaunchPositiveInteger(
  value: number | null,
  label: string,
): number {
  if (
    value === null ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > SUPPLY_PERSISTED_INT_MAX
  ) {
    throw new SourcingProcurementPolicyError(
      'invalid_launch_quantity_context',
      `${label} must fit a positive PostgreSQL Int.`,
    );
  }
  return value;
}

function optionalPositiveInteger(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > SUPPLY_PERSISTED_INT_MAX
  ) {
    throw new SourcingProcurementPolicyError(
      'positive_quantity_required',
      'Requested purchase units must fit a positive PostgreSQL Int.',
    );
  }
  return value;
}

function positiveIntegerOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return requiredPositiveInteger(value, 'quantity');
}

function nonNegativeIntegerOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > SUPPLY_PERSISTED_INT_MAX
  ) {
    throw new SourcingProcurementPolicyError(
      'invalid_offer_terms',
      'Lead time must be a non-negative safe integer.',
    );
  }
  return value;
}

function nullableMoney(value: string | number | null | undefined): string | null {
  return value === null || value === undefined ? null : normalizeMoney(value);
}

export function normalizeMoney(value: string | number): string {
  const text = String(value).trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) {
    throw new SourcingProcurementPolicyError(
      'invalid_offer_terms',
      'CNY amount must be positive with at most two decimal places.',
    );
  }
  const minorUnits = BigInt(match[1]) * 100n +
    BigInt((match[2] ?? '').padEnd(2, '0'));
  if (minorUnits <= 0n || minorUnits > DECIMAL_12_2_MAX_MINOR_UNITS) {
    throw new SourcingProcurementPolicyError(
      'invalid_offer_terms',
      'CNY amount must fit Decimal(12,2) and be positive.',
    );
  }
  return `${BigInt(match[1]).toString()}.${(match[2] ?? '').padEnd(2, '0')}`;
}

function safeMultiplyQuantities(left: number, right: number): number {
  const product = left * right;
  if (
    !Number.isSafeInteger(product) ||
    product <= 0 ||
    product > SUPPLY_PERSISTED_INT_MAX
  ) {
    throw new SourcingProcurementPolicyError(
      'invalid_offer_terms',
      'Converted sellable-unit quantity exceeds the safe integer range.',
    );
  }
  return product;
}

function multiplyMoney(unitPrice: string, quantity: number): string {
  requiredPositiveInteger(quantity, 'requested quantity');
  const normalized = normalizeMoney(unitPrice);
  const [whole, fraction] = normalized.split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction);
  const total = minor * BigInt(quantity);
  if (total > DECIMAL_12_2_MAX_MINOR_UNITS) {
    throw new SourcingProcurementPolicyError(
      'invalid_offer_terms',
      'Expected CNY goods total exceeds Decimal(12,2).',
    );
  }
  return `${total / 100n}.${(total % 100n).toString().padStart(2, '0')}`;
}

function sourceDenied(
  reason: SupplySourceEligibilityDenialReason,
  coverageBps: number | null = null,
): SupplySourceEligibilityResult {
  return { allowed: false, reason, coverageBps };
}

function canonicalizeComparableJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Non-finite JSON number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeComparableJson).join(',')}]`;
  }
  if (!isPlainObject(value)) throw new TypeError('Non-JSON supplier offer payload.');
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalizeComparableJson(value[key])}`,
    )
    .join(',')}}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
