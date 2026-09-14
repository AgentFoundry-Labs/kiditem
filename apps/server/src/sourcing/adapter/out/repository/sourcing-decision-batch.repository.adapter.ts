import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { kstBusinessDate } from '../../../../common/kst';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import type {
  CreateSourcingDecisionBatchCommand,
  CreateSourcingDecisionBatchResult,
  SourcingDecisionBatchItemRecord,
  SourcingDecisionBatchItemWithBatchRecord,
  SourcingDecisionBatchRecord,
  SourcingDecisionBatchRepositoryPort,
} from '../../../application/port/out/repository/sourcing-decision-batch.repository.port';
import type {
  RecommendationConfidenceKind,
  RecommendationNextEvidenceAction,
  SourcingBaselineDecision,
  SourcingRecommendationDecision,
} from '../../../domain/recommendation-decision-policy';
import { readCurrentSupportingObservation } from '../../../read/source-evidence.reader';
import {
  decisionBatchInclude,
  decisionItemInclude,
  readDecisionBatchByIdempotencyKey,
  readExactDecisionBatch,
  readExactDecisionBatchItem,
  readLatestDecisionBatch,
} from '../../../read/decision-publication.reader';

const DECISION_POLICY_KEY = 'sourcing-recommendation';

type DecisionBatchRow = Prisma.SourcingDecisionBatchGetPayload<{
  include: typeof decisionBatchInclude;
}>;

type DecisionItemRow = DecisionBatchRow['items'][number];

type DecisionItemWithEvidenceRow = Prisma.SourcingDecisionBatchItemGetPayload<{
  include: typeof decisionItemInclude;
}>;

@Injectable()
export class SourcingDecisionBatchRepositoryAdapter implements SourcingDecisionBatchRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    command: CreateSourcingDecisionBatchCommand,
  ): Promise<CreateSourcingDecisionBatchResult> {
    try {
      return await this.prisma.$transaction((tx) =>
        this.createAttempt(tx, command),
      );
    } catch (error) {
      if (prismaErrorCode(error) !== 'P2002') throw error;

      const winner = await readDecisionBatchByIdempotencyKey(this.prisma, {
        organizationId: command.organizationId,
        idempotencyKey: command.batchKey,
      });
      if (winner) return duplicateResult(winner, command.requestHash);
      throw error;
    }
  }

  private async createAttempt(
    tx: Prisma.TransactionClient,
    command: CreateSourcingDecisionBatchCommand,
  ): Promise<CreateSourcingDecisionBatchResult> {
    await lockDecisionBatchKey(tx, command.organizationId, command.batchKey);
    const existing = await tx.sourcingDecisionBatch.findFirst({
      where: {
        organizationId: command.organizationId,
        idempotencyKey: command.batchKey,
      },
      include: decisionBatchInclude,
    });
    if (existing) return duplicateResult(existing, command.requestHash);

    const supportingEvidence = collectSupportingEvidence(command);
    for (const evidence of supportingEvidence) {
      await lockObservationSeries(
        tx,
        command.organizationId,
        evidence.observationKey,
      );
    }
    const transactionAt = await databaseClock(tx);
    for (const evidence of supportingEvidence) {
      const observation = await readCurrentSupportingObservation(tx, {
        organizationId: command.organizationId,
        observationId: evidence.observationId,
        observationKey: evidence.observationKey,
        sourceKey: evidence.sourceKey,
        scopeKey: evidence.scopeKey,
        cutoffAt: transactionAt,
      });
      if (!observation || !observation.eventAt || !evidenceIsFresh(observation.eventAt, transactionAt)) {
        return { kind: 'source_evidence_changed' };
      }
    }

    try {
      const created = await tx.sourcingDecisionBatch.create({
        data: {
          organizationId: command.organizationId,
          requestedByUserId: command.createdByUserId,
          idempotencyKey: command.batchKey,
          requestHash: command.requestHash,
          decisionMode: command.status,
          status: command.status,
          businessDate: kstBusinessDate(command.decisionAt),
          decisionAt: command.decisionAt,
          evidenceCutoffAt: command.sourceCutoffAt,
          policyKey: DECISION_POLICY_KEY,
          policyVersion: command.policyVersion,
          modelVersionKey: command.modelVersion,
          keyword: command.keyword,
          category: command.category,
          modelPipeline: command.modelPipeline,
          modelGeneratorVersion: command.modelGeneratorVersion,
          expiresAt: command.expiresAt,
          items: {
            create: command.items.map((item) => ({
              itemKey: hashModelCandidateId(item.modelCandidateId),
              modelCandidateId: item.modelCandidateId,
              displayName: item.productName,
              rank: item.rank,
              launchCandidateId: item.launchCandidateId,
              supplierOfferSkuSnapshotId: item.supplierOfferSkuSnapshotId,
              baselineDecision: item.baselineDecision,
              decision: item.canonicalDecision,
              executionEligible: item.executionEligible,
              heuristicScore: item.baselineScore,
              decisionConfidence: item.confidence,
              confidenceKind: item.confidenceKind,
              policyProbability: item.policyProbability,
              evidenceFamilyCount: item.evidenceFamilyCount,
              evidencePlatformCount: item.evidencePlatformCount,
              hasCoupangEvidence: item.hasCoupangEvidence,
              has1688Evidence: item.has1688Evidence,
              nextEvidenceAction: item.nextEvidenceAction,
              reasonCodes: item.reasonCodes,
              riskCodes: item.riskCodes,
              modelOutput: item.modelOutput as Prisma.InputJsonValue,
              evidence: {
                create: item.evidence.map((evidence, ordinal) => ({
                  evidenceObservationId: evidence.observationId,
                  role: evidence.evidenceRole,
                  ordinal,
                })),
              },
            })),
          },
        },
        include: decisionBatchInclude,
      });

      return {
        kind: 'created',
        duplicate: false,
        record: toBatchRecord(created),
      };
    } catch (error) {
      const code = prismaErrorCode(error);
      if (code === 'P2003') return { kind: 'reference_not_found' };
      throw error;
    }
  }

  async findById(input: {
    organizationId: string;
    id: string;
  }): Promise<SourcingDecisionBatchRecord | null> {
    const row = await readExactDecisionBatch(this.prisma, input);
    return row ? toBatchRecord(row) : null;
  }

  async findLatest(input: {
    organizationId: string;
  }): Promise<SourcingDecisionBatchRecord | null> {
    const row = await readLatestDecisionBatch(this.prisma, input);
    return row ? toBatchRecord(row) : null;
  }

  async findItemById(input: {
    organizationId: string;
    id: string;
  }): Promise<SourcingDecisionBatchItemWithBatchRecord | null> {
    const row = await readExactDecisionBatchItem(this.prisma, input);
    return row
      ? {
          ...toItemRecord(row),
          decisionBatchStatus: row.decisionBatch.status,
          decisionBatchExpiresAt: row.decisionBatch.expiresAt,
          evidence: toEvidenceRecords(row),
        }
      : null;
  }
}

interface SupportingEvidenceBinding {
  observationId: string;
  sourceKey: string;
  scopeKey: string;
  observationKey: string;
}

function collectSupportingEvidence(
  command: CreateSourcingDecisionBatchCommand,
): SupportingEvidenceBinding[] {
  const bindings: SupportingEvidenceBinding[] = [];
  for (const item of command.items) {
    for (const evidence of item.evidence) {
      if (!evidence.evidenceRole.startsWith('support:')) continue;
      const source = evidence.sourceObservation;
      if (!source) {
        throw new TypeError('Supporting evidence must include its source identity.');
      }
      bindings.push({ observationId: evidence.observationId, ...source });
    }
  }
  return bindings.sort(
    (left, right) =>
      left.sourceKey.localeCompare(right.sourceKey) ||
      left.scopeKey.localeCompare(right.scopeKey) ||
      left.observationKey.localeCompare(right.observationKey) ||
      left.observationId.localeCompare(right.observationId),
  );
}

async function lockDecisionBatchKey(
  tx: Prisma.TransactionClient,
  organizationId: string,
  batchKey: string,
): Promise<void> {
  await tx.$queryRaw`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`sourcing-decision:${organizationId}:${batchKey}`}, 0)
    )::text AS "lock"
  `;
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

function evidenceIsFresh(eventAt: Date, at: Date): boolean {
  return at.getTime() - eventAt.getTime() <= 7 * 24 * 60 * 60 * 1_000;
}

function duplicateResult(
  row: DecisionBatchRow,
  requestHash: string,
): CreateSourcingDecisionBatchResult {
  if (row.requestHash !== requestHash) return { kind: 'idempotency_conflict' };
  return {
    kind: 'existing',
    duplicate: true,
    record: toBatchRecord(row),
  };
}

function toBatchRecord(row: DecisionBatchRow): SourcingDecisionBatchRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    batchKey: row.idempotencyKey,
    requestHash: row.requestHash,
    status: row.status,
    keyword: row.keyword,
    category: row.category,
    policyVersion: row.policyVersion,
    modelPipeline: row.modelPipeline,
    modelVersion: requiredValue(row.modelVersionKey, 'modelVersionKey', row.id),
    modelGeneratorVersion: row.modelGeneratorVersion,
    decisionAt: row.decisionAt,
    sourceCutoffAt: row.evidenceCutoffAt,
    expiresAt: row.expiresAt,
    createdByUserId: requiredValue(
      row.requestedByUserId,
      'requestedByUserId',
      row.id,
    ),
    createdAt: row.createdAt,
    items: row.items.map(toItemRecord),
  };
}

function toItemRecord(row: DecisionItemRow | DecisionItemWithEvidenceRow): SourcingDecisionBatchItemRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    decisionBatchId: row.decisionBatchId,
    modelCandidateId: row.modelCandidateId,
    rank: row.rank,
    productName: row.displayName,
    supplierOfferSkuSnapshotId: row.supplierOfferSkuSnapshotId,
    launchCandidateId: row.launchCandidateId,
    baselineDecision: row.baselineDecision as SourcingBaselineDecision,
    canonicalDecision: row.decision as SourcingRecommendationDecision,
    executionEligible: row.executionEligible,
    baselineScore: requiredDecimalNumber(
      row.heuristicScore,
      'heuristicScore',
      row.id,
    ),
    confidence: requiredDecimalNumber(
      row.decisionConfidence,
      'decisionConfidence',
      row.id,
    ),
    confidenceKind: row.confidenceKind as RecommendationConfidenceKind,
    policyProbability: nullableDecimalNumber(row.policyProbability),
    evidenceFamilyCount: row.evidenceFamilyCount,
    evidencePlatformCount: row.evidencePlatformCount,
    hasCoupangEvidence: row.hasCoupangEvidence,
    has1688Evidence: row.has1688Evidence,
    nextEvidenceAction: row.nextEvidenceAction as
      RecommendationNextEvidenceAction | 'resolve_supplier_variant' | null,
    reasonCodes: row.reasonCodes,
    riskCodes: row.riskCodes,
    modelOutput: jsonRecord(row.modelOutput, row.id),
    createdAt: row.createdAt,
  };
}

function toEvidenceRecords(row: DecisionItemWithEvidenceRow) {
  return row.evidence.map((evidence) => ({
      id: evidence.id,
      observationId: evidence.evidenceObservationId,
      evidenceRole: evidence.role,
  }));
}

function hashModelCandidateId(modelCandidateId: string): string {
  return createHash('sha256').update(modelCandidateId).digest('hex');
}

function requiredDecimalNumber(
  value: Prisma.Decimal | null,
  field: string,
  id: string,
): number {
  return requiredValue(value, field, id).toNumber();
}

function nullableDecimalNumber(value: Prisma.Decimal | null): number | null {
  return value?.toNumber() ?? null;
}

function jsonRecord(
  value: Prisma.JsonValue,
  id: string,
): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(`Decision batch item ${id} has non-object modelOutput.`);
}

function requiredValue<T>(value: T | null, field: string, id: string): T {
  if (value == null) {
    throw new Error(`Decision record ${id} is missing required ${field}.`);
  }
  return value;
}

function prismaErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}
