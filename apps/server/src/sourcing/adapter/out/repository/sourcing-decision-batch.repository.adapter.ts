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

const DECISION_POLICY_KEY = 'sourcing-recommendation';

const decisionItemInclude = {
  evidence: {
    orderBy: [
      { ordinal: 'asc' as const },
      { createdAt: 'asc' as const },
    ],
  },
} satisfies Prisma.SourcingDecisionBatchItemInclude;

const decisionItemWithBatchInclude = {
  ...decisionItemInclude,
  decisionBatch: {
    select: { status: true, expiresAt: true },
  },
} satisfies Prisma.SourcingDecisionBatchItemInclude;

const decisionBatchInclude = {
  items: {
    orderBy: [
      { rank: 'asc' as const },
      { createdAt: 'asc' as const },
    ],
    include: decisionItemInclude,
  },
} satisfies Prisma.SourcingDecisionBatchInclude;

type DecisionBatchRow = Prisma.SourcingDecisionBatchGetPayload<{
  include: typeof decisionBatchInclude;
}>;

type DecisionItemRow = Prisma.SourcingDecisionBatchItemGetPayload<{
  include: typeof decisionItemInclude;
}>;

@Injectable()
export class SourcingDecisionBatchRepositoryAdapter implements SourcingDecisionBatchRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    command: CreateSourcingDecisionBatchCommand,
  ): Promise<CreateSourcingDecisionBatchResult> {
    return this.prisma.$transaction(async (tx) => {
      await lockDecisionBatchKey(
        tx,
        command.organizationId,
        command.batchKey,
      );
      const existing = await tx.sourcingDecisionBatch.findFirst({
        where: {
          organizationId: command.organizationId,
          idempotencyKey: command.batchKey,
        },
        include: decisionBatchInclude,
      });
      if (existing) return duplicateResult(existing, command.requestHash);

      const evidenceAuthorizations = collectEvidenceAuthorizations(command);
      if (evidenceAuthorizations === null) {
        return { kind: 'source_entitlement_changed' };
      }
      const sourceAuthorizations = uniqueSourceAuthorizations(
        evidenceAuthorizations,
      );
      for (const source of sourceAuthorizations) {
        await lockSourceScope(
          tx,
          command.organizationId,
          source.sourceKey,
          source.scopeKey,
        );
      }
      for (const evidence of evidenceAuthorizations) {
        await lockObservationSeries(
          tx,
          command.organizationId,
          evidence.observationKey,
        );
      }
      const transactionAt = await databaseClock(tx);
      const currentEntitlements = new Map<
        string,
        {
          maxStalenessSeconds: number | null;
          minimumCoverageBps: number | null;
          retentionDays: number | null;
        }
      >();
      for (const source of sourceAuthorizations) {
        const entitlement =
          await tx.sourcingSourceEntitlementVersion.findFirst({
            where: {
              id: source.entitlementVersionId,
              organizationId: command.organizationId,
              sourceKey: source.sourceKey,
              scopeKey: source.scopeKey,
              isCurrent: true,
              retiredAt: null,
              killSwitch: false,
              sourceLifecycle: 'qualified',
              decisionImpact: 'enabled',
              AND: [
                {
                  OR: [
                    { permissionStartsAt: null },
                    { permissionStartsAt: { lte: transactionAt } },
                  ],
                },
                {
                  OR: [
                    { permissionExpiresAt: null },
                    { permissionExpiresAt: { gt: transactionAt } },
                  ],
                },
              ],
            },
            select: {
              id: true,
              permittedFields: true,
              coverageDefinition: true,
              denominatorDefinition: true,
              maxStalenessSeconds: true,
              minimumCoverageBps: true,
              revisionPolicy: true,
              retentionDays: true,
            },
          });
        if (!entitlement || !sourceQualityContractIsComplete(entitlement)) {
          return { kind: 'source_entitlement_changed' };
        }
        currentEntitlements.set(sourceScopeKey(source), entitlement);
      }

      for (const evidence of evidenceAuthorizations) {
        const observation = await tx.sourcingEvidenceObservation.findFirst({
          where: {
            id: evidence.observationId,
            organizationId: command.organizationId,
            observationKey: evidence.observationKey,
            sourceKey: evidence.sourceKey,
            decisionImpact: 'enabled',
            supportsCandidate: true,
            signalRole: { in: ['demand', 'supply'] },
            eventAt: { lte: transactionAt },
            availableAt: { lte: transactionAt },
            ingestedAt: { lte: transactionAt },
            ingestionRun: {
              sourceEntitlementVersionId: evidence.entitlementVersionId,
              targetKey: evidence.scopeKey,
              status: 'complete',
              completedAt: { lte: transactionAt },
            },
          },
          select: {
            id: true,
            eventAt: true,
            ingestionRun: {
              select: {
                coverageNumerator: true,
                coverageDenominator: true,
              },
            },
          },
        });
        const entitlement = currentEntitlements.get(sourceScopeKey(evidence));
        if (!observation || !observation.eventAt || !entitlement) {
          return { kind: 'source_entitlement_changed' };
        }
        if (!evidenceCoverageAndFreshnessPasses(
          {
            eventAt: observation.eventAt,
            ingestionRun: observation.ingestionRun,
          },
          entitlement,
          transactionAt,
        )) {
          return { kind: 'source_entitlement_changed' };
        }
        const latest = await tx.sourcingEvidenceObservation.findFirst({
          where: {
            organizationId: command.organizationId,
            observationKey: evidence.observationKey,
            availableAt: { lte: transactionAt },
            ingestedAt: { lte: transactionAt },
          },
          orderBy: [
            { revision: 'desc' },
            { availableAt: 'desc' },
            { ingestedAt: 'desc' },
            { id: 'desc' },
          ],
          select: { id: true },
        });
        if (latest?.id !== evidence.observationId) {
          return { kind: 'source_entitlement_changed' };
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
        if (code === 'P2002') {
          const winner = await tx.sourcingDecisionBatch.findFirst({
            where: {
              organizationId: command.organizationId,
              idempotencyKey: command.batchKey,
            },
            include: decisionBatchInclude,
          });
          if (winner) return duplicateResult(winner, command.requestHash);
        }
        if (code === 'P2003') return { kind: 'reference_not_found' };
        throw error;
      }
    });
  }

  async findById(input: {
    organizationId: string;
    id: string;
  }): Promise<SourcingDecisionBatchRecord | null> {
    const row = await this.prisma.sourcingDecisionBatch.findFirst({
      where: {
        id: input.id,
        organizationId: input.organizationId,
      },
      include: decisionBatchInclude,
    });
    return row ? toBatchRecord(row) : null;
  }

  async findLatest(input: {
    organizationId: string;
  }): Promise<SourcingDecisionBatchRecord | null> {
    const row = await this.prisma.sourcingDecisionBatch.findFirst({
      where: { organizationId: input.organizationId },
      orderBy: [
        { decisionAt: 'desc' },
        { createdAt: 'desc' },
      ],
      include: decisionBatchInclude,
    });
    return row ? toBatchRecord(row) : null;
  }

  async findItemById(input: {
    organizationId: string;
    id: string;
  }): Promise<SourcingDecisionBatchItemWithBatchRecord | null> {
    const row = await this.prisma.sourcingDecisionBatchItem.findFirst({
      where: {
        id: input.id,
        organizationId: input.organizationId,
      },
      include: decisionItemWithBatchInclude,
    });
    return row
      ? {
          ...toItemRecord(row),
          decisionBatchStatus: row.decisionBatch.status,
          decisionBatchExpiresAt: row.decisionBatch.expiresAt,
        }
      : null;
  }

}

interface EvidenceAuthorizationBinding {
  observationId: string;
  sourceKey: string;
  scopeKey: string;
  entitlementVersionId: string;
  observationKey: string;
}

function collectEvidenceAuthorizations(
  command: CreateSourcingDecisionBatchCommand,
): EvidenceAuthorizationBinding[] | null {
  const bindings: EvidenceAuthorizationBinding[] = [];
  const versionsByScope = new Map<string, string>();
  for (const item of command.items) {
    for (const evidence of item.evidence) {
      if (!evidence.evidenceRole.startsWith('support:')) continue;
      const source = evidence.sourceAuthorization;
      if (!source) return null;
      const key = `${source.sourceKey}\u0000${source.scopeKey}`;
      const existingVersion = versionsByScope.get(key);
      if (existingVersion && existingVersion !== source.entitlementVersionId) {
        return null;
      }
      versionsByScope.set(key, source.entitlementVersionId);
      bindings.push({ observationId: evidence.observationId, ...source });
    }
  }
  return bindings.sort((left, right) =>
    left.sourceKey.localeCompare(right.sourceKey) ||
    left.scopeKey.localeCompare(right.scopeKey) ||
    left.observationKey.localeCompare(right.observationKey) ||
    left.observationId.localeCompare(right.observationId),
  );
}

function uniqueSourceAuthorizations(
  evidence: EvidenceAuthorizationBinding[],
): EvidenceAuthorizationBinding[] {
  const byScope = new Map<string, EvidenceAuthorizationBinding>();
  for (const binding of evidence) {
    byScope.set(sourceScopeKey(binding), binding);
  }
  return [...byScope.values()].sort((left, right) =>
    left.sourceKey.localeCompare(right.sourceKey) ||
    left.scopeKey.localeCompare(right.scopeKey),
  );
}

function sourceScopeKey(input: { sourceKey: string; scopeKey: string }): string {
  return `${input.sourceKey}\u0000${input.scopeKey}`;
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

async function lockSourceScope(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sourceKey: string,
  scopeKey: string,
): Promise<void> {
  await tx.$queryRaw`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`sourcing-source:${organizationId}:${sourceKey}:${scopeKey}`}, 0)
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

function sourceQualityContractIsComplete(input: {
  permittedFields: string[];
  coverageDefinition: string | null;
  denominatorDefinition: string | null;
  maxStalenessSeconds: number | null;
  minimumCoverageBps: number | null;
  revisionPolicy: string | null;
  retentionDays: number | null;
}): boolean {
  return input.permittedFields.length > 0 &&
    Boolean(input.coverageDefinition) &&
    Boolean(input.denominatorDefinition) &&
    input.maxStalenessSeconds !== null &&
    input.maxStalenessSeconds > 0 &&
    input.minimumCoverageBps !== null &&
    input.minimumCoverageBps > 0 &&
    input.minimumCoverageBps <= 10_000 &&
    Boolean(input.revisionPolicy) &&
    input.retentionDays !== null &&
    input.retentionDays > 0;
}

function evidenceCoverageAndFreshnessPasses(
  observation: {
    eventAt: Date;
    ingestionRun: {
      coverageNumerator: number | null;
      coverageDenominator: number | null;
    };
  },
  entitlement: {
    maxStalenessSeconds: number | null;
    minimumCoverageBps: number | null;
    retentionDays: number | null;
  },
  at: Date,
): boolean {
  const coverageBps = calculateCoverageBps(observation.ingestionRun);
  if (
    coverageBps === null ||
    entitlement.minimumCoverageBps === null ||
    coverageBps < entitlement.minimumCoverageBps
  ) {
    return false;
  }
  const maxStalenessSeconds = entitlement.maxStalenessSeconds;
  const retentionSeconds = entitlement.retentionDays === null
    ? null
    : entitlement.retentionDays * 86_400;
  const maximumAgeSeconds = maxStalenessSeconds === null
    ? retentionSeconds
    : retentionSeconds === null
      ? maxStalenessSeconds
      : Math.min(maxStalenessSeconds, retentionSeconds);
  return maximumAgeSeconds !== null &&
    at.getTime() - observation.eventAt.getTime() <=
      maximumAgeSeconds * 1_000;
}

function calculateCoverageBps(input: {
  coverageNumerator: number | null;
  coverageDenominator: number | null;
}): number | null {
  if (
    input.coverageNumerator === null ||
    input.coverageDenominator === null ||
    !Number.isSafeInteger(input.coverageNumerator) ||
    !Number.isSafeInteger(input.coverageDenominator) ||
    input.coverageNumerator < 0 ||
    input.coverageDenominator <= 0 ||
    input.coverageNumerator > input.coverageDenominator
  ) {
    return null;
  }
  return Math.round(
    (input.coverageNumerator / input.coverageDenominator) * 10_000,
  );
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

function toItemRecord(row: DecisionItemRow): SourcingDecisionBatchItemRecord {
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
      | RecommendationNextEvidenceAction
      | 'resolve_supplier_variant'
      | null,
    reasonCodes: row.reasonCodes,
    riskCodes: row.riskCodes,
    modelOutput: jsonRecord(row.modelOutput, row.id),
    createdAt: row.createdAt,
    evidence: row.evidence.map((evidence) => ({
      id: evidence.id,
      observationId: evidence.evidenceObservationId,
      evidenceRole: evidence.role,
    })),
  };
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

function jsonRecord(value: Prisma.JsonValue, id: string): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(`Decision batch item ${id} has non-object modelOutput.`);
}

function requiredValue<T>(
  value: T | null,
  field: string,
  id: string,
): T {
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
