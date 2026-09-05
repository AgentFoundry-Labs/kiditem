import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import type {
  SourcingEvidenceIngestionRunRecord,
  SourcingEvidenceLedgerRepositoryPort,
  SourcingEvidenceObservationRecord,
  SourcingEvidenceRunStatus,
} from '../../../application/port/out/repository/sourcing-evidence-ledger.repository.port';

const runInclude = {} satisfies Prisma.SourcingEvidenceIngestionRunInclude;

const observationInclude = {
  ingestionRun: {
    select: {
      status: true,
      targetKey: true,
      coverageNumerator: true,
      coverageDenominator: true,
      qualityReport: true,
      completedAt: true,
    },
  },
} satisfies Prisma.SourcingEvidenceObservationInclude;

type RunRow = Prisma.SourcingEvidenceIngestionRunGetPayload<{
  include: typeof runInclude;
}>;

type ObservationRow = Prisma.SourcingEvidenceObservationGetPayload<{
  include: typeof observationInclude;
}>;

@Injectable()
export class SourcingEvidenceLedgerRepositoryAdapter implements SourcingEvidenceLedgerRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async getRun(input: {
    organizationId: string;
    runId: string;
  }): Promise<SourcingEvidenceIngestionRunRecord | null> {
    const row = await this.prisma.sourcingEvidenceIngestionRun.findFirst({
      where: { id: input.runId, organizationId: input.organizationId },
      include: runInclude,
    });
    return row ? toRunRecord(row) : null;
  }

  async findObservationsByIds(input: {
    organizationId: string;
    observationIds: string[];
  }): Promise<SourcingEvidenceObservationRecord[]> {
    if (input.observationIds.length === 0) return [];
    const rows = await this.prisma.sourcingEvidenceObservation.findMany({
      where: {
        id: { in: input.observationIds },
        organizationId: input.organizationId,
        ingestionRun: { status: 'COMPLETE' },
      },
      include: observationInclude,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return input.observationIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toObservationRecord(row)] : [];
    });
  }

  async findCandidateSupportingObservations(input: {
    organizationId: string;
    platform: string;
    sourceEntityIds: string[];
    cutoffAt: Date;
  }): Promise<SourcingEvidenceObservationRecord[]> {
    if (input.sourceEntityIds.length === 0) return [];
    const rows = await this.prisma.sourcingEvidenceObservation.findMany({
      where: {
        organizationId: input.organizationId,
        platform: input.platform.toLowerCase(),
        sourceEntityKey: { in: Array.from(new Set(input.sourceEntityIds)) },
        supportsCandidate: true,
        ingestionRun: { status: 'COMPLETE', isCurrentComplete: true, completedAt: { lte: input.cutoffAt } },
        // 시점 고정: cutoff 이후에 도착한 관측치는 이 배치가 보지 못한 것으로 둔다.
        availableAt: { lte: input.cutoffAt },
        ingestedAt: { lte: input.cutoffAt },
      },
      include: observationInclude,
      orderBy: [
        { sourceEntityKey: 'asc' },
        { revision: 'desc' },
        { availableAt: 'desc' },
        { ingestedAt: 'desc' },
        { id: 'desc' },
      ],
    });
    return rows.map(toObservationRecord);
  }

  async findLatestObservationRevisions(input: {
    organizationId: string;
    observationKeys: string[];
    cutoffAt: Date;
  }) {
    if (input.observationKeys.length === 0) return [];
    const keys = Array.from(new Set(input.observationKeys));
    const rows = await this.prisma.sourcingEvidenceObservation.findMany({
      where: {
        organizationId: input.organizationId,
        observationKey: { in: keys },
        ingestionRun: { status: 'COMPLETE', isCurrentComplete: true, completedAt: { lte: input.cutoffAt } },
        availableAt: { lte: input.cutoffAt },
        ingestedAt: { lte: input.cutoffAt },
      },
      select: {
        id: true,
        observationKey: true,
        revision: true,
      },
      orderBy: [
        { observationKey: 'asc' },
        { revision: 'desc' },
        { availableAt: 'desc' },
        { ingestedAt: 'desc' },
        { id: 'desc' },
      ],
    });
    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latest.has(row.observationKey)) latest.set(row.observationKey, row);
    }
    return keys.flatMap((observationKey) => {
      const row = latest.get(observationKey);
      return row
        ? [
            {
              observationKey,
              observationId: row.id,
              revision: row.revision,
            },
          ]
        : [];
    });
  }
}

function toRunRecord(row: RunRow): SourcingEvidenceIngestionRunRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    sourceKey: row.sourceKey,
    runKey: row.idempotencyKey,
    requestHash: row.requestHash,
    scopeKey: row.targetKey,
    collectorVersion: row.collectorVersion,
    triggeredByUserId: row.triggeredByUserId,
    status: fromDatabaseRunStatus(row.status),
    windowStartAt: row.sourceWindowStartAt,
    windowEndAt: row.sourceWindowEndAt,
    expectedCount: row.coverageDenominator,
    observedCount: row.acceptedCount,
    coverageBps: coverageBps(row),
    watermarkEventAt: parseOptionalDate(row.watermarkAfter),
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toObservationRecord(
  row: ObservationRow,
): SourcingEvidenceObservationRecord {
  if (!row.eventAt) {
    throw new Error(`Evidence observation ${row.id} has no eventAt.`);
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    ingestionRunId: row.ingestionRunId,
    ingestionRunStatus: fromDatabaseRunStatus(row.ingestionRun.status),
    ingestionRunCoverageBps: runCoverageBps(row.ingestionRun),
    ingestionRunCompletedAt: row.ingestionRun.completedAt,
    sourceKey: row.sourceKey,
    sourceScopeKey: row.ingestionRun.targetKey,
    platform: row.platform,
    evidenceFamily: row.evidenceFamily,
    signalRole:
      row.signalRole as SourcingEvidenceObservationRecord['signalRole'],
    granularity:
      row.evidenceClass as SourcingEvidenceObservationRecord['granularity'],
    conceptKey: row.conceptKey,
    sourceEntityType: row.sourceEntityType,
    sourceEntityId: row.sourceEntityKey,
    schemaVersion: row.schemaVersion,
    observationKey: row.observationKey,
    revision: row.revision,
    supportsCandidate: row.supportsCandidate,
    sourceUrl: row.sourceUrl,
    eventAt: row.eventAt,
    observedAt: row.observedAt,
    availableAt: row.availableAt,
    revisionAt: row.revisionAt,
    payloadHash: row.payloadHash,
    rawPayload: requiredJsonObject(row.payload, row.id),
    ingestedAt: row.ingestedAt,
  };
}

function fromDatabaseRunStatus(status: string): SourcingEvidenceRunStatus {
  if (status === 'RUNNING' || status === 'COMPLETE' || status === 'FAILED') return status;
  throw new Error(`Unsupported evidence run status: ${status}`);
}

function coverageBps(row: RunRow): number | null {
  return calculateRunCoverageBps(row);
}

function runCoverageBps(row: {
  qualityReport: Prisma.JsonValue | null;
  coverageNumerator: number | null;
  coverageDenominator: number | null;
}): number | null {
  return calculateRunCoverageBps(row);
}

function calculateRunCoverageBps(row: {
  coverageNumerator: number | null;
  coverageDenominator: number | null;
}): number | null {
  if (
    row.coverageNumerator === null ||
    row.coverageDenominator === null ||
    !Number.isSafeInteger(row.coverageNumerator) ||
    !Number.isSafeInteger(row.coverageDenominator) ||
    row.coverageNumerator < 0 ||
    row.coverageDenominator <= 0 ||
    row.coverageNumerator > row.coverageDenominator
  ) {
    return null;
  }
  return Math.round((row.coverageNumerator / row.coverageDenominator) * 10_000);
}

function parseOptionalDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function requiredJsonObject(
  value: Prisma.JsonValue | null,
  id: string,
): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(`Evidence observation ${id} has non-object payload.`);
}
