import { apiClient } from '@/lib/api-client';

export type IsoDateTimeString = string;

export type SourcingSourceLifecycle =
  | 'proposed'
  | 'onboarding'
  | 'shadow'
  | 'qualified'
  | 'suspended';

export type SourcingSourceDecisionImpact = 'disabled' | 'enabled';

export interface SourcingSourceEntitlement {
  id: string;
  organizationId: string;
  sourceKey: string;
  scopeKey: string;
  version: number;
  versionHash: string;
  lifecycle: SourcingSourceLifecycle;
  decisionImpact: SourcingSourceDecisionImpact;
  ownerLabel: string;
  legalBasis: string;
  allowedMethod: string;
  credentialRef: string | null;
  permittedFields: string[];
  prohibitedUses: string[];
  rateLimitValue: number | null;
  rateLimitWindowSeconds: number | null;
  geographyCoverage: string[];
  coverageDefinition: string | null;
  accountCoverage: string | null;
  searchCoverage: string | null;
  categoryCoverage: string | null;
  denominatorDefinition: string | null;
  historyBackfill: string | null;
  expectedDelayMinutes: number | null;
  maxStalenessMinutes: number | null;
  minimumCoverageBps: number | null;
  revisionPolicy: string | null;
  retentionDays: number | null;
  permissionStartsAt: IsoDateTimeString | null;
  permissionExpiresAt: IsoDateTimeString | null;
  killSwitch: boolean;
  reviewNote: string | null;
  reviewedByUserId: string;
  reviewedAt: IsoDateTimeString;
  retiredAt: IsoDateTimeString | null;
  createdAt: IsoDateTimeString;
}

export type SourcingGateStatus = 'unknown' | 'passed' | 'blocked';
export type SourcingEconomicsStatus = 'unknown' | 'known' | 'blocked';

export interface SourcingLaunchCandidate {
  id: string;
  organizationId: string;
  candidateKey: string;
  version: number;
  identityHash: string;
  sourceCandidateId: string | null;
  supplierOfferSkuSnapshotId: string;
  targetChannelAccountId: string;
  productConceptVersionKey: string;
  title: string;
  koreanSellableBundleVersionKey: string;
  unitsPerSellableBundle: number;
  initialOrderQuantity: number;
  targetSalePriceKrw: number;
  fulfillmentMode: string;
  intendedAgeMinMonths: number | null;
  intendedAgeMaxMonths: number | null;
  intendedUse: string;
  materialProfileKey: string;
  labelingProfileKey: string;
  launchPlanVersion: string;
  complianceAssessmentVersion: string;
  qualitySpecVersion: string;
  ipAssessmentVersion: string;
  economicsStatus: SourcingEconomicsStatus;
  complianceStatus: SourcingGateStatus;
  qualityStatus: SourcingGateStatus;
  ipStatus: SourcingGateStatus;
  landedCostKrw: number | null;
  profitP10Krw: number | null;
  blockingRiskCodes: string[];
  unknownRiskCodes: string[];
  bundleSnapshot: Record<string, unknown>;
  launchPlanSnapshot: Record<string, unknown>;
  economicsSnapshot: Record<string, unknown>;
  complianceSnapshot: Record<string, unknown>;
  qualitySnapshot: Record<string, unknown>;
  ipSnapshot: Record<string, unknown>;
  validUntil: IsoDateTimeString | null;
  createdByUserId: string;
  createdAt: IsoDateTimeString;
}

export type SourcingBaselineDecision = 'order' | 'observe_3d' | 'exclude';
export type SourcingCanonicalDecision = 'test_order' | 'hold' | 'reject';
export type SourcingConfidenceKind = 'coverage' | 'calibrated_probability';

export type SourcingNextEvidenceAction =
  | 'verify_compliance'
  | 'verify_ip'
  | 'verify_qc'
  | 'resolve_unknown_risk'
  | 'complete_economics'
  | 'obtain_calibrated_probability'
  | 'add_coupang_evidence'
  | 'add_1688_evidence'
  | 'collect_supporting_evidence'
  | 'add_independent_platform_evidence'
  | 'increase_calibrated_confidence'
  | 'reassess_baseline_decision'
  | 'resolve_supplier_variant';

export interface SourcingDecisionEvidence {
  id: string;
  observationId: string;
  evidenceRole: string;
}

export interface SourcingDecisionBatchItem {
  id: string;
  organizationId: string;
  decisionBatchId: string;
  modelCandidateId: string;
  rank: number;
  productName: string;
  supplierOfferSkuSnapshotId: string | null;
  launchCandidateId: string | null;
  baselineDecision: SourcingBaselineDecision;
  canonicalDecision: SourcingCanonicalDecision;
  executionEligible: boolean;
  baselineScore: number;
  confidence: number;
  confidenceKind: SourcingConfidenceKind;
  policyProbability: number | null;
  evidenceFamilyCount: number;
  evidencePlatformCount: number;
  hasCoupangEvidence: boolean;
  has1688Evidence: boolean;
  nextEvidenceAction: SourcingNextEvidenceAction | null;
  reasonCodes: string[];
  riskCodes: string[];
  modelOutput: Record<string, unknown>;
  createdAt: IsoDateTimeString;
  evidence: SourcingDecisionEvidence[];
}

export interface SourcingDecisionBatch {
  id: string;
  organizationId: string;
  batchKey: string;
  requestHash: string;
  status: string;
  keyword: string;
  category: string | null;
  policyVersion: string;
  modelPipeline: string;
  modelVersion: string;
  modelGeneratorVersion: string;
  decisionAt: IsoDateTimeString;
  sourceCutoffAt: IsoDateTimeString;
  expiresAt: IsoDateTimeString;
  createdByUserId: string;
  createdAt: IsoDateTimeString;
  items: SourcingDecisionBatchItem[];
}

export interface SourcingDecisionCandidateBindingInput {
  modelCandidateId: string;
  supplierOfferSkuSnapshotId?: string | null;
  launchCandidateId?: string | null;
  evidenceObservationIds?: string[];
}

export interface RunSourcingShadowDecisionBatchInput {
  idempotencyKey: string;
  keyword: string;
  category?: string | null;
  expiresInHours?: number;
  candidateBindings?: SourcingDecisionCandidateBindingInput[];
}

export interface RunSourcingShadowDecisionBatchResponse {
  kind: 'created' | 'existing';
  duplicate: boolean;
  record: SourcingDecisionBatch;
  dataGaps: string[];
}

export type SupplierOfferIdentityStatus = 'offer_only' | 'exact_variant';

export interface SupplierOfferPriceTier {
  id: string;
  minQuantity: number;
  maxQuantity: number | null;
  unitPriceCny: string;
}

export interface SupplierOfferSnapshot {
  id: string;
  organizationId: string;
  evidenceObservationId: string;
  supplierId: string | null;
  supplierName: string | null;
  identityStatus: SupplierOfferIdentityStatus;
  sourcePlatform: string;
  sourceUrl: string | null;
  externalSupplierKey: string | null;
  externalOfferId: string;
  externalSkuId: string | null;
  variantKey: string | null;
  productName: string;
  variantName: string | null;
  currency: string;
  orderUnit: string | null;
  unitsPerOrderUnit: number | null;
  minOrderQuantity: number | null;
  sampleAvailable: boolean | null;
  samplePriceCny: string | null;
  domesticFreightCny: string | null;
  productionLeadTimeDaysMin: number | null;
  productionLeadTimeDaysMax: number | null;
  dispatchLeadTimeDaysMin: number | null;
  dispatchLeadTimeDaysMax: number | null;
  grossWeightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  material: string | null;
  packCount: number | null;
  capturedAt: IsoDateTimeString;
  validUntil: IsoDateTimeString | null;
  snapshotHash: string;
  priceTiers: SupplierOfferPriceTier[];
  createdAt: IsoDateTimeString;
}

export type ProcurementIntentType =
  | 'request_rfq'
  | 'request_sample'
  | 'test_order';

export interface ProcurementTestIntent {
  id: string;
  organizationId: string;
  decisionBatchItemId: string;
  launchCandidateId: string | null;
  supplierOfferSkuSnapshotId: string;
  selectedPriceTierId: string | null;
  sourceRecommendationArtifactId: string;
  requestedByUserId: string;
  reviewedByUserId: string | null;
  intentType: ProcurementIntentType;
  status: 'proposed';
  idempotencyKey: string;
  requestHash: string;
  requestedPurchaseUnits: number | null;
  unitsPerPurchaseUnit: number | null;
  unitsPerSellableBundle: number | null;
  requestedSellableUnits: number | null;
  selectedUnitPriceCny: string | null;
  expectedGoodsTotalCny: string | null;
  currency: string | null;
  expiresAt: IsoDateTimeString | null;
  reviewedAt: IsoDateTimeString | null;
  reviewReason: string | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
  supplierOfferSkuSnapshot?: SupplierOfferSnapshot;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export type CreateDecisionProcurementIntentInput =
  | {
      idempotencyKey: string;
      intentType: 'request_rfq';
      selectedPriceTierId?: string | null;
      requestedOrderUnits?: number | null;
    }
  | {
      idempotencyKey: string;
      intentType: 'request_sample';
      selectedPriceTierId?: string | null;
      requestedOrderUnits: number;
    };

export interface CreateDecisionProcurementIntentResponse {
  intentId: string;
  status: 'proposed';
  duplicate: boolean;
  href: string;
}

export function listSourcingSources(): Promise<SourcingSourceEntitlement[]> {
  return apiClient.get<SourcingSourceEntitlement[]>(
    '/api/sourcing/intelligence/sources',
  );
}

export function listSourcingLaunchCandidates(): Promise<SourcingLaunchCandidate[]> {
  return apiClient.get<SourcingLaunchCandidate[]>(
    '/api/sourcing/intelligence/launch-candidates?limit=40',
  );
}

export function getLatestSourcingDecisionBatch(): Promise<SourcingDecisionBatch | null> {
  // 배치가 아직 없으면 Nest 가 본문 없는 200 을 보낸다. `getNullable` 이 이를 `null` 로
  // 정규화하므로 소비자의 null 가드가 그대로 동작한다.
  return apiClient.getNullable<SourcingDecisionBatch>(
    '/api/sourcing/intelligence/decision-batches/latest',
  );
}

export function runSourcingShadowDecisionBatch(
  input: RunSourcingShadowDecisionBatchInput,
): Promise<RunSourcingShadowDecisionBatchResponse> {
  return apiClient.post<RunSourcingShadowDecisionBatchResponse>(
    '/api/sourcing/intelligence/decision-batches',
    input,
  );
}

export function listSupplierOfferSnapshots(): Promise<
  PaginatedResponse<SupplierOfferSnapshot>
> {
  return apiClient.get<PaginatedResponse<SupplierOfferSnapshot>>(
    '/api/supplier-offer-snapshots?page=1&limit=100',
  );
}

export function listProcurementTestIntents(): Promise<
  PaginatedResponse<ProcurementTestIntent>
> {
  return apiClient.get<PaginatedResponse<ProcurementTestIntent>>(
    '/api/procurement-test-intents?page=1&limit=100',
  );
}

export function createDecisionProcurementIntent(
  decisionItemId: string,
  input: CreateDecisionProcurementIntentInput,
): Promise<CreateDecisionProcurementIntentResponse> {
  return apiClient.post<CreateDecisionProcurementIntentResponse>(
    `/api/sourcing/intelligence/decision-items/${encodeURIComponent(decisionItemId)}/procurement-intents`,
    input,
  );
}
