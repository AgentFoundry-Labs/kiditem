import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  OTHER_USER_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../../../../test-helpers/real-prisma';
import { SourcingDecisionBatchRepositoryAdapter } from '../sourcing-decision-batch.repository.adapter';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../../../../prisma/prisma.service';
import type { CreateSourcingDecisionBatchCommand } from '../../../../application/port/out/repository/sourcing-decision-batch.repository.port';

describe('Sourcing decision batch commit (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let repository: SourcingDecisionBatchRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new SourcingDecisionBatchRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('commits a decision batch backed by current COMPLETE source evidence', async () => {
    const evidence = await seedSupportingEvidence(prisma);

    const result = await repository.create(createCommand(evidence));
    expect(result).toMatchObject({
      kind: 'created',
      duplicate: false,
      record: {
        organizationId: TEST_ORGANIZATION_ID,
        items: [expect.objectContaining({ evidenceFamilyCount: 1, reasonCodes: ['supporting_evidence_ready'] })],
      },
    });
    if (result.kind !== 'created') throw new Error(`Unexpected decision result ${result.kind}`);
    expect(result.record.items[0]).not.toHaveProperty('evidence');
    await expect(repository.findItemById({
      organizationId: TEST_ORGANIZATION_ID,
      id: result.record.items[0]!.id,
    })).resolves.toMatchObject({
      evidence: [{
        observationId: evidence.observationId,
        evidenceRole: 'support:supply',
      }],
    });
  });

  it('rejects evidence from a COMPLETE source run superseded by a newer publication', async () => {
    const evidence = await seedSupportingEvidence(prisma);
    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: evidence.runId },
      data: { isCurrentComplete: false },
    });
    await seedSupportingEvidence(prisma, {
      observationKey: 'f'.repeat(64),
    });

    await expect(repository.create(createCommand(evidence))).resolves.toEqual({
      kind: 'source_evidence_changed',
    });
  });

  it('rejects supporting evidence outside the commit freshness window', async () => {
    const evidence = await seedSupportingEvidence(prisma, {
      eventAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1_000),
    });

    await expect(repository.create(createCommand(evidence))).resolves.toEqual({
      kind: 'source_evidence_changed',
    });
  });

  it('rejects a supporting observation superseded by a newer revision', async () => {
    const evidence = await seedSupportingEvidence(prisma);
    await seedSupersedingObservation(prisma, evidence.observationId);

    await expect(repository.create(createCommand(evidence))).resolves.toEqual({
      kind: 'source_evidence_changed',
    });
  });

  it('rejects supporting evidence owned by another organization', async () => {
    const evidence = await seedSupportingEvidence(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      userId: OTHER_USER_ID,
    });

    await expect(repository.create(createCommand(evidence))).resolves.toEqual({
      kind: 'source_evidence_changed',
    });
  });
});

interface SupportingEvidenceFixture {
  observationId: string;
  observationKey: string;
  runId: string;
  sourceKey: string;
  targetKey: string;
}

async function seedSupportingEvidence(
  prisma: PrismaClient,
  input: {
    eventAt?: Date;
    observationKey?: string;
    organizationId?: string;
    userId?: string;
  } = {},
): Promise<SupportingEvidenceFixture> {
  const now = new Date(Date.now() - 60_000);
  const eventAt = input.eventAt ?? now;
  const organizationId = input.organizationId ?? TEST_ORGANIZATION_ID;
  const userId = input.userId ?? TEST_USER_ID;
  const sourceKey = '1688.hot_product';
  const targetKey = 'stationery';
  const observationKey = input.observationKey ?? 'a'.repeat(64);
  const run = await prisma.sourcingEvidenceIngestionRun.create({
    data: {
      id: randomUUID(),
      organizationId,
      sourceKey,
      scopeKey: 'decision-commit-test',
      targetKey,
      idempotencyKey: randomUUID(),
      requestHash: 'b'.repeat(64),
      collectorKey: 'decision-commit-test',
      collectorVersion: 'v1',
      triggerKind: 'manual',
      triggeredByUserId: userId,
      status: 'COMPLETE',
      isCurrentComplete: true,
      completedAt: now,
    },
  });
  const observation = await prisma.sourcingEvidenceObservation.create({
    data: {
      id: randomUUID(),
      organizationId,
      ingestionRunId: run.id,
      sourceKey,
      platform: '1688',
      evidenceFamily: 'supplier_offer',
      signalRole: 'supply',
      conceptKey: 'stationery',
      supportsCandidate: true,
      observationKey,
      revision: 1,
      sourceEntityType: 'supplier_offer',
      sourceEntityKey: 'offer-1',
      observationType: 'offer_snapshot',
      schemaVersion: 'v1',
      evidenceClass: 'measured',
      eventAt,
      observedAt: eventAt,
      availableAt: now,
      payloadHash: 'c'.repeat(64),
      envelopeHash: 'd'.repeat(64),
      ingestedAt: now,
    },
  });
  return {
    observationId: observation.id,
    observationKey,
    runId: run.id,
    sourceKey,
    targetKey,
  };
}

async function seedSupersedingObservation(
  prisma: PrismaClient,
  observationId: string,
): Promise<void> {
  const original = await prisma.sourcingEvidenceObservation.findUniqueOrThrow({
    where: { id: observationId },
  });
  await prisma.sourcingEvidenceObservation.create({
    data: {
      id: randomUUID(),
      organizationId: original.organizationId,
      ingestionRunId: original.ingestionRunId,
      supersedesObservationId: original.id,
      sourceKey: original.sourceKey,
      platform: original.platform,
      evidenceFamily: original.evidenceFamily,
      signalRole: original.signalRole,
      conceptKey: original.conceptKey,
      supportsCandidate: original.supportsCandidate,
      observationKey: original.observationKey,
      revision: original.revision + 1,
      sourceEntityType: original.sourceEntityType,
      sourceEntityKey: original.sourceEntityKey,
      observationType: original.observationType,
      schemaVersion: original.schemaVersion,
      evidenceClass: original.evidenceClass,
      eventAt: original.eventAt,
      observedAt: original.observedAt,
      payloadHash: '1'.repeat(64),
      envelopeHash: '2'.repeat(64),
      availableAt: new Date(),
      ingestedAt: new Date(),
    },
  });
}

function createCommand(
  evidence: SupportingEvidenceFixture,
): CreateSourcingDecisionBatchCommand {
  const decisionAt = new Date();
  return {
    organizationId: TEST_ORGANIZATION_ID,
    batchKey: `decision-commit:${randomUUID()}`,
    requestHash: 'e'.repeat(64),
    status: 'shadow',
    keyword: 'stationery',
    category: 'toys',
    policyVersion: 'policy-v1',
    modelPipeline: 'heuristic-v1',
    modelVersion: 'model-v1',
    modelGeneratorVersion: 'generator-v1',
    decisionAt,
    sourceCutoffAt: decisionAt,
    expiresAt: new Date(decisionAt.getTime() + 60 * 60 * 1_000),
    createdByUserId: TEST_USER_ID,
    items: [
      {
        modelCandidateId: 'model-candidate-1',
        rank: 1,
        productName: 'Color clay set',
        supplierOfferSkuSnapshotId: null,
        launchCandidateId: null,
        baselineDecision: 'observe_3d',
        canonicalDecision: 'hold',
        executionEligible: false,
        baselineScore: 72,
        confidence: 0.72,
        confidenceKind: 'coverage',
        policyProbability: null,
        evidenceFamilyCount: 1,
        evidencePlatformCount: 1,
        hasCoupangEvidence: false,
        has1688Evidence: true,
        nextEvidenceAction: null,
        reasonCodes: ['supporting_evidence_ready'],
        riskCodes: [],
        modelOutput: { scoreVersion: 'v1' },
        evidence: [
          {
            observationId: evidence.observationId,
            evidenceRole: 'support:supply',
            sourceObservation: {
              sourceKey: evidence.sourceKey,
              scopeKey: evidence.targetKey,
              observationKey: evidence.observationKey,
            },
          },
        ],
      },
    ],
  };
}
