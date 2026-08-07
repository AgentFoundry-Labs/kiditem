import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashSourcingIntelligenceJson } from '../../domain/sourcing-intelligence-hash';
import {
  SOURCING_EVIDENCE_LEDGER_REPOSITORY_PORT,
  type AppendSourcingEvidenceObservationCommand,
  type SourcingEvidenceGranularity,
  type SourcingEvidenceLedgerRepositoryPort,
  type SourcingEvidenceRunStatus,
  type SourcingEvidenceSignalRole,
} from '../port/out/repository/sourcing-evidence-ledger.repository.port';
import { SourcingSourceRegistryService } from './sourcing-source-registry.service';

const POSTGRES_INT_MAX = 2_147_483_647;

export interface AppendSourcingEvidenceObservationInput {
  platform: string;
  evidenceFamily: string;
  signalRole: SourcingEvidenceSignalRole;
  granularity: SourcingEvidenceGranularity;
  conceptKey?: string | null;
  sourceEntityType: string;
  sourceEntityId: string;
  schemaVersion: string;
  observationKey: string;
  revision?: number;
  supportsCandidate?: boolean;
  sourceUrl?: string | null;
  eventAt: Date;
  observedAt: Date;
  availableAt: Date;
  revisionAt?: Date | null;
  rawPayload: Record<string, unknown>;
}

@Injectable()
export class SourcingEvidenceLedgerService {
  constructor(
    @Inject(SOURCING_EVIDENCE_LEDGER_REPOSITORY_PORT)
    private readonly repository: SourcingEvidenceLedgerRepositoryPort,
    private readonly sources: SourcingSourceRegistryService,
  ) {}

  async startRun(input: {
    organizationId: string;
    sourceKey: string;
    runKey: string;
    scopeKey: string;
    collectorVersion: string;
    triggeredByUserId: string;
    windowStartAt?: Date | null;
    windowEndAt?: Date | null;
    expectedCount?: number | null;
  }) {
    assertDateOrder(input.windowStartAt, input.windowEndAt, 'collection window');
    const requestedScopeKey = requiredText(input.scopeKey, 'scopeKey');
    const authorization = await this.sources.authorize({
      organizationId: input.organizationId,
      sourceKey: input.sourceKey,
      scopeKey: requestedScopeKey,
      operation: 'collect',
    });
    if (!authorization.allowed || !authorization.entitlement) {
      throw new BadRequestException({
        code: 'source_collection_not_authorized',
        reason: authorization.reasonCode,
      });
    }

    const startedAt = new Date();
    const normalized = {
      organizationId: input.organizationId,
      sourceEntitlementVersionId: authorization.entitlement.id,
      sourceKey: authorization.entitlement.sourceKey,
      runKey: requiredText(input.runKey, 'runKey'),
      scopeKey: authorization.entitlement.scopeKey,
      collectorVersion: requiredText(input.collectorVersion, 'collectorVersion'),
      triggeredByUserId: requiredText(
        input.triggeredByUserId,
        'triggeredByUserId',
      ),
      decisionImpactAtIngest: authorization.entitlement.decisionImpact,
      windowStartAt: input.windowStartAt ?? null,
      windowEndAt: input.windowEndAt ?? null,
      expectedCount: nullableNonNegativeInteger(input.expectedCount, 'expectedCount'),
      startedAt,
    };
    const result = await this.repository.startRun({
      ...normalized,
      requestHash: hashSourcingIntelligenceJson({
        ...normalized,
        windowStartAt: normalized.windowStartAt?.toISOString() ?? null,
        windowEndAt: normalized.windowEndAt?.toISOString() ?? null,
        startedAt: null,
      }),
    });
    if (result.kind === 'idempotency_conflict') {
      throw new ConflictException('Evidence run idempotency key was reused with different input');
    }
    return result;
  }

  async appendObservations(input: {
    organizationId: string;
    runId: string;
    observations: AppendSourcingEvidenceObservationInput[];
  }) {
    if (input.observations.length === 0) {
      throw new BadRequestException('At least one observation is required');
    }
    const run = await this.repository.getRun({
      organizationId: input.organizationId,
      runId: input.runId,
    });
    if (!run) throw new NotFoundException('Evidence ingestion run not found');
    if (run.status !== 'collecting') {
      throw new ConflictException(`Evidence ingestion run is ${run.status}`);
    }

    const authorization = await this.sources.authorize({
      organizationId: input.organizationId,
      sourceKey: run.sourceKey,
      scopeKey: run.scopeKey,
      operation: 'collect',
    });
    if (!authorization.allowed || !authorization.entitlement) {
      throw new BadRequestException({
        code: 'source_collection_not_authorized',
        reason: authorization.reasonCode,
      });
    }
    if (authorization.entitlement.id !== run.sourceEntitlementVersionId) {
      throw new ConflictException(
        'Source entitlement changed or is no longer collectable; start a new evidence run',
      );
    }

    const ingestedAt = new Date();
    const commands = input.observations.map((observation) =>
      toObservationCommand({
        organizationId: input.organizationId,
        run,
        observation,
        ingestedAt,
      }),
    );
    const result = await this.repository.appendObservations(commands);
    if (result.kind === 'run_not_found') {
      throw new NotFoundException('Evidence ingestion run not found');
    }
    if (result.kind === 'run_not_collecting') {
      throw new ConflictException(`Evidence ingestion run is ${result.status}`);
    }
    if (result.kind === 'source_entitlement_changed') {
      throw new ConflictException(
        'Source entitlement changed or is no longer collectable; start a new evidence run',
      );
    }
    if (result.kind === 'observation_revision_gap') {
      throw new ConflictException(
        `Observation ${result.observationKey} revision ${result.revision} is missing its predecessor`,
      );
    }
    if (result.kind === 'observation_series_mismatch') {
      throw new ConflictException(
        `Observation ${result.observationKey} revision ${result.revision} changes immutable series identity`,
      );
    }
    if (result.kind === 'observation_conflict') {
      throw new ConflictException(
        `Observation ${result.observationKey} revision ${result.revision} has different payload`,
      );
    }
    return result;
  }

  async finalizeRun(input: {
    organizationId: string;
    runId: string;
    status: Exclude<SourcingEvidenceRunStatus, 'collecting'>;
    coverageBps?: number | null;
    watermarkEventAt?: Date | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }) {
    if (
      input.coverageBps != null &&
      (!Number.isInteger(input.coverageBps) || input.coverageBps < 0 || input.coverageBps > 10_000)
    ) {
      throw new BadRequestException('coverageBps must be an integer between 0 and 10000');
    }
    if (
      (input.status === 'failed' || input.status === 'quarantined') &&
      !input.errorCode?.trim()
    ) {
      throw new BadRequestException('errorCode is required for failed or quarantined runs');
    }
    const result = await this.repository.finalizeRun({
      organizationId: input.organizationId,
      runId: input.runId,
      status: input.status,
      coverageBps: input.coverageBps ?? null,
      watermarkEventAt: input.watermarkEventAt ?? null,
      errorCode: optionalText(input.errorCode),
      errorMessage: optionalText(input.errorMessage),
      completedAt: new Date(),
    });
    if (result.kind === 'not_found') {
      throw new NotFoundException('Evidence ingestion run not found');
    }
    if (result.kind === 'source_entitlement_changed') {
      throw new ConflictException(
        'Source entitlement changed or is no longer collectable; close the run as failed or quarantined',
      );
    }
    if (result.kind === 'coverage_mismatch') {
      throw new BadRequestException({
        code: 'evidence_run_coverage_mismatch',
        message:
          'coverageBps must equal the server-derived accepted/expected coverage',
        derivedCoverageBps: result.derivedCoverageBps,
      });
    }
    return result;
  }

  async getRun(organizationId: string, runId: string) {
    const run = await this.repository.getRun({ organizationId, runId });
    if (!run) throw new NotFoundException('Evidence ingestion run not found');
    return run;
  }
}

function toObservationCommand(input: {
  organizationId: string;
  run: {
    id: string;
    sourceEntitlementVersionId: string;
    sourceKey: string;
    decisionImpactAtIngest: 'disabled' | 'enabled';
  };
  observation: AppendSourcingEvidenceObservationInput;
  ingestedAt: Date;
}): AppendSourcingEvidenceObservationCommand {
  const observation = input.observation;
  assertValidDate(observation.eventAt, 'eventAt');
  assertValidDate(observation.observedAt, 'observedAt');
  assertValidDate(observation.availableAt, 'availableAt');
  if (observation.revisionAt) assertValidDate(observation.revisionAt, 'revisionAt');
  if (observation.observedAt.getTime() < observation.eventAt.getTime()) {
    throw new BadRequestException('observedAt cannot be before eventAt');
  }
  if (observation.availableAt.getTime() < observation.observedAt.getTime()) {
    throw new BadRequestException('availableAt cannot be before observedAt');
  }
  const revision = observation.revision ?? 1;
  if (
    !Number.isSafeInteger(revision) ||
    revision <= 0 ||
    revision > POSTGRES_INT_MAX
  ) {
    throw new BadRequestException(
      `revision must be a positive integer no greater than ${POSTGRES_INT_MAX}`,
    );
  }
  const rawPayload = observation.rawPayload;
  const payloadHash = hashSourcingIntelligenceJson(rawPayload);
  return {
    organizationId: input.organizationId,
    ingestionRunId: input.run.id,
    sourceEntitlementVersionId: input.run.sourceEntitlementVersionId,
    sourceKey: input.run.sourceKey,
    platform: normalizedKey(observation.platform, 'platform'),
    evidenceFamily: normalizedKey(observation.evidenceFamily, 'evidenceFamily'),
    signalRole: observation.signalRole,
    granularity: observation.granularity,
    conceptKey: optionalKey(observation.conceptKey),
    sourceEntityType: normalizedKey(observation.sourceEntityType, 'sourceEntityType'),
    sourceEntityId: requiredText(observation.sourceEntityId, 'sourceEntityId'),
    schemaVersion: requiredText(observation.schemaVersion, 'schemaVersion'),
    observationKey: requiredText(observation.observationKey, 'observationKey'),
    revision,
    supportsCandidate: observation.supportsCandidate ?? false,
    decisionImpactAtIngest: input.run.decisionImpactAtIngest,
    sourceUrl: optionalText(observation.sourceUrl),
    eventAt: observation.eventAt,
    observedAt: observation.observedAt,
    availableAt: observation.availableAt,
    revisionAt: observation.revisionAt ?? null,
    payloadHash,
    rawPayload,
    ingestedAt: input.ingestedAt,
  };
}

function assertDateOrder(
  start: Date | null | undefined,
  end: Date | null | undefined,
  label: string,
) {
  if (start) assertValidDate(start, `${label} start`);
  if (end) assertValidDate(end, `${label} end`);
  if (start && end && start.getTime() > end.getTime()) {
    throw new BadRequestException(`${label} start cannot be after end`);
  }
}

function assertValidDate(value: Date, field: string) {
  if (!Number.isFinite(value.getTime())) {
    throw new BadRequestException(`${field} must be a valid date`);
  }
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new BadRequestException(`${field} is required`);
  return normalized;
}

function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizedKey(value: string, field: string): string {
  return requiredText(value, field).toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
}

function optionalKey(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized
    ? normalized.toLowerCase().replace(/[^\p{L}\p{N}._:-]+/gu, '_')
    : null;
}

function nullableNonNegativeInteger(
  value: number | null | undefined,
  field: string,
): number | null {
  if (value == null) return null;
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > POSTGRES_INT_MAX
  ) {
    throw new BadRequestException(
      `${field} must be a non-negative integer no greater than ${POSTGRES_INT_MAX}`,
    );
  }
  return value;
}
