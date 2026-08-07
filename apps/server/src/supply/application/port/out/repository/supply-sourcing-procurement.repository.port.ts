import type {
  PaginatedSupplySourcingResult,
  ProcurementTestIntentView,
  SupplierOfferSnapshotView,
} from '../../in/procurement/supply-sourcing-procurement.port';
import type {
  ProcurementDecisionContextPolicyRecord,
  ProcurementTestIntentStatus,
  ProcurementTestIntentType,
  SupplierOfferIdentityStatus,
} from '../../../../domain/policy/sourcing-procurement';

export const SUPPLY_SOURCING_PROCUREMENT_REPOSITORY_PORT = Symbol(
  'SUPPLY_SOURCING_PROCUREMENT_REPOSITORY_PORT',
);

export type CreateSupplierOfferSnapshotRecord = Omit<
  SupplierOfferSnapshotView,
  'id' | 'organizationId' | 'priceTiers' | 'createdAt'
> & {
  priceTiers: Array<{
    minQuantity: number;
    maxQuantity: number | null;
    unitPriceCny: string;
  }>;
};

export type CreateProcurementTestIntentRecord = Omit<
  ProcurementTestIntentView,
  | 'id'
  | 'organizationId'
  | 'createdAt'
  | 'updatedAt'
  | 'supplierOfferSkuSnapshot'
  | 'supplierOfferSkuSnapshotId'
  | 'sourceRecommendationArtifactId'
> & {
  supplierOfferSkuSnapshotId: string;
  sourceRecommendationArtifactId: string;
};

export type ProcurementDecisionContextView =
  ProcurementDecisionContextPolicyRecord & {
    decision: string;
    executionEligible: boolean;
    decisionBatchStatus: string;
    decisionBatchExpiresAt: Date;
  };

export type CreateSupplierOfferSnapshotRepositoryResult =
  | { kind: 'created'; snapshot: SupplierOfferSnapshotView }
  | { kind: 'duplicate'; snapshot: SupplierOfferSnapshotView }
  | { kind: 'source_entitlement_not_found' }
  | { kind: 'source_entitlement_version_mismatch' }
  | { kind: 'source_entitlement_retain_denied' }
  | { kind: 'supplier_not_found' }
  | { kind: 'evidence_observation_not_found' }
  | { kind: 'evidence_observation_mismatch' }
  | { kind: 'evidence_observation_not_terminal' }
  | { kind: 'evidence_observation_not_latest' }
  | { kind: 'evidence_payload_mismatch' };

export type CreateProcurementTestIntentRepositoryResult =
  | { kind: 'created'; intent: ProcurementTestIntentView }
  | { kind: 'duplicate'; intent: ProcurementTestIntentView }
  | { kind: 'source_entitlement_not_found' }
  | { kind: 'source_entitlement_version_mismatch' }
  | { kind: 'source_entitlement_retain_denied' }
  | { kind: 'source_entitlement_execution_denied' }
  | { kind: 'source_quality_not_execution_eligible' }
  | { kind: 'idempotency_conflict' }
  | { kind: 'idempotency_actor_mismatch' }
  | { kind: 'actor_not_active' }
  | { kind: 'decision_batch_item_not_found' }
  | { kind: 'decision_artifact_mismatch' }
  | { kind: 'decision_reference_mismatch' }
  | { kind: 'decision_batch_expired' }
  | { kind: 'decision_batch_not_active' }
  | { kind: 'decision_rejected' }
  | { kind: 'decision_not_execution_eligible' }
  | { kind: 'launch_candidate_not_found' }
  | { kind: 'quantity_conservation_mismatch' };

export interface SupplySourcingProcurementRepositoryPort {
  createOfferSnapshot(
    organizationId: string,
    record: CreateSupplierOfferSnapshotRecord,
  ): Promise<CreateSupplierOfferSnapshotRepositoryResult>;
  findOfferSnapshot(
    organizationId: string,
    id: string,
  ): Promise<SupplierOfferSnapshotView | null>;
  listOfferSnapshots(input: {
    organizationId: string;
    page: number;
    limit: number;
    identityStatus?: SupplierOfferIdentityStatus;
    sourcePlatform?: string;
  }): Promise<PaginatedSupplySourcingResult<SupplierOfferSnapshotView>>;
  /** 외부 오퍼 식별자로 스냅샷을 되찾는다. 소싱이 후보와 오퍼를 서버에서 이어붙일 때 쓴다. */
  findOfferSnapshotsByExternalOffer(input: {
    organizationId: string;
    sourcePlatform: string;
    externalOfferIds: string[];
  }): Promise<SupplierOfferSnapshotView[]>;
  createTestIntent(
    organizationId: string,
    record: CreateProcurementTestIntentRecord,
  ): Promise<CreateProcurementTestIntentRepositoryResult>;
  findProcurementDecisionContext(
    organizationId: string,
    decisionBatchItemId: string,
  ): Promise<ProcurementDecisionContextView | null>;
  findTestIntentByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<ProcurementTestIntentView | null>;
  findTestIntent(
    organizationId: string,
    id: string,
  ): Promise<ProcurementTestIntentView | null>;
  listTestIntents(input: {
    organizationId: string;
    page: number;
    limit: number;
    intentType?: ProcurementTestIntentType;
    status?: ProcurementTestIntentStatus;
  }): Promise<PaginatedSupplySourcingResult<ProcurementTestIntentView>>;
}
