export const SOURCING_LAUNCH_CANDIDATE_REPOSITORY_PORT = Symbol(
  'SourcingLaunchCandidateRepositoryPort',
);

export const SOURCING_GATE_STATUSES = ['not_evaluated', 'unknown', 'passed', 'blocked'] as const;
export type SourcingGateStatus = (typeof SOURCING_GATE_STATUSES)[number];

export const SOURCING_ECONOMICS_STATUSES = ['unknown', 'known', 'blocked'] as const;
export type SourcingEconomicsStatus =
  (typeof SOURCING_ECONOMICS_STATUSES)[number];

export interface SourcingLaunchCandidateRecord {
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
  validUntil: Date | null;
  createdByUserId: string;
  createdAt: Date;
}

export type CreateSourcingLaunchCandidateCommand = Omit<
  SourcingLaunchCandidateRecord,
  'id' | 'version' | 'createdAt'
>;

export type CreateSourcingLaunchCandidateResult =
  | { kind: 'created'; duplicate: false; record: SourcingLaunchCandidateRecord }
  | { kind: 'existing'; duplicate: true; record: SourcingLaunchCandidateRecord }
  | { kind: 'target_channel_account_invalid' }
  | { kind: 'source_candidate_not_found' };

export interface SourcingLaunchCandidateRepositoryPort {
  createVersion(
    command: CreateSourcingLaunchCandidateCommand,
  ): Promise<CreateSourcingLaunchCandidateResult>;

  findById(input: {
    organizationId: string;
    id: string;
  }): Promise<SourcingLaunchCandidateRecord | null>;

  findByIds(input: {
    organizationId: string;
    ids: string[];
  }): Promise<SourcingLaunchCandidateRecord[]>;

  list(input: {
    organizationId: string;
    productConceptVersionKey?: string;
    limit: number;
  }): Promise<SourcingLaunchCandidateRecord[]>;

  /**
   * 공급 오퍼 스냅샷으로 출시 후보를 되찾는다. 결정 배치가 후보↔오퍼↔출시후보를
   * 서버에서 이어붙일 때 쓴다. 같은 오퍼에 여러 버전이 있으면 최신이 앞에 온다.
   */
  findBySupplierOfferSnapshotIds(input: {
    organizationId: string;
    supplierOfferSkuSnapshotIds: string[];
  }): Promise<SourcingLaunchCandidateRecord[]>;
}
