import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import type {
  SourcingEvidenceLedgerRepositoryPort,
  SourcingEvidenceObservationRecord,
} from '../../../application/port/out/repository/sourcing-evidence-ledger.repository.port';
import {
  readCompleteObservationProvenanceByIds,
  readCurrentObservationHeads,
  type CurrentObservationHead,
} from './source-evidence.reader';

type ObservationRow = CurrentObservationHead;

@Injectable()
export class SourcingEvidenceLedgerRepositoryAdapter implements SourcingEvidenceLedgerRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findObservationsByIds(input: {
    organizationId: string;
    observationIds: string[];
  }): Promise<SourcingEvidenceObservationRecord[]> {
    if (input.observationIds.length === 0) return [];
    const rows = await readCompleteObservationProvenanceByIds(this.prisma, input);
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
    const rows = await readCurrentObservationHeads(this.prisma, {
      organizationId: input.organizationId,
      platform: input.platform.toLowerCase(),
      sourceEntityKeys: Array.from(new Set(input.sourceEntityIds)),
      supportsCandidate: true,
      cutoffAt: input.cutoffAt,
    });
    return rows
      .sort((left, right) => left.sourceEntityKey.localeCompare(right.sourceEntityKey))
      .map(toObservationRecord);
  }

  async findLatestObservationRevisions(input: {
    organizationId: string;
    observationKeys: string[];
    cutoffAt: Date;
  }) {
    if (input.observationKeys.length === 0) return [];
    const keys = Array.from(new Set(input.observationKeys));
    const rows = await readCurrentObservationHeads(this.prisma, {
      organizationId: input.organizationId,
      observationKeys: keys,
      cutoffAt: input.cutoffAt,
    });
    const latest = new Map(rows.map((row) => [row.observationKey, row]));
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

function toObservationRecord(
  row: ObservationRow,
): SourcingEvidenceObservationRecord {
  if (!row.eventAt) {
    throw new Error(`Evidence observation ${row.id} has no eventAt.`);
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    operationId: row.operationId,
    // 리더는 발행된(성공한 수집의) 관측만 낸다(KID-360).
    ingestionRunStatus: 'COMPLETE',
    ingestionRunCoverageBps: calculateRunCoverageBps(row.publication),
    ingestionRunCompletedAt: row.publication.completedAt,
    sourceKey: row.sourceKey,
    sourceScopeKey: row.publication.targetKey,
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

function requiredJsonObject(
  value: Prisma.JsonValue | null,
  id: string,
): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(`Evidence observation ${id} has non-object payload.`);
}
