import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import type {
  AppendSourcingEvidenceObservationCommand,
  AppendSourcingEvidenceObservationsResult,
  FinalizeSourcingEvidenceRunCommand,
  FinalizeSourcingEvidenceRunResult,
  SourcingEvidenceIngestionRunRecord,
  SourcingEvidenceLedgerRepositoryPort,
  SourcingEvidenceObservationRecord,
  SourcingEvidenceRunStatus,
  StartSourcingEvidenceRunCommand,
  StartSourcingEvidenceRunResult,
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

  startRun(
    command: StartSourcingEvidenceRunCommand,
  ): Promise<StartSourcingEvidenceRunResult> {
    return this.prisma.$transaction(async (tx) => {
      await lockRunKey(tx, command.organizationId, command.runKey);
      const existing = await tx.sourcingEvidenceIngestionRun.findFirst({
        where: {
          organizationId: command.organizationId,
          idempotencyKey: command.runKey,
        },
        include: runInclude,
      });
      if (existing) {
        if (existing.requestHash !== command.requestHash) {
          return { kind: 'idempotency_conflict' };
        }
        return {
          kind: 'existing',
          duplicate: true,
          record: toRunRecord(existing),
        };
      }

      const row = await tx.sourcingEvidenceIngestionRun.create({
        data: {
          organizationId: command.organizationId,
          sourceKey: command.sourceKey,
          scopeKey: command.scopeKey,
          targetKey: command.scopeKey,
          idempotencyKey: command.runKey,
          requestHash: command.requestHash,
          collectorKey: command.sourceKey,
          collectorVersion: command.collectorVersion,
          triggerKind: 'collector',
          triggeredByUserId: command.triggeredByUserId,
          status: 'collecting',
          sourceWindowStartAt: command.windowStartAt,
          sourceWindowEndAt: command.windowEndAt,
          coverageNumerator: 0,
          coverageDenominator: command.expectedCount,
          qualityReport: { coverageBps: null },
          startedAt: command.startedAt,
        },
        include: runInclude,
      });
      return { kind: 'created', duplicate: false, record: toRunRecord(row) };
    });
  }

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

  appendObservations(
    commands: AppendSourcingEvidenceObservationCommand[],
  ): Promise<AppendSourcingEvidenceObservationsResult> {
    if (commands.length === 0) {
      return Promise.resolve({
        kind: 'appended',
        records: [],
        duplicateCount: 0,
      });
    }
    assertSingleRunScope(commands);

    const first = commands[0];
    return this.prisma.$transaction(async (tx) => {
      await lockRunRow(tx, first.organizationId, first.ingestionRunId);
      const run = await tx.sourcingEvidenceIngestionRun.findFirst({
        where: {
          id: first.ingestionRunId,
          organizationId: first.organizationId,
        },
        include: runInclude,
      });
      if (!run) return { kind: 'run_not_found' };

      const transactionAt = await databaseClock(tx);

      const runStatus = fromDatabaseRunStatus(run.status);
      if (runStatus !== 'collecting') {
        return { kind: 'run_not_collecting', status: runStatus };
      }
      assertAppendCommandsMatchRun(commands, run);

      const uniqueCommands = new Map<
        string,
        AppendSourcingEvidenceObservationCommand
      >();
      let duplicateCount = 0;
      for (const command of commands) {
        const key = observationRevisionKey(
          command.observationKey,
          command.revision,
        );
        const prior = uniqueCommands.get(key);
        if (!prior) {
          uniqueCommands.set(key, command);
          continue;
        }
        if (prior.payloadHash !== command.payloadHash) {
          return {
            kind: 'observation_conflict',
            observationKey: command.observationKey,
            revision: command.revision,
          };
        }
        if (!observationCommandEnvelopeMatches(prior, command)) {
          return {
            kind: 'observation_series_mismatch',
            observationKey: command.observationKey,
            revision: command.revision,
          };
        }
        if (
          observationEnvelopeHash(prior) !== observationEnvelopeHash(command)
        ) {
          return {
            kind: 'observation_conflict',
            observationKey: command.observationKey,
            revision: command.revision,
          };
        }
        duplicateCount += 1;
      }

      const ordered = [...uniqueCommands.values()].sort(compareObservations);
      for (const command of ordered) {
        await lockObservationSeries(
          tx,
          command.organizationId,
          command.observationKey,
        );
      }

      const existingByKey = new Map<string, ObservationRow>();
      for (const command of ordered) {
        const existing = await tx.sourcingEvidenceObservation.findFirst({
          where: {
            organizationId: command.organizationId,
            observationKey: command.observationKey,
            revision: command.revision,
          },
          include: observationInclude,
        });
        if (!existing) continue;
        if (existing.payloadHash !== command.payloadHash) {
          return {
            kind: 'observation_conflict',
            observationKey: command.observationKey,
            revision: command.revision,
          };
        }
        if (!observationSeriesMatches(command, existing, run.targetKey)) {
          return {
            kind: 'observation_series_mismatch',
            observationKey: command.observationKey,
            revision: command.revision,
          };
        }
        if (
          observationEnvelopeHashFromRow(existing) !==
          observationEnvelopeHash(command)
        ) {
          return {
            kind: 'observation_conflict',
            observationKey: command.observationKey,
            revision: command.revision,
          };
        }
        existingByKey.set(
          observationRevisionKey(command.observationKey, command.revision),
          existing,
        );
        duplicateCount += 1;
      }

      const records: SourcingEvidenceObservationRecord[] = [];
      let appendedCount = 0;
      let appendedCoverageUnitCount = 0;
      for (const command of ordered) {
        const key = observationRevisionKey(
          command.observationKey,
          command.revision,
        );
        const existing = existingByKey.get(key);
        if (existing) {
          records.push(toObservationRecord(existing));
          continue;
        }

        const predecessor =
          command.revision > 1
            ? await tx.sourcingEvidenceObservation.findFirst({
                where: {
                  organizationId: command.organizationId,
                  observationKey: command.observationKey,
                  revision: command.revision - 1,
                },
                select: {
                  id: true,
                  sourceKey: true,
                  platform: true,
                  evidenceFamily: true,
                  signalRole: true,
                  conceptKey: true,
                  sourceEntityType: true,
                  sourceEntityKey: true,
                  observationType: true,
                  schemaVersion: true,
                  evidenceClass: true,
                  ingestionRun: { select: { targetKey: true } },
                },
              })
            : null;
        if (command.revision > 1 && !predecessor) {
          return {
            kind: 'observation_revision_gap',
            observationKey: command.observationKey,
            revision: command.revision,
          };
        }
        if (
          predecessor &&
          !observationSeriesMatches(command, predecessor, run.targetKey)
        ) {
          return {
            kind: 'observation_series_mismatch',
            observationKey: command.observationKey,
            revision: command.revision,
          };
        }
        const createdId = await insertObservationIgnoringDuplicate(tx, {
          command,
          supersedesObservationId: predecessor?.id ?? null,
          ingestedAt: transactionAt,
        });
        if (!createdId) {
          const winner = await tx.sourcingEvidenceObservation.findFirst({
            where: {
              organizationId: command.organizationId,
              observationKey: command.observationKey,
              revision: command.revision,
            },
            include: observationInclude,
          });
          if (!winner) {
            throw new Error(
              'Evidence insert conflicted without a visible winner.',
            );
          }
          if (!observationSeriesMatches(command, winner, run.targetKey)) {
            return {
              kind: 'observation_series_mismatch',
              observationKey: command.observationKey,
              revision: command.revision,
            };
          }
          if (
            observationEnvelopeHashFromRow(winner) !==
            observationEnvelopeHash(command)
          ) {
            return {
              kind: 'observation_conflict',
              observationKey: command.observationKey,
              revision: command.revision,
            };
          }
          records.push(toObservationRecord(winner));
          duplicateCount += 1;
          continue;
        }
        records.push(
          toObservationRecordFromCommand({
            id: createdId,
            command,
            run,
            ingestedAt: transactionAt,
          }),
        );
        appendedCount += 1;
        if (command.revision === 1) appendedCoverageUnitCount += 1;
      }

      await tx.sourcingEvidenceIngestionRun.updateMany({
        where: {
          id: first.ingestionRunId,
          organizationId: first.organizationId,
          status: 'collecting',
        },
        data: {
          discoveredCount: { increment: commands.length },
          acceptedCount: { increment: appendedCount },
          duplicateCount: { increment: duplicateCount },
          coverageNumerator: { increment: appendedCoverageUnitCount },
        },
      });

      return { kind: 'appended', records, duplicateCount };
    });
  }

  finalizeRun(
    command: FinalizeSourcingEvidenceRunCommand,
  ): Promise<FinalizeSourcingEvidenceRunResult> {
    return this.prisma.$transaction(async (tx) => {
      await lockRunRow(tx, command.organizationId, command.runId);
      const current = await tx.sourcingEvidenceIngestionRun.findFirst({
        where: { id: command.runId, organizationId: command.organizationId },
        include: runInclude,
      });
      if (!current) return { kind: 'not_found' };
      if (fromDatabaseRunStatus(current.status) !== 'collecting') {
        return { kind: 'already_terminal', record: toRunRecord(current) };
      }

      const transactionAt = await databaseClock(tx);

      const derivedCoverageBps = calculateRunCoverageBps(current);
      if (
        command.coverageBps !== null &&
        command.coverageBps !== derivedCoverageBps
      ) {
        return { kind: 'coverage_mismatch', derivedCoverageBps };
      }

      const row = await tx.sourcingEvidenceIngestionRun.update({
        where: { id: current.id },
        data: {
          status: toDatabaseRunStatus(command.status),
          watermarkAfter: command.watermarkEventAt?.toISOString() ?? null,
          qualityReport: {
            ...jsonObject(current.qualityReport),
            coverageBps: derivedCoverageBps,
          },
          errorCode: command.errorCode,
          errorMessage: command.errorMessage,
          completedAt: transactionAt,
        },
        include: runInclude,
      });
      return { kind: 'finalized', record: toRunRecord(row) };
    });
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

async function lockRunKey(
  tx: Prisma.TransactionClient,
  organizationId: string,
  runKey: string,
): Promise<void> {
  await tx.$queryRaw`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`sourcing-evidence-run:${organizationId}:${runKey}`}, 0)
    )::text AS "lock"
  `;
}

async function lockRunRow(
  tx: Prisma.TransactionClient,
  organizationId: string,
  runId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT id
    FROM sourcing_evidence_ingestion_runs
    WHERE id = ${runId}::uuid
      AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `;
}

async function databaseClock(tx: Prisma.TransactionClient): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ at: Date | string }>>`
    -- queryraw-tenancy-exempt: database clock only; reads no table or tenant data.
    SELECT clock_timestamp() AS "at"
  `;
  const value = rows[0]?.at;
  const at = value instanceof Date ? value : new Date(value ?? Number.NaN);
  if (!Number.isFinite(at.getTime())) {
    throw new Error('Database clock did not return a valid timestamp.');
  }
  return at;
}

async function lockObservationSeries(
  tx: Prisma.TransactionClient,
  organizationId: string,
  observationKey: string,
): Promise<void> {
  await tx.$queryRaw`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    SELECT pg_advisory_xact_lock(
      hashtextextended(
        ${`sourcing-evidence-observation:${organizationId}:${observationKey}`},
        0
      )
    )::text AS "lock"
  `;
}

async function insertObservationIgnoringDuplicate(
  tx: Prisma.TransactionClient,
  input: {
    command: AppendSourcingEvidenceObservationCommand;
    supersedesObservationId: string | null;
    ingestedAt: Date;
  },
): Promise<string | null> {
  const { command } = input;
  const id = randomUUID();
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO sourcing_evidence_observations (
      id,
      organization_id,
      ingestion_run_id,
      supersedes_observation_id,
      source_key,
      platform,
      evidence_family,
      signal_role,
      concept_key,
      supports_candidate,
      observation_key,
      revision,
      source_entity_type,
      source_entity_key,
      observation_type,
      schema_version,
      evidence_class,
      event_at,
      observed_at,
      available_at,
      revision_at,
      source_revision_key,
      source_url,
      payload_hash,
      envelope_hash,
      payload,
      ingested_at
    ) VALUES (
      ${id}::uuid,
      ${command.organizationId}::uuid,
      ${command.ingestionRunId}::uuid,
      ${input.supersedesObservationId}::uuid,
      ${command.sourceKey},
      ${command.platform},
      ${command.evidenceFamily},
      ${command.signalRole},
      ${command.conceptKey},
      ${command.supportsCandidate},
      ${command.observationKey},
      ${command.revision},
      ${command.sourceEntityType},
      ${command.sourceEntityId},
      ${command.evidenceFamily},
      ${command.schemaVersion},
      ${command.granularity},
      ${command.eventAt},
      ${command.observedAt},
      ${command.availableAt},
      ${command.revisionAt},
      ${`${command.observationKey}:${command.revision}`},
      ${command.sourceUrl},
      ${command.payloadHash},
      ${observationEnvelopeHash(command)},
      ${JSON.stringify(command.rawPayload)}::jsonb,
      ${input.ingestedAt}
    )
    ON CONFLICT (organization_id, observation_key, revision) DO NOTHING
    RETURNING id
  `;
  return rows[0]?.id ?? null;
}

function toObservationRecordFromCommand(input: {
  id: string;
  command: AppendSourcingEvidenceObservationCommand;
  run: RunRow;
  ingestedAt: Date;
}): SourcingEvidenceObservationRecord {
  const { command, run } = input;
  return {
    id: input.id,
    organizationId: command.organizationId,
    ingestionRunId: command.ingestionRunId,
    ingestionRunStatus: fromDatabaseRunStatus(run.status),
    ingestionRunCoverageBps: calculateRunCoverageBps(run),
    ingestionRunCompletedAt: run.completedAt,
    sourceKey: command.sourceKey,
    sourceScopeKey: run.targetKey,
    platform: command.platform,
    evidenceFamily: command.evidenceFamily,
    signalRole: command.signalRole,
    granularity: command.granularity,
    conceptKey: command.conceptKey,
    sourceEntityType: command.sourceEntityType,
    sourceEntityId: command.sourceEntityId,
    schemaVersion: command.schemaVersion,
    observationKey: command.observationKey,
    revision: command.revision,
    supportsCandidate: command.supportsCandidate,
    sourceUrl: command.sourceUrl,
    eventAt: command.eventAt,
    observedAt: command.observedAt,
    availableAt: command.availableAt,
    revisionAt: command.revisionAt,
    payloadHash: command.payloadHash,
    rawPayload: command.rawPayload,
    ingestedAt: input.ingestedAt,
  };
}

function observationSeriesMatches(
  command: AppendSourcingEvidenceObservationCommand,
  predecessor: {
    sourceKey: string;
    platform: string;
    evidenceFamily: string;
    signalRole: string;
    conceptKey: string | null;
    sourceEntityType: string;
    sourceEntityKey: string;
    observationType: string;
    schemaVersion: string;
    evidenceClass: string;
    ingestionRun: { targetKey: string };
  },
  expectedScopeKey: string,
): boolean {
  return (
    predecessor.sourceKey === command.sourceKey &&
    predecessor.platform === command.platform &&
    predecessor.evidenceFamily === command.evidenceFamily &&
    predecessor.signalRole === command.signalRole &&
    predecessor.conceptKey === command.conceptKey &&
    predecessor.sourceEntityType === command.sourceEntityType &&
    predecessor.sourceEntityKey === command.sourceEntityId &&
    predecessor.observationType === command.evidenceFamily &&
    predecessor.schemaVersion === command.schemaVersion &&
    predecessor.evidenceClass === command.granularity &&
    predecessor.ingestionRun.targetKey === expectedScopeKey
  );
}

function observationCommandEnvelopeMatches(
  left: AppendSourcingEvidenceObservationCommand,
  right: AppendSourcingEvidenceObservationCommand,
): boolean {
  return (
    left.organizationId === right.organizationId &&
    left.ingestionRunId === right.ingestionRunId &&
    left.sourceKey === right.sourceKey &&
    left.platform === right.platform &&
    left.evidenceFamily === right.evidenceFamily &&
    left.signalRole === right.signalRole &&
    left.granularity === right.granularity &&
    left.conceptKey === right.conceptKey &&
    left.sourceEntityType === right.sourceEntityType &&
    left.sourceEntityId === right.sourceEntityId &&
    left.schemaVersion === right.schemaVersion &&
    left.observationKey === right.observationKey &&
    left.revision === right.revision
  );
}

function observationEnvelopeHash(
  command: AppendSourcingEvidenceObservationCommand,
): string {
  return hashCanonicalJson({
    organizationId: command.organizationId,
    ingestionRunId: command.ingestionRunId,
    sourceKey: command.sourceKey,
    platform: command.platform,
    evidenceFamily: command.evidenceFamily,
    signalRole: command.signalRole,
    granularity: command.granularity,
    conceptKey: command.conceptKey,
    sourceEntityType: command.sourceEntityType,
    sourceEntityId: command.sourceEntityId,
    schemaVersion: command.schemaVersion,
    observationKey: command.observationKey,
    revision: command.revision,
    supportsCandidate: command.supportsCandidate,
    sourceUrl: command.sourceUrl,
    eventAt: command.eventAt,
    observedAt: command.observedAt,
    availableAt: command.availableAt,
    revisionAt: command.revisionAt,
    payloadHash: command.payloadHash,
  });
}

function observationEnvelopeHashFromRow(row: ObservationRow): string {
  if (row.envelopeHash) return row.envelopeHash;
  return hashCanonicalJson({
    organizationId: row.organizationId,
    ingestionRunId: row.ingestionRunId,
    sourceKey: row.sourceKey,
    platform: row.platform,
    evidenceFamily: row.evidenceFamily,
    signalRole: row.signalRole,
    granularity: row.evidenceClass,
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
  });
}

function hashCanonicalJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
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

function assertSingleRunScope(
  commands: AppendSourcingEvidenceObservationCommand[],
): void {
  const first = commands[0];
  if (
    commands.some(
      (command) =>
        command.organizationId !== first.organizationId ||
        command.ingestionRunId !== first.ingestionRunId,
    )
  ) {
    throw new Error(
      'Evidence append commands must belong to one organization and run.',
    );
  }
}

function assertAppendCommandsMatchRun(
  commands: AppendSourcingEvidenceObservationCommand[],
  run: RunRow,
): void {
  if (
    commands.some((command) => command.sourceKey !== run.sourceKey)
  ) {
    throw new Error(
      'Evidence observation source does not match its ingestion run.',
    );
  }
}

function fromDatabaseRunStatus(status: string): SourcingEvidenceRunStatus {
  if (status === 'collecting') return 'collecting';
  if (status === 'cancel_requested') return 'cancel_requested';
  if (
    status === 'complete' ||
    status === 'partial' ||
    status === 'failed' ||
    status === 'quarantined' ||
    status === 'cancelled' ||
    status === 'superseded'
  ) {
    return status;
  }
  throw new Error(`Unsupported evidence run status: ${status}`);
}

function toDatabaseRunStatus(
  status: Exclude<SourcingEvidenceRunStatus, 'collecting' | 'cancel_requested'>,
): string {
  return status;
}

function observationRevisionKey(
  observationKey: string,
  revision: number,
): string {
  return `${observationKey}:${revision}`;
}

function compareObservations(
  left: AppendSourcingEvidenceObservationCommand,
  right: AppendSourcingEvidenceObservationCommand,
): number {
  const keyOrder = left.observationKey.localeCompare(right.observationKey);
  return keyOrder || left.revision - right.revision;
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

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
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
