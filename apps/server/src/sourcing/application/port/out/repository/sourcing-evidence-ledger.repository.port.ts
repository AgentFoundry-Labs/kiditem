import type { SourceEntitlementDecisionImpact } from '../../../../domain/source-entitlement-policy';

export const SOURCING_EVIDENCE_LEDGER_REPOSITORY_PORT = Symbol(
  'SourcingEvidenceLedgerRepositoryPort',
);

export const SOURCING_EVIDENCE_GRANULARITIES = [
  'exact_own',
  'exact_consented',
  'aggregate_official',
  'supply_catalog',
  'compliance_proxy',
  'inferred_observation',
] as const;

export type SourcingEvidenceGranularity =
  (typeof SOURCING_EVIDENCE_GRANULARITIES)[number];

export const SOURCING_EVIDENCE_SIGNAL_ROLES = [
  'demand',
  'supply',
  'risk',
  'compliance',
  'execution',
  'outcome',
] as const;

export type SourcingEvidenceSignalRole =
  (typeof SOURCING_EVIDENCE_SIGNAL_ROLES)[number];

export const SOURCING_EVIDENCE_RUN_STATUSES = [
  'collecting',
  'complete',
  'partial',
  'failed',
  'quarantined',
] as const;

export type SourcingEvidenceRunStatus =
  (typeof SOURCING_EVIDENCE_RUN_STATUSES)[number];

export interface SourcingEvidenceIngestionRunRecord {
  id: string;
  organizationId: string;
  sourceEntitlementVersionId: string;
  sourceKey: string;
  runKey: string;
  requestHash: string;
  scopeKey: string;
  collectorVersion: string;
  triggeredByUserId: string | null;
  decisionImpactAtIngest: SourceEntitlementDecisionImpact;
  status: SourcingEvidenceRunStatus;
  windowStartAt: Date | null;
  windowEndAt: Date | null;
  expectedCount: number | null;
  observedCount: number;
  coverageBps: number | null;
  watermarkEventAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SourcingEvidenceObservationRecord {
  id: string;
  organizationId: string;
  ingestionRunId: string;
  ingestionRunStatus: SourcingEvidenceRunStatus;
  ingestionRunCoverageBps: number | null;
  ingestionRunCompletedAt: Date | null;
  sourceEntitlementVersionId: string;
  sourceKey: string;
  sourceScopeKey: string;
  platform: string;
  evidenceFamily: string;
  signalRole: SourcingEvidenceSignalRole;
  granularity: SourcingEvidenceGranularity;
  conceptKey: string | null;
  sourceEntityType: string;
  sourceEntityId: string;
  schemaVersion: string;
  observationKey: string;
  revision: number;
  supportsCandidate: boolean;
  decisionImpactAtIngest: SourceEntitlementDecisionImpact;
  sourceUrl: string | null;
  eventAt: Date;
  observedAt: Date;
  availableAt: Date;
  revisionAt: Date | null;
  payloadHash: string;
  rawPayload: Record<string, unknown>;
  ingestedAt: Date;
}

export interface SourcingLatestObservationRevisionRecord {
  observationKey: string;
  observationId: string;
  revision: number;
}

export interface StartSourcingEvidenceRunCommand {
  organizationId: string;
  sourceEntitlementVersionId: string;
  sourceKey: string;
  runKey: string;
  requestHash: string;
  scopeKey: string;
  collectorVersion: string;
  triggeredByUserId: string;
  decisionImpactAtIngest: SourceEntitlementDecisionImpact;
  windowStartAt: Date | null;
  windowEndAt: Date | null;
  expectedCount: number | null;
  startedAt: Date;
}

export type StartSourcingEvidenceRunResult =
  | { kind: 'created'; duplicate: false; record: SourcingEvidenceIngestionRunRecord }
  | { kind: 'existing'; duplicate: true; record: SourcingEvidenceIngestionRunRecord }
  | { kind: 'idempotency_conflict' };

export interface AppendSourcingEvidenceObservationCommand {
  organizationId: string;
  ingestionRunId: string;
  sourceEntitlementVersionId: string;
  sourceKey: string;
  platform: string;
  evidenceFamily: string;
  signalRole: SourcingEvidenceSignalRole;
  granularity: SourcingEvidenceGranularity;
  conceptKey: string | null;
  sourceEntityType: string;
  sourceEntityId: string;
  schemaVersion: string;
  observationKey: string;
  revision: number;
  supportsCandidate: boolean;
  decisionImpactAtIngest: SourceEntitlementDecisionImpact;
  sourceUrl: string | null;
  eventAt: Date;
  observedAt: Date;
  availableAt: Date;
  revisionAt: Date | null;
  payloadHash: string;
  rawPayload: Record<string, unknown>;
  ingestedAt: Date;
}

export type AppendSourcingEvidenceObservationsResult =
  | {
      kind: 'appended';
      records: SourcingEvidenceObservationRecord[];
      duplicateCount: number;
    }
  | { kind: 'run_not_found' }
  | { kind: 'run_not_collecting'; status: SourcingEvidenceRunStatus }
  | { kind: 'source_entitlement_changed' }
  | { kind: 'observation_revision_gap'; observationKey: string; revision: number }
  | { kind: 'observation_series_mismatch'; observationKey: string; revision: number }
  | { kind: 'observation_conflict'; observationKey: string; revision: number };

export interface FinalizeSourcingEvidenceRunCommand {
  organizationId: string;
  runId: string;
  status: Exclude<SourcingEvidenceRunStatus, 'collecting'>;
  coverageBps: number | null;
  watermarkEventAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  completedAt: Date;
}

export type FinalizeSourcingEvidenceRunResult =
  | { kind: 'finalized'; record: SourcingEvidenceIngestionRunRecord }
  | { kind: 'not_found' }
  | { kind: 'source_entitlement_changed' }
  | { kind: 'coverage_mismatch'; derivedCoverageBps: number | null }
  | { kind: 'already_terminal'; record: SourcingEvidenceIngestionRunRecord };

export interface SourcingEvidenceLedgerRepositoryPort {
  startRun(
    command: StartSourcingEvidenceRunCommand,
  ): Promise<StartSourcingEvidenceRunResult>;

  getRun(input: {
    organizationId: string;
    runId: string;
  }): Promise<SourcingEvidenceIngestionRunRecord | null>;

  appendObservations(
    commands: AppendSourcingEvidenceObservationCommand[],
  ): Promise<AppendSourcingEvidenceObservationsResult>;

  finalizeRun(
    command: FinalizeSourcingEvidenceRunCommand,
  ): Promise<FinalizeSourcingEvidenceRunResult>;

  findObservationsByIds(input: {
    organizationId: string;
    observationIds: string[];
  }): Promise<SourcingEvidenceObservationRecord[]>;

  /**
   * Returns the absolute latest revision visible at the point-in-time cutoff.
   * Terminal run admissibility is evaluated separately so a quarantined newer
   * correction cannot silently revive an older positive observation.
   */
  findLatestObservationRevisions(input: {
    organizationId: string;
    observationKeys: string[];
    cutoffAt: Date;
  }): Promise<SourcingLatestObservationRevisionRecord[]>;

  /**
   * 후보 지지를 주장하는 관측치를 외부 엔티티 식별자로 되찾는다. 결정 배치가 후보와
   * 증거를 서버에서 이어붙일 때 쓴다.
   *
   * 여기서 돌려주는 것은 "후보가 될 수 있는" 관측치일 뿐 채택된 증거가 아니다.
   * 최신 리비전 여부·entitlement·run 확정·개념키 일치는 `evidenceIsAdmissible` 가
   * 그대로 다시 판정한다.
   */
  findCandidateSupportingObservations(input: {
    organizationId: string;
    platform: string;
    sourceEntityIds: string[];
    cutoffAt: Date;
  }): Promise<SourcingEvidenceObservationRecord[]>;
}
