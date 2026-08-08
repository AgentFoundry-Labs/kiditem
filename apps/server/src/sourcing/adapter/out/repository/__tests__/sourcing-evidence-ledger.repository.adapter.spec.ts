import { describe, expect, it, vi } from 'vitest';
import { SourcingEvidenceLedgerRepositoryAdapter } from '../sourcing-evidence-ledger.repository.adapter';

describe('SourcingEvidenceLedgerRepositoryAdapter', () => {
  it('maps application collecting to database running and reuses the run key idempotently', async () => {
    const tx = evidenceTx();
    tx.sourcingEvidenceIngestionRun.findFirst.mockResolvedValueOnce(null);
    tx.sourcingEvidenceIngestionRun.create.mockResolvedValueOnce(runRow());
    const repository = new SourcingEvidenceLedgerRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.startRun(startCommand());

    expect(result).toMatchObject({
      kind: 'created',
      duplicate: false,
      record: {
        status: 'collecting',
        runKey: 'run-2026-08-01',
        scopeKey: 'stationery',
        expectedCount: 10,
      },
    });
    expect(tx.sourcingEvidenceIngestionRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        sourceEntitlementVersionId: 'entitlement-1',
        idempotencyKey: 'run-2026-08-01',
        targetKey: 'stationery',
        triggeredByUserId: 'user-1',
        status: 'running',
        coverageDenominator: 10,
      }),
      include: expect.any(Object),
    });
  });

  it('rejects reuse of a run key with a different request hash', async () => {
    const tx = evidenceTx();
    tx.sourcingEvidenceIngestionRun.findFirst.mockResolvedValueOnce(
      runRow({ requestHash: 'b'.repeat(64) }),
    );
    const repository = new SourcingEvidenceLedgerRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.startRun(startCommand());

    expect(result).toEqual({ kind: 'idempotency_conflict' });
    expect(tx.sourcingEvidenceIngestionRun.create).not.toHaveBeenCalled();
  });

  it('rejects a run whose persisted entitlement belongs to a different scope', async () => {
    const tx = evidenceTx();
    tx.sourcingEvidenceIngestionRun.findFirst.mockResolvedValueOnce(null);
    tx.sourcingEvidenceIngestionRun.create.mockResolvedValueOnce(
      runRow({
        sourceEntitlementVersion: {
          sourceKey: '1688',
          scopeKey: 'default',
          decisionImpact: 'enabled',
        },
      }),
    );
    const repository = new SourcingEvidenceLedgerRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    await expect(repository.startRun(startCommand())).rejects.toThrow(
      'Evidence run entitlement does not match the requested source contract.',
    );
  });

  it('appends observations once and updates only the organization-scoped collecting run', async () => {
    const tx = evidenceTx();
    tx.sourcingEvidenceIngestionRun.findFirst.mockResolvedValueOnce(runRow());
    tx.sourcingEvidenceObservation.findFirst.mockResolvedValueOnce(null);
    const repository = new SourcingEvidenceLedgerRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.appendObservations([observationCommand()]);

    expect(result).toMatchObject({
      kind: 'appended',
      duplicateCount: 0,
      records: [{ observationKey: 'c'.repeat(64), sourceEntityId: 'offer-1' }],
    });
    expect(tx.sourcingEvidenceObservation.create).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(5);
    expect(tx.sourcingEvidenceIngestionRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-1', organizationId: 'org-1', status: 'running' },
      data: {
        discoveredCount: { increment: 1 },
        acceptedCount: { increment: 1 },
        duplicateCount: { increment: 0 },
        coverageNumerator: { increment: 1 },
      },
    });
  });

  it('does not mutate append-only evidence when the same revision is retried', async () => {
    const tx = evidenceTx();
    tx.sourcingEvidenceIngestionRun.findFirst.mockResolvedValueOnce(runRow());
    tx.sourcingEvidenceObservation.findFirst.mockResolvedValueOnce(
      observationRow(),
    );
    const repository = new SourcingEvidenceLedgerRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.appendObservations([observationCommand()]);

    expect(result).toMatchObject({ kind: 'appended', duplicateCount: 1 });
    expect(tx.sourcingEvidenceObservation.create).not.toHaveBeenCalled();
    expect(tx.sourcingEvidenceIngestionRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acceptedCount: { increment: 0 } }),
      }),
    );
  });

  it('rejects a retry when immutable source provenance changed despite matching payload', async () => {
    const tx = evidenceTx();
    tx.sourcingEvidenceIngestionRun.findFirst.mockResolvedValueOnce(runRow());
    tx.sourcingEvidenceObservation.findFirst.mockResolvedValueOnce(
      observationRow(),
    );
    const repository = new SourcingEvidenceLedgerRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.appendObservations([
      {
        ...observationCommand(),
        sourceUrl: 'https://detail.1688.com/offer/changed.html',
      },
    ]);

    expect(result).toEqual({
      kind: 'observation_conflict',
      observationKey: 'c'.repeat(64),
      revision: 1,
    });
    expect(tx.sourcingEvidenceObservation.create).not.toHaveBeenCalled();
  });

  it('closes the append race when the run entitlement is no longer current', async () => {
    const tx = evidenceTx();
    tx.sourcingEvidenceIngestionRun.findFirst.mockResolvedValueOnce(runRow());
    tx.sourcingSourceEntitlementVersion.findFirst.mockResolvedValueOnce({
      id: 'entitlement-new',
    });
    const repository = new SourcingEvidenceLedgerRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.appendObservations([observationCommand()]);

    expect(result).toEqual({ kind: 'source_entitlement_changed' });
    expect(tx.sourcingEvidenceObservation.create).not.toHaveBeenCalled();
    expect(tx.sourcingEvidenceIngestionRun.updateMany).not.toHaveBeenCalled();
  });

  it('closes the append race when the current entitlement is no longer collectable', async () => {
    const tx = evidenceTx();
    tx.sourcingEvidenceIngestionRun.findFirst.mockResolvedValueOnce(runRow());
    tx.sourcingSourceEntitlementVersion.findFirst.mockResolvedValueOnce(null);
    const repository = new SourcingEvidenceLedgerRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.appendObservations([observationCommand()]);

    expect(result).toEqual({ kind: 'source_entitlement_changed' });
    expect(tx.sourcingSourceEntitlementVersion.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'entitlement-1',
        organizationId: 'org-1',
        sourceKey: '1688',
        scopeKey: 'stationery',
        isCurrent: true,
        killSwitch: false,
        sourceLifecycle: { in: ['onboarding', 'shadow', 'qualified'] },
      }),
      select: { id: true },
    });
    expect(tx.sourcingEvidenceObservation.create).not.toHaveBeenCalled();
    expect(tx.sourcingEvidenceIngestionRun.updateMany).not.toHaveBeenCalled();
  });

  it('reports an observation conflict before writing any rows', async () => {
    const tx = evidenceTx();
    tx.sourcingEvidenceIngestionRun.findFirst.mockResolvedValueOnce(runRow());
    tx.sourcingEvidenceObservation.findFirst.mockResolvedValueOnce(
      observationRow({ payloadHash: 'different-hash' }),
    );
    const repository = new SourcingEvidenceLedgerRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.appendObservations([observationCommand()]);

    expect(result).toEqual({
      kind: 'observation_conflict',
      observationKey: 'c'.repeat(64),
      revision: 1,
    });
    expect(tx.sourcingEvidenceObservation.create).not.toHaveBeenCalled();
    expect(tx.sourcingEvidenceIngestionRun.updateMany).not.toHaveBeenCalled();
  });

  it('does not treat a same-payload revision from another source scope as a duplicate', async () => {
    const tx = evidenceTx();
    tx.sourcingEvidenceIngestionRun.findFirst.mockResolvedValueOnce(runRow());
    tx.sourcingEvidenceObservation.findFirst.mockResolvedValueOnce(
      observationRow({
        ingestionRun: {
          sourceEntitlementVersionId: 'entitlement-other',
          status: 'complete',
          targetKey: 'toys',
        },
      }),
    );
    const repository = new SourcingEvidenceLedgerRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.appendObservations([observationCommand()]);

    expect(result).toEqual({
      kind: 'observation_series_mismatch',
      observationKey: 'c'.repeat(64),
      revision: 1,
    });
    expect(tx.sourcingEvidenceIngestionRun.updateMany).not.toHaveBeenCalled();
  });

  it('rejects same-batch duplicates whose immutable envelope differs', async () => {
    const tx = evidenceTx();
    tx.sourcingEvidenceIngestionRun.findFirst.mockResolvedValueOnce(runRow());
    const repository = new SourcingEvidenceLedgerRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.appendObservations([
      observationCommand(),
      { ...observationCommand(), sourceEntityId: 'different-offer' },
    ]);

    expect(result).toEqual({
      kind: 'observation_series_mismatch',
      observationKey: 'c'.repeat(64),
      revision: 1,
    });
    expect(tx.sourcingEvidenceObservation.create).not.toHaveBeenCalled();
  });

  it('rejects a non-sequential revision without its predecessor', async () => {
    const tx = evidenceTx();
    tx.sourcingEvidenceIngestionRun.findFirst.mockResolvedValueOnce(runRow());
    tx.sourcingEvidenceObservation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const repository = new SourcingEvidenceLedgerRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.appendObservations([
      {
        ...observationCommand(),
        revision: 2,
      },
    ]);

    expect(result).toEqual({
      kind: 'observation_revision_gap',
      observationKey: 'c'.repeat(64),
      revision: 2,
    });
    expect(tx.sourcingEvidenceObservation.create).not.toHaveBeenCalled();
  });

  it('does not count a correction revision as a new coverage unit', async () => {
    const tx = evidenceTx();
    tx.sourcingEvidenceIngestionRun.findFirst.mockResolvedValueOnce(runRow());
    tx.sourcingEvidenceObservation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        observationRow({ id: 'observation-previous', revision: 1 }),
      );
    const repository = new SourcingEvidenceLedgerRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.appendObservations([
      {
        ...observationCommand(),
        revision: 2,
      },
    ]);

    expect(result).toMatchObject({ kind: 'appended', duplicateCount: 0 });
    expect(tx.sourcingEvidenceIngestionRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-1', organizationId: 'org-1', status: 'running' },
      data: {
        discoveredCount: { increment: 1 },
        acceptedCount: { increment: 1 },
        duplicateCount: { increment: 0 },
        coverageNumerator: { increment: 0 },
      },
    });
  });

  it('rejects a revision that changes immutable observation-series identity', async () => {
    const tx = evidenceTx();
    tx.sourcingEvidenceIngestionRun.findFirst.mockResolvedValueOnce(runRow());
    tx.sourcingEvidenceObservation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...observationRow(),
        id: 'observation-previous',
        sourceEntityKey: 'different-offer',
      });
    const repository = new SourcingEvidenceLedgerRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.appendObservations([
      {
        ...observationCommand(),
        revision: 2,
      },
    ]);

    expect(result).toEqual({
      kind: 'observation_series_mismatch',
      observationKey: 'c'.repeat(64),
      revision: 2,
    });
    expect(tx.sourcingEvidenceObservation.create).not.toHaveBeenCalled();
  });

  it('rejects appends after the run is terminal and maps finalization back to the app status', async () => {
    const terminalTx = evidenceTx();
    terminalTx.sourcingEvidenceIngestionRun.findFirst.mockResolvedValueOnce(
      runRow({
        status: 'complete',
        completedAt: new Date('2026-08-01T02:00:00.000Z'),
      }),
    );
    const terminalRepository = new SourcingEvidenceLedgerRepositoryAdapter(
      transactionPrisma(terminalTx) as never,
    );
    const appendResult = await terminalRepository.appendObservations([
      observationCommand(),
    ]);

    const finalizeTx = evidenceTx();
    finalizeTx.sourcingEvidenceIngestionRun.findFirst.mockResolvedValueOnce(
      runRow({ coverageNumerator: 3, coverageDenominator: 4 }),
    );
    finalizeTx.sourcingEvidenceIngestionRun.update.mockResolvedValueOnce(
      runRow({
        status: 'partial',
        watermarkAfter: '2026-08-01T01:30:00.000Z',
        coverageNumerator: 3,
        coverageDenominator: 4,
        qualityReport: { coverageBps: 7_500 },
        completedAt: new Date('2026-08-01T02:00:00.000Z'),
      }),
    );
    const finalizeRepository = new SourcingEvidenceLedgerRepositoryAdapter(
      transactionPrisma(finalizeTx) as never,
    );
    const finalizeResult = await finalizeRepository.finalizeRun({
      organizationId: 'org-1',
      runId: 'run-1',
      status: 'partial',
      coverageBps: 7_500,
      watermarkEventAt: new Date('2026-08-01T01:30:00.000Z'),
      errorCode: null,
      errorMessage: null,
      completedAt: new Date('2026-08-01T02:00:00.000Z'),
    });

    expect(appendResult).toEqual({
      kind: 'run_not_collecting',
      status: 'complete',
    });
    expect(finalizeResult).toMatchObject({
      kind: 'finalized',
      record: { status: 'partial', coverageBps: 7_500 },
    });
    expect(finalizeTx.sourcingEvidenceIngestionRun.update).toHaveBeenCalledWith(
      {
        where: { id: 'run-1' },
        data: expect.objectContaining({
          status: 'partial',
          watermarkAfter: '2026-08-01T01:30:00.000Z',
          qualityReport: expect.objectContaining({ coverageBps: 7_500 }),
        }),
        include: expect.any(Object),
      },
    );
  });

  it('rejects collector-supplied coverage that differs from durable run counts', async () => {
    const tx = evidenceTx();
    tx.sourcingEvidenceIngestionRun.findFirst.mockResolvedValueOnce(
      runRow({ coverageNumerator: 1, coverageDenominator: 4 }),
    );
    const repository = new SourcingEvidenceLedgerRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.finalizeRun({
      organizationId: 'org-1',
      runId: 'run-1',
      status: 'complete',
      coverageBps: 10_000,
      watermarkEventAt: null,
      errorCode: null,
      errorMessage: null,
      completedAt: new Date('2026-08-01T02:00:00.000Z'),
    });

    expect(result).toEqual({
      kind: 'coverage_mismatch',
      derivedCoverageBps: 2_500,
    });
    expect(tx.sourcingEvidenceIngestionRun.update).not.toHaveBeenCalled();
  });

  it('does not complete a run after its exact source entitlement lane closes', async () => {
    const tx = evidenceTx();
    tx.sourcingEvidenceIngestionRun.findFirst.mockResolvedValueOnce(
      runRow({ coverageNumerator: 1, coverageDenominator: 1 }),
    );
    tx.sourcingSourceEntitlementVersion.findFirst.mockResolvedValueOnce(null);
    const repository = new SourcingEvidenceLedgerRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.finalizeRun({
      organizationId: 'org-1',
      runId: 'run-1',
      status: 'complete',
      coverageBps: 10_000,
      watermarkEventAt: null,
      errorCode: null,
      errorMessage: null,
      completedAt: new Date('2026-08-01T02:00:00.000Z'),
    });

    expect(result).toEqual({ kind: 'source_entitlement_changed' });
    expect(tx.sourcingEvidenceIngestionRun.update).not.toHaveBeenCalled();
  });

  it('scopes observation lookups by organization and preserves caller order', async () => {
    const prisma = {
      sourcingEvidenceObservation: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            observationRow({ id: 'observation-2' }),
            observationRow({ id: 'observation-1' }),
          ]),
      },
    };
    const repository = new SourcingEvidenceLedgerRepositoryAdapter(
      prisma as never,
    );

    const records = await repository.findObservationsByIds({
      organizationId: 'org-1',
      observationIds: ['observation-1', 'observation-2'],
    });

    expect(prisma.sourcingEvidenceObservation.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['observation-1', 'observation-2'] },
        organizationId: 'org-1',
      },
      include: expect.any(Object),
    });
    expect(records.map((record) => record.id)).toEqual([
      'observation-1',
      'observation-2',
    ]);
    expect(records[0]).toMatchObject({ sourceScopeKey: 'stationery' });
  });

  it('resolves the absolute latest revision visible at the point-in-time cutoff', async () => {
    const prisma = {
      sourcingEvidenceObservation: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'observation-2', observationKey: 'key-a', revision: 2 },
          { id: 'observation-1', observationKey: 'key-a', revision: 1 },
          { id: 'observation-b', observationKey: 'key-b', revision: 1 },
        ]),
      },
    };
    const repository = new SourcingEvidenceLedgerRepositoryAdapter(
      prisma as never,
    );
    const cutoffAt = new Date('2026-08-01T02:00:00.000Z');

    const records = await repository.findLatestObservationRevisions({
      organizationId: 'org-1',
      observationKeys: ['key-b', 'key-a', 'key-a'],
      cutoffAt,
    });

    expect(prisma.sourcingEvidenceObservation.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        observationKey: { in: ['key-b', 'key-a'] },
        availableAt: { lte: cutoffAt },
        ingestedAt: { lte: cutoffAt },
      },
      select: { id: true, observationKey: true, revision: true },
      orderBy: [
        { observationKey: 'asc' },
        { revision: 'desc' },
        { availableAt: 'desc' },
        { ingestedAt: 'desc' },
        { id: 'desc' },
      ],
    });
    expect(records).toEqual([
      { observationKey: 'key-b', observationId: 'observation-b', revision: 1 },
      { observationKey: 'key-a', observationId: 'observation-2', revision: 2 },
    ]);
  });
});

function transactionPrisma(tx: ReturnType<typeof evidenceTx>) {
  return {
    $transaction: vi.fn(
      async (operation: (client: typeof tx) => Promise<unknown>) =>
        operation(tx),
    ),
  };
}

function evidenceTx() {
  const databaseAt = new Date('2026-08-01T01:10:00.000Z');
  return {
    $queryRaw: vi.fn((strings: TemplateStringsArray) => {
      const sql = strings.join(' ');
      if (sql.includes('INSERT INTO sourcing_evidence_observations')) {
        return Promise.resolve([{ id: 'observation-1' }]);
      }
      if (sql.includes('clock_timestamp()')) {
        return Promise.resolve([{ at: databaseAt }]);
      }
      return Promise.resolve([{ lock: '' }]);
    }),
    sourcingEvidenceIngestionRun: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    sourcingSourceEntitlementVersion: {
      findFirst: vi.fn().mockResolvedValue({ id: 'entitlement-1' }),
    },
    sourcingEvidenceObservation: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };
}

function startCommand() {
  return {
    organizationId: 'org-1',
    sourceEntitlementVersionId: 'entitlement-1',
    sourceKey: '1688',
    runKey: 'run-2026-08-01',
    requestHash: 'a'.repeat(64),
    scopeKey: 'stationery',
    collectorVersion: '1688-collector/v1',
    triggeredByUserId: 'user-1',
    decisionImpactAtIngest: 'enabled' as const,
    windowStartAt: new Date('2026-08-01T00:00:00.000Z'),
    windowEndAt: new Date('2026-08-01T01:00:00.000Z'),
    expectedCount: 10,
    startedAt: new Date('2026-08-01T01:00:00.000Z'),
  };
}

function observationCommand() {
  const capturedAt = new Date('2026-08-01T01:10:00.000Z');
  return {
    organizationId: 'org-1',
    ingestionRunId: 'run-1',
    sourceEntitlementVersionId: 'entitlement-1',
    sourceKey: '1688',
    platform: '1688',
    evidenceFamily: 'china_supply',
    signalRole: 'supply' as const,
    granularity: 'supply_catalog' as const,
    conceptKey: 'pencil-case',
    sourceEntityType: 'offer',
    sourceEntityId: 'offer-1',
    schemaVersion: '1688-offer/v1',
    observationKey: 'c'.repeat(64),
    revision: 1,
    supportsCandidate: true,
    decisionImpactAtIngest: 'enabled' as const,
    sourceUrl: 'https://detail.1688.com/offer/1.html',
    eventAt: capturedAt,
    observedAt: capturedAt,
    availableAt: capturedAt,
    revisionAt: null,
    payloadHash: 'd'.repeat(64),
    rawPayload: { title: '연필통' },
    ingestedAt: capturedAt,
  };
}

function runRow(overrides: Record<string, unknown> = {}) {
  const startedAt = new Date('2026-08-01T01:00:00.000Z');
  return {
    id: 'run-1',
    organizationId: 'org-1',
    sourceEntitlementVersionId: 'entitlement-1',
    targetKey: 'stationery',
    idempotencyKey: 'run-2026-08-01',
    requestHash: 'a'.repeat(64),
    collectorKey: '1688',
    collectorVersion: '1688-collector/v1',
    triggerKind: 'collector',
    triggeredByUserId: null,
    status: 'running',
    sourceWindowStartAt: new Date('2026-08-01T00:00:00.000Z'),
    sourceWindowEndAt: new Date('2026-08-01T01:00:00.000Z'),
    watermarkBefore: null,
    watermarkAfter: null,
    discoveredCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    duplicateCount: 0,
    coverageNumerator: 0,
    coverageDenominator: 10,
    qualityReport: { coverageBps: null, decisionImpactAtIngest: 'enabled' },
    errorCode: null,
    errorMessage: null,
    startedAt,
    completedAt: null,
    createdAt: startedAt,
    updatedAt: startedAt,
    sourceEntitlementVersion: {
      sourceKey: '1688',
      scopeKey: 'stationery',
      decisionImpact: 'enabled',
    },
    ...overrides,
  };
}

function observationRow(overrides: Record<string, unknown> = {}) {
  const capturedAt = new Date('2026-08-01T01:10:00.000Z');
  return {
    id: 'observation-1',
    organizationId: 'org-1',
    ingestionRunId: 'run-1',
    supersedesObservationId: null,
    sourceKey: '1688',
    platform: '1688',
    evidenceFamily: 'china_supply',
    signalRole: 'supply',
    conceptKey: 'pencil-case',
    supportsCandidate: true,
    observationKey: 'c'.repeat(64),
    revision: 1,
    sourceEntityType: 'offer',
    sourceEntityKey: 'offer-1',
    observationType: 'china_supply',
    schemaVersion: '1688-offer/v1',
    evidenceClass: 'supply_catalog',
    decisionImpact: 'enabled',
    eventAt: capturedAt,
    observedAt: capturedAt,
    availableAt: capturedAt,
    revisionAt: null,
    businessDate: null,
    sourceRevisionKey: `${'c'.repeat(64)}:1`,
    sourceUrl: 'https://detail.1688.com/offer/1.html',
    payloadHash: 'd'.repeat(64),
    payload: { title: '연필통' },
    rawArtifactRef: null,
    ingestedAt: capturedAt,
    createdAt: capturedAt,
    ingestionRun: {
      sourceEntitlementVersionId: 'entitlement-1',
      status: 'complete',
      targetKey: 'stationery',
      coverageNumerator: 10,
      coverageDenominator: 10,
      qualityReport: { coverageBps: 10_000 },
      completedAt: capturedAt,
    },
    ...overrides,
  };
}
