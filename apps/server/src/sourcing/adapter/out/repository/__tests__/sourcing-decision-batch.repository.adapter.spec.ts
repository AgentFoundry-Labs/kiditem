import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { SourcingDecisionBatchRepositoryAdapter } from '../sourcing-decision-batch.repository.adapter';
import type { PrismaService } from '../../../../../prisma/prisma.service';
import type { CreateSourcingDecisionBatchCommand } from '../../../../application/port/out/repository/sourcing-decision-batch.repository.port';

describe('SourcingDecisionBatchRepositoryAdapter', () => {
  it('append-only creates an organization-scoped batch with nested items and evidence', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue(
      batchRow({ evidenceRole: 'context:supply' }),
    );
    const adapter = createAdapter({
      batchFindFirst: findFirst,
      batchCreate: create,
    });

    const result = await adapter.create(
      withoutSupportingEvidence(createCommand()),
    );

    expect(result).toMatchObject({
      kind: 'created',
      duplicate: false,
      record: {
        id: 'batch-1',
        organizationId: 'organization-1',
        batchKey: 'decision:stationery:2026-08-01',
        sourceCutoffAt: new Date('2026-07-31T18:00:00.000Z'),
        items: [
          {
            id: 'item-1',
            productName: '컬러 점토 세트',
            baselineScore: 82.25,
            confidence: 0.72,
            policyProbability: null,
          },
        ],
      },
    });
    expect(result.kind === 'created' && result.record.items[0]).not.toHaveProperty('evidence');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'organization-1',
          idempotencyKey: 'decision:stationery:2026-08-01',
        },
      }),
    );

    const createInput = create.mock.calls[0][0];
    expect(createInput.data).toMatchObject({
      organizationId: 'organization-1',
      requestedByUserId: 'user-1',
      idempotencyKey: 'decision:stationery:2026-08-01',
      requestHash: 'request-hash-1',
      decisionMode: 'shadow',
      status: 'shadow',
      businessDate: new Date('2026-08-01T00:00:00.000Z'),
      decisionAt: new Date('2026-07-31T16:30:00.000Z'),
      evidenceCutoffAt: new Date('2026-07-31T18:00:00.000Z'),
      policyKey: 'sourcing-recommendation',
      policyVersion: 'policy-v1',
      modelVersionKey: 'model-v1',
      keyword: '점토',
      category: '완구',
      modelPipeline: 'heuristic-v1',
      modelGeneratorVersion: 'generator-v1',
      expiresAt: new Date('2026-08-04T16:30:00.000Z'),
    });
    expect(createInput.data.items.create).toEqual([
      {
        itemKey: createHash('sha256').update('model-candidate-1').digest('hex'),
        modelCandidateId: 'model-candidate-1',
        displayName: '컬러 점토 세트',
        rank: 1,
        launchCandidateId: 'launch-candidate-1',
        supplierOfferSkuSnapshotId: 'offer-snapshot-1',
        baselineDecision: 'order',
        decision: 'test_order',
        executionEligible: true,
        heuristicScore: 82.25,
        decisionConfidence: 0.72,
        confidenceKind: 'calibrated_probability',
        policyProbability: null,
        evidenceFamilyCount: 3,
        evidencePlatformCount: 2,
        hasCoupangEvidence: true,
        has1688Evidence: true,
        nextEvidenceAction: null,
        reasonCodes: ['all_test_order_gates_passed'],
        riskCodes: [],
        modelOutput: { scoreVersion: 'v1' },
        evidence: {
          create: [
            {
              evidenceObservationId: 'observation-1',
              role: 'context:supply',
              ordinal: 0,
            },
          ],
        },
      },
    ]);
    expect(createInput).not.toHaveProperty('include.items.include');
  });

  it.each([
    ['request-hash-1', 'existing', true],
    ['different-request-hash', 'idempotency_conflict', undefined],
  ] as const)(
    'resolves an existing batch for request hash %s as %s',
    async (requestHash, expectedKind, expectedDuplicate) => {
      const findFirst = vi.fn().mockResolvedValue(batchRow());
      const create = vi.fn();
      const adapter = createAdapter({
        batchFindFirst: findFirst,
        batchCreate: create,
      });

      const result = await adapter.create(createCommand({ requestHash }));

      expect(result.kind).toBe(expectedKind);
      if (expectedDuplicate !== undefined) {
        expect(result).toMatchObject({ duplicate: expectedDuplicate });
      }
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('re-reads the winning row after a P2002 race and enforces requestHash conflict', async () => {
    const findFirst = vi.fn().mockResolvedValueOnce(null);
    const findUnique = vi.fn().mockResolvedValue(batchRow());
    const create = vi.fn().mockRejectedValue({ code: 'P2002' });
    const adapter = createAdapter({
      batchFindFirst: findFirst,
      batchFindUnique: findUnique,
      batchCreate: create,
    });

    const result = await adapter.create(
      withoutSupportingEvidence(
        createCommand({
          requestHash: 'different-request-hash',
        }),
      ),
    );

    expect(result).toEqual({ kind: 'idempotency_conflict' });
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_idempotencyKey: {
            organizationId: 'organization-1',
            idempotencyKey: 'decision:stationery:2026-08-01',
          },
        },
      }),
    );
  });

  it('returns reference_not_found for composite organization reference failures', async () => {
    const adapter = createAdapter({
      batchFindFirst: vi.fn().mockResolvedValue(null),
      batchCreate: vi.fn().mockRejectedValue({ code: 'P2003' }),
    });

    await expect(
      adapter.create(withoutSupportingEvidence(createCommand())),
    ).resolves.toEqual({
      kind: 'reference_not_found',
    });
  });

  it('does not misclassify an unrelated P2002 when no idempotency winner exists', async () => {
    const duplicateEvidence = { code: 'P2002', detail: 'nested evidence' };
    const adapter = createAdapter({
      batchFindFirst: vi.fn().mockResolvedValueOnce(null),
      batchFindUnique: vi.fn().mockResolvedValue(null),
      batchCreate: vi.fn().mockRejectedValue(duplicateEvidence),
    });

    await expect(
      adapter.create(withoutSupportingEvidence(createCommand())),
    ).rejects.toBe(
      duplicateEvidence,
    );
  });

  it('organization-scopes batch and item reads and maps Prisma records', async () => {
    const row = batchRow();
    const batchFindFirst = vi.fn().mockResolvedValue(row);
    const itemFindFirst = vi.fn().mockResolvedValue({
      ...row.items[0],
      decisionBatch: { status: row.status, expiresAt: row.expiresAt },
    });
    const adapter = createAdapter({ batchFindFirst, itemFindFirst });

    const byId = await adapter.findById({
      organizationId: 'organization-1',
      id: 'batch-1',
    });
    const latest = await adapter.findLatest({
      organizationId: 'organization-1',
    });
    const item = await adapter.findItemById({
      organizationId: 'organization-1',
      id: 'item-1',
    });

    expect(batchFindFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'batch-1', organizationId: 'organization-1' },
      }),
    );
    expect(batchFindFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { organizationId: 'organization-1' },
        orderBy: [{ decisionAt: 'desc' }, { createdAt: 'desc' }],
      }),
    );
    expect(itemFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item-1', organizationId: 'organization-1' },
      }),
    );
    expect(byId).toMatchObject({
      batchKey: 'decision:stationery:2026-08-01',
      modelVersion: 'model-v1',
      createdByUserId: 'user-1',
      status: 'shadow',
    });
    expect(latest?.id).toBe('batch-1');
    expect(item).toMatchObject({
      canonicalDecision: 'test_order',
      confidenceKind: 'calibrated_probability',
      modelOutput: { scoreVersion: 'v1' },
      evidence: [{ observationId: 'observation-1' }],
      decisionBatchStatus: 'shadow',
      decisionBatchExpiresAt: row.expiresAt,
    });
  });
});

function createAdapter(input: {
  batchFindFirst?: ReturnType<typeof vi.fn>;
  batchFindUnique?: ReturnType<typeof vi.fn>;
  batchCreate?: ReturnType<typeof vi.fn>;
  itemFindFirst?: ReturnType<typeof vi.fn>;
  evidenceFindFirst?: ReturnType<typeof vi.fn>;
}): SourcingDecisionBatchRepositoryAdapter {
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([
      {
        lock: '',
        at: new Date('2026-07-31T18:00:01.000Z'),
      },
    ]),
    sourcingDecisionBatch: {
      findFirst: input.batchFindFirst ?? vi.fn().mockResolvedValue(null),
      findUnique: input.batchFindUnique ?? vi.fn().mockResolvedValue(null),
      create: input.batchCreate ?? vi.fn(),
    },
    sourcingDecisionBatchItem: {
      findFirst: input.itemFindFirst ?? vi.fn().mockResolvedValue(null),
    },
    sourcingEvidenceObservation: {
      findFirst:
        input.evidenceFindFirst ??
        vi.fn().mockRejectedValue(
          new Error('Supporting evidence acceptance requires PostgreSQL'),
        ),
    },
  } as unknown as PrismaService & {
    $transaction: ReturnType<typeof vi.fn>;
  };
  prisma.$transaction = vi.fn(async (operation) => operation(prisma));
  return new SourcingDecisionBatchRepositoryAdapter(prisma);
}

function createCommand(
  overrides: Partial<CreateSourcingDecisionBatchCommand> = {},
): CreateSourcingDecisionBatchCommand {
  return {
    organizationId: 'organization-1',
    batchKey: 'decision:stationery:2026-08-01',
    requestHash: 'request-hash-1',
    status: 'shadow',
    keyword: '점토',
    category: '완구',
    policyVersion: 'policy-v1',
    modelPipeline: 'heuristic-v1',
    modelVersion: 'model-v1',
    modelGeneratorVersion: 'generator-v1',
    decisionAt: new Date('2026-07-31T16:30:00.000Z'),
    sourceCutoffAt: new Date('2026-07-31T18:00:00.000Z'),
    expiresAt: new Date('2026-08-04T16:30:00.000Z'),
    createdByUserId: 'user-1',
    items: [
      {
        modelCandidateId: 'model-candidate-1',
        rank: 1,
        productName: '컬러 점토 세트',
        supplierOfferSkuSnapshotId: 'offer-snapshot-1',
        launchCandidateId: 'launch-candidate-1',
        baselineDecision: 'order',
        canonicalDecision: 'test_order',
        executionEligible: true,
        baselineScore: 82.25,
        confidence: 0.72,
        confidenceKind: 'calibrated_probability',
        policyProbability: null,
        evidenceFamilyCount: 3,
        evidencePlatformCount: 2,
        hasCoupangEvidence: true,
        has1688Evidence: true,
        nextEvidenceAction: null,
        reasonCodes: ['all_test_order_gates_passed'],
        riskCodes: [],
        modelOutput: { scoreVersion: 'v1' },
        evidence: [
          {
            observationId: 'observation-1',
            evidenceRole: 'support:supply',
            sourceObservation: {
              sourceKey: '1688-api',
              scopeKey: 'stationery',
              observationKey: 'offer-1:evidence',
            },
          },
        ],
      },
    ],
    ...overrides,
  };
}

function withoutSupportingEvidence(
  command: CreateSourcingDecisionBatchCommand,
): CreateSourcingDecisionBatchCommand {
  return {
    ...command,
    items: command.items.map((item) => ({
      ...item,
      evidence: item.evidence.map((evidence) => ({
        ...evidence,
        evidenceRole: evidence.evidenceRole.replace('support:', 'context:'),
      })),
    })),
  };
}

function batchRow(input: { evidenceRole?: string } = {}) {
  const createdAt = new Date('2026-07-31T16:30:01.000Z');
  return {
    id: 'batch-1',
    organizationId: 'organization-1',
    requestedByUserId: 'user-1',
    idempotencyKey: 'decision:stationery:2026-08-01',
    requestHash: 'request-hash-1',
    decisionMode: 'shadow',
    businessDate: new Date('2026-08-01T00:00:00.000Z'),
    decisionAt: new Date('2026-07-31T16:30:00.000Z'),
    evidenceCutoffAt: new Date('2026-07-31T18:00:00.000Z'),
    policyKey: 'sourcing-recommendation',
    policyVersion: 'policy-v1',
    modelVersionKey: 'model-v1',
    status: 'shadow',
    keyword: '점토',
    category: '완구',
    modelPipeline: 'heuristic-v1',
    modelGeneratorVersion: 'generator-v1',
    expiresAt: new Date('2026-08-04T16:30:00.000Z'),
    heuristicArtifactHash: null,
    capitalBudgetKrw: null,
    testSlotLimit: null,
    constraintSetHash: null,
    createdAt,
    items: [
      {
        id: 'item-1',
        organizationId: 'organization-1',
        decisionBatchId: 'batch-1',
        launchCandidateId: 'launch-candidate-1',
        supplierOfferSkuSnapshotId: 'offer-snapshot-1',
        itemKey: 'item-key-1',
        modelCandidateId: 'model-candidate-1',
        displayName: '컬러 점토 세트',
        rank: 1,
        baselineDecision: 'order',
        decision: 'test_order',
        executionEligible: true,
        confidenceKind: 'calibrated_probability',
        policyProbability: null,
        evidenceFamilyCount: 3,
        evidencePlatformCount: 2,
        hasCoupangEvidence: true,
        has1688Evidence: true,
        nextEvidenceAction: null,
        heuristicScore: new Prisma.Decimal('82.25'),
        decisionConfidence: new Prisma.Decimal('0.72'),
        expectedContributionProfit90dKrw: null,
        capitalAtRiskKrw: null,
        reasonCodes: ['all_test_order_gates_passed'],
        riskCodes: [],
        modelOutput: { scoreVersion: 'v1' },
        featureManifestHash: null,
        createdAt,
        evidence: [
          {
            id: 'evidence-1',
            organizationId: 'organization-1',
            decisionBatchItemId: 'item-1',
            evidenceObservationId: 'observation-1',
            role: input.evidenceRole ?? 'support:supply',
            ordinal: 0,
            createdAt,
          },
        ],
      },
    ],
  };
}
