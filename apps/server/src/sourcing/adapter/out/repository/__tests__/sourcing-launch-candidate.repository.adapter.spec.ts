import { describe, expect, it, vi } from 'vitest';
import { SourcingLaunchCandidateRepositoryAdapter } from '../sourcing-launch-candidate.repository.adapter';

describe('SourcingLaunchCandidateRepositoryAdapter', () => {
  it('appends the first immutable launch candidate version under identity and series locks', async () => {
    const tx = launchTx();
    tx.sourcingLaunchCandidate.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    tx.sourcingCandidate.findFirst.mockResolvedValueOnce({
      id: 'source-candidate-1',
    });
    tx.sourcingLaunchCandidate.create.mockResolvedValueOnce(launchRow());
    const repository = new SourcingLaunchCandidateRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.createVersion(command());

    expect(result).toMatchObject({
      kind: 'created',
      duplicate: false,
      record: {
        candidateKey: 'series-1',
        version: 1,
        productConceptVersionKey: 'concept:pencil-case:v3',
        koreanSellableBundleVersionKey: 'bundle:single:v2',
      },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.channelAccount.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'channel-account-1',
        organizationId: 'org-1',
        status: 'active',
        channel: 'coupang',
      },
      select: { id: true },
    });
    expect(tx.sourcingLaunchCandidate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        candidateSeriesKey: 'series-1',
        revision: 1,
        supersedesLaunchCandidateId: null,
        name: 'Magnetic pencil case',
        productConceptVersionKey: 'concept:pencil-case:v3',
        koreanSellableBundleVersionKey: 'bundle:single:v2',
        launchPlanVersionKey: 'launch-plan:v2',
        complianceAssessmentVersionKey: 'compliance:v4',
        qualitySpecVersionKey: 'quality:v3',
        ipClearanceVersionKey: 'ip:v5',
      }),
    });
  });

  it('returns the existing immutable identity without creating another version', async () => {
    const tx = launchTx();
    tx.sourcingLaunchCandidate.findFirst.mockResolvedValueOnce(launchRow());
    tx.channelAccount.findFirst.mockResolvedValueOnce(null);
    const repository = new SourcingLaunchCandidateRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.createVersion(command());

    expect(result).toMatchObject({
      kind: 'existing',
      duplicate: true,
      record: { id: 'launch-1', identityHash: 'a'.repeat(64) },
    });
    expect(tx.sourcingCandidate.findFirst).not.toHaveBeenCalled();
    expect(tx.channelAccount.findFirst).not.toHaveBeenCalled();
    expect(tx.sourcingLaunchCandidate.create).not.toHaveBeenCalled();
  });

  it('rejects a source candidate outside the organization before writing', async () => {
    const tx = launchTx();
    tx.sourcingLaunchCandidate.findFirst.mockResolvedValueOnce(null);
    tx.sourcingCandidate.findFirst.mockResolvedValueOnce(null);
    const repository = new SourcingLaunchCandidateRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.createVersion(command());

    expect(result).toEqual({ kind: 'source_candidate_not_found' });
    expect(tx.sourcingCandidate.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'source-candidate-1',
        organizationId: 'org-1',
        isDeleted: false,
      },
      select: { id: true },
    });
    expect(tx.sourcingLaunchCandidate.create).not.toHaveBeenCalled();
  });

  it('rejects a target account unless it is an active Coupang account in the organization', async () => {
    const tx = launchTx();
    tx.channelAccount.findFirst.mockResolvedValueOnce(null);
    const repository = new SourcingLaunchCandidateRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.createVersion(command());

    expect(result).toEqual({ kind: 'target_channel_account_invalid' });
    expect(tx.channelAccount.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'channel-account-1',
        organizationId: 'org-1',
        status: 'active',
        channel: 'coupang',
      },
      select: { id: true },
    });
    expect(tx.sourcingLaunchCandidate.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        identityHash: 'a'.repeat(64),
      },
    });
    expect(tx.sourcingCandidate.findFirst).not.toHaveBeenCalled();
    expect(tx.sourcingLaunchCandidate.create).not.toHaveBeenCalled();
  });

  it('links a new identity to the preceding version without mutating history', async () => {
    const tx = launchTx();
    tx.sourcingLaunchCandidate.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'launch-1', revision: 1 });
    tx.sourcingCandidate.findFirst.mockResolvedValueOnce({
      id: 'source-candidate-1',
    });
    tx.sourcingLaunchCandidate.create.mockResolvedValueOnce(
      launchRow({
        id: 'launch-2',
        revision: 2,
        identityHash: 'b'.repeat(64),
        supersedesLaunchCandidateId: 'launch-1',
      }),
    );
    const repository = new SourcingLaunchCandidateRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.createVersion(
      command({ identityHash: 'b'.repeat(64) }),
    );

    expect(result).toMatchObject({ kind: 'created', record: { version: 2 } });
    expect(tx.sourcingLaunchCandidate.findFirst).toHaveBeenLastCalledWith({
      where: { organizationId: 'org-1', candidateSeriesKey: 'series-1' },
      orderBy: { revision: 'desc' },
      select: { id: true, revision: true },
    });
    expect(tx.sourcingLaunchCandidate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        identityHash: 'b'.repeat(64),
        revision: 2,
        supersedesLaunchCandidateId: 'launch-1',
      }),
    });
    expect(tx.sourcingLaunchCandidate).not.toHaveProperty('update');
  });

  it('supports a launch candidate without a legacy source workspace', async () => {
    const tx = launchTx();
    tx.sourcingLaunchCandidate.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    tx.sourcingLaunchCandidate.create.mockResolvedValueOnce(
      launchRow({ sourceCandidateId: null }),
    );
    const repository = new SourcingLaunchCandidateRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    await repository.createVersion(command({ sourceCandidateId: null }));

    expect(tx.sourcingCandidate.findFirst).not.toHaveBeenCalled();
    expect(tx.sourcingLaunchCandidate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sourceCandidateId: null }),
    });
  });

  it('org-scopes reads, preserves requested id order, and filters opaque concept keys', async () => {
    const prisma = {
      sourcingLaunchCandidate: {
        findFirst: vi.fn().mockResolvedValue(launchRow()),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            launchRow({ id: 'launch-2' }),
            launchRow({ id: 'launch-1' }),
          ])
          .mockResolvedValueOnce([launchRow()]),
      },
    };
    const repository = new SourcingLaunchCandidateRepositoryAdapter(prisma as never);

    await repository.findById({ organizationId: 'org-1', id: 'launch-1' });
    const byIds = await repository.findByIds({
      organizationId: 'org-1',
      ids: ['launch-1', 'launch-2'],
    });
    await repository.list({
      organizationId: 'org-1',
      productConceptVersionKey: 'concept:pencil-case:v3',
      limit: 20,
    });

    expect(prisma.sourcingLaunchCandidate.findFirst).toHaveBeenCalledWith({
      where: { id: 'launch-1', organizationId: 'org-1' },
    });
    expect(prisma.sourcingLaunchCandidate.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: { in: ['launch-1', 'launch-2'] },
        organizationId: 'org-1',
      },
    });
    expect(byIds.map((record) => record.id)).toEqual(['launch-1', 'launch-2']);
    expect(prisma.sourcingLaunchCandidate.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        organizationId: 'org-1',
        productConceptVersionKey: 'concept:pencil-case:v3',
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });
  });
});

function transactionPrisma(tx: ReturnType<typeof launchTx>) {
  return {
    $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) =>
      operation(tx),
    ),
  };
}

function launchTx() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ lock: '' }]),
    channelAccount: {
      findFirst: vi.fn().mockResolvedValue({ id: 'channel-account-1' }),
    },
    sourcingCandidate: { findFirst: vi.fn() },
    sourcingLaunchCandidate: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    candidateKey: 'series-1',
    identityHash: 'a'.repeat(64),
    sourceCandidateId: 'source-candidate-1',
    supplierOfferSkuSnapshotId: 'offer-snapshot-1',
    targetChannelAccountId: 'channel-account-1',
    productConceptVersionKey: 'concept:pencil-case:v3',
    title: 'Magnetic pencil case',
    koreanSellableBundleVersionKey: 'bundle:single:v2',
    unitsPerSellableBundle: 1,
    initialOrderQuantity: 50,
    targetSalePriceKrw: 12_900,
    fulfillmentMode: 'rocket-growth',
    intendedAgeMinMonths: 96,
    intendedAgeMaxMonths: 168,
    intendedUse: 'school stationery',
    materialProfileKey: 'eva',
    labelingProfileKey: 'children-product',
    launchPlanVersion: 'launch-plan:v2',
    complianceAssessmentVersion: 'compliance:v4',
    qualitySpecVersion: 'quality:v3',
    ipAssessmentVersion: 'ip:v5',
    economicsStatus: 'known' as const,
    complianceStatus: 'passed' as const,
    qualityStatus: 'passed' as const,
    ipStatus: 'passed' as const,
    landedCostKrw: 3_400,
    profitP10Krw: 2_100,
    blockingRiskCodes: [],
    unknownRiskCodes: ['seasonality'],
    bundleSnapshot: { unit: 'piece' },
    launchPlanSnapshot: { channel: 'coupang' },
    economicsSnapshot: { marginBps: 3_100 },
    complianceSnapshot: { kc: 'verified' },
    qualitySnapshot: { aql: 2.5 },
    ipSnapshot: { trademark: 'clear' },
    validUntil: new Date('2026-08-15T00:00:00.000Z'),
    createdByUserId: 'user-1',
    ...overrides,
  };
}

function launchRow(overrides: Record<string, unknown> = {}) {
  const createdAt = new Date('2026-08-01T03:00:00.000Z');
  return {
    id: 'launch-1',
    organizationId: 'org-1',
    sourceCandidateId: 'source-candidate-1',
    supplierOfferSkuSnapshotId: 'offer-snapshot-1',
    targetChannelAccountId: 'channel-account-1',
    supersedesLaunchCandidateId: null,
    candidateSeriesKey: 'series-1',
    revision: 1,
    identityHash: 'a'.repeat(64),
    name: 'Magnetic pencil case',
    productConceptVersionKey: 'concept:pencil-case:v3',
    koreanSellableBundleVersionKey: 'bundle:single:v2',
    launchPlanVersionKey: 'launch-plan:v2',
    complianceAssessmentVersionKey: 'compliance:v4',
    ipClearanceVersionKey: 'ip:v5',
    qualitySpecVersionKey: 'quality:v3',
    intendedAgeMinMonths: 96,
    intendedAgeMaxMonths: 168,
    intendedUse: 'school stationery',
    materialProfileKey: 'eva',
    labelingProfileKey: 'children-product',
    unitsPerSellableBundle: 1,
    initialOrderQuantity: 50,
    targetSalePriceKrw: 12_900,
    fulfillmentMode: 'rocket-growth',
    economicsStatus: 'known',
    complianceStatus: 'passed',
    qualityStatus: 'passed',
    ipStatus: 'passed',
    landedCostKrw: 3_400,
    profitP10Krw: 2_100,
    blockingRiskCodes: [],
    unknownRiskCodes: ['seasonality'],
    bundleSnapshot: { unit: 'piece' },
    launchPlanSnapshot: { channel: 'coupang' },
    economicsSnapshot: { marginBps: 3_100 },
    complianceSnapshot: { kc: 'verified' },
    qualitySnapshot: { aql: 2.5 },
    ipSnapshot: { trademark: 'clear' },
    validUntil: new Date('2026-08-15T00:00:00.000Z'),
    createdByUserId: 'user-1',
    createdAt,
    ...overrides,
  };
}
