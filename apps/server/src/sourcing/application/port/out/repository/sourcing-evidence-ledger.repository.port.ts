import type { SourcingBrowserSourceAttempt } from './sourcing-browser-source-attempt.repository.port';

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

export type SourcingEvidenceRunStatus = SourcingBrowserSourceAttempt['state'];

export interface SourcingEvidenceObservationRecord {
  id: string;
  organizationId: string;
  ingestionRunId: string;
  ingestionRunStatus: SourcingEvidenceRunStatus;
  ingestionRunCoverageBps: number | null;
  ingestionRunCompletedAt: Date | null;
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

export interface AppendSourcingEvidenceObservationCommand {
  organizationId: string;
  ingestionRunId: string;
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
  sourceUrl: string | null;
  eventAt: Date;
  observedAt: Date;
  availableAt: Date;
  revisionAt: Date | null;
  payloadHash: string;
  rawPayload: Record<string, unknown>;
  ingestedAt: Date;
}

export interface SourcingEvidenceLedgerRepositoryPort {

  findObservationsByIds(input: {
    organizationId: string;
    observationIds: string[];
  }): Promise<SourcingEvidenceObservationRecord[]>;

  /**
   * Returns the latest revision in the current COMPLETE publication that was
   * visible at the cutoff. Historical IDs remain available through the exact
   * provenance lookup but cannot silently become current supporting evidence.
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
   * 최신 리비전 여부·run 확정·개념키 일치는 `evidenceIsAdmissible` 가
   * 그대로 다시 판정한다.
   */
  findCandidateSupportingObservations(input: {
    organizationId: string;
    platform: string;
    sourceEntityIds: string[];
    cutoffAt: Date;
  }): Promise<SourcingEvidenceObservationRecord[]>;
}
