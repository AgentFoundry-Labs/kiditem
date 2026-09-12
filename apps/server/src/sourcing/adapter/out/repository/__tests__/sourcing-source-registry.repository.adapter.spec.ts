import { describe, expect, it, vi } from 'vitest';
import { SourcingSourceRegistryRepositoryAdapter } from '../sourcing-source-registry.repository.adapter';

const reviewedAt = new Date('2026-08-01T01:00:00.000Z');

describe('SourcingSourceRegistryRepositoryAdapter', () => {
  it('creates the first current version under an organization-scoped advisory lock', async () => {
    const created = entitlementRow({ scopeKey: 'stationery' });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ lock: '' }]),
      sourcingSourceEntitlementVersion: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn(),
        create: vi.fn().mockResolvedValue(created),
      },
    };
    const prisma = transactionPrisma(tx);
    const repository = new SourcingSourceRegistryRepositoryAdapter(prisma as never);

    const result = await repository.createVersion(command({ scopeKey: 'stationery' }));

    expect(result).toMatchObject({ kind: 'created', duplicate: false });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.sourcingSourceEntitlementVersion.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        sourceKey: 'naver-datalab',
        scopeKey: 'stationery',
        isCurrent: true,
      },
    });
    expect(tx.sourcingSourceEntitlementVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        sourceKey: 'naver-datalab',
        scopeKey: 'stationery',
        version: 1,
        versionHash: 'a'.repeat(64),
        expectedDelaySeconds: 300,
        maxStalenessSeconds: 3_600,
        minimumCoverageBps: 8_000,
        reviewedByUserId: 'user-1',
      }),
    });
    expect(tx.sourcingSourceEntitlementVersion.updateMany).not.toHaveBeenCalled();
  });

  it('returns the current row without mutating history when the version hash matches', async () => {
    const existing = entitlementRow();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ lock: '' }]),
      sourcingSourceEntitlementVersion: {
        findFirst: vi.fn().mockResolvedValue(existing),
        updateMany: vi.fn(),
        create: vi.fn(),
      },
    };
    const repository = new SourcingSourceRegistryRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.createVersion(command());

    expect(result).toMatchObject({
      kind: 'existing',
      duplicate: true,
      record: {
        id: 'entitlement-1',
        expectedDelayMinutes: 5,
        maxStalenessMinutes: 60,
        minimumCoverageBps: 8_000,
      },
    });
    expect(tx.sourcingSourceEntitlementVersion.updateMany).not.toHaveBeenCalled();
    expect(tx.sourcingSourceEntitlementVersion.create).not.toHaveBeenCalled();
  });

  it('retires only the scoped current row and appends the next version', async () => {
    const current = entitlementRow();
    const next = entitlementRow({
      id: 'entitlement-2',
      version: 2,
      versionHash: 'b'.repeat(64),
    });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ lock: '' }]),
      sourcingSourceEntitlementVersion: {
        findFirst: vi.fn().mockResolvedValue(current),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue(next),
      },
    };
    const repository = new SourcingSourceRegistryRepositoryAdapter(
      transactionPrisma(tx) as never,
    );

    const result = await repository.createVersion(
      command({ versionHash: 'b'.repeat(64) }),
    );

    expect(result).toMatchObject({ kind: 'created', record: { version: 2 } });
    expect(tx.sourcingSourceEntitlementVersion.updateMany).toHaveBeenCalledWith({
      where: { id: 'entitlement-1', organizationId: 'org-1', isCurrent: true },
      data: { isCurrent: false, retiredAt: reviewedAt },
    });
    expect(tx.sourcingSourceEntitlementVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ version: 2, versionHash: 'b'.repeat(64) }),
    });
  });

  it('scopes current and history reads by organization and exact source scope', async () => {
    const prisma = {
      sourcingSourceEntitlementVersion: {
        findFirst: vi.fn().mockResolvedValue(entitlementRow({ scopeKey: 'stationery' })),
        findMany: vi.fn().mockResolvedValue([
          entitlementRow({ scopeKey: 'stationery' }),
        ]),
      },
    };
    const repository = new SourcingSourceRegistryRepositoryAdapter(prisma as never);

    const current = await repository.findCurrent({
      organizationId: 'org-1',
      sourceKey: 'naver-datalab',
      scopeKey: 'stationery',
    });
    await repository.list({
      organizationId: 'org-1',
      sourceKey: 'naver-datalab',
      scopeKey: 'stationery',
      includeHistory: true,
    });

    expect(current).toMatchObject({ scopeKey: 'stationery' });
    expect(prisma.sourcingSourceEntitlementVersion.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        sourceKey: 'naver-datalab',
        scopeKey: 'stationery',
        isCurrent: true,
      },
    });
    expect(prisma.sourcingSourceEntitlementVersion.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        scopeKey: 'stationery',
        sourceKey: 'naver-datalab',
      },
      orderBy: [{ sourceKey: 'asc' }, { version: 'desc' }],
    });
  });

  it('applies the requested scope to multi-source current reads', async () => {
    const prisma = {
      sourcingSourceEntitlementVersion: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = new SourcingSourceRegistryRepositoryAdapter(prisma as never);

    await repository.findCurrentBySourceKeys({
      organizationId: 'org-1',
      sourceKeys: ['1688', 'coupang-api'],
      scopeKey: 'toys',
    });

    expect(prisma.sourcingSourceEntitlementVersion.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        sourceKey: { in: ['1688', 'coupang-api'] },
        scopeKey: 'toys',
        isCurrent: true,
      },
      orderBy: { sourceKey: 'asc' },
    });
  });
});

function transactionPrisma(tx: Record<string, unknown>) {
  return {
    $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) =>
      operation(tx),
    ),
  };
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    sourceKey: 'naver-datalab',
    scopeKey: 'default',
    versionHash: 'a'.repeat(64),
    lifecycle: 'qualified' as const,
    decisionImpact: 'enabled' as const,
    ownerLabel: 'Naver API owner',
    legalBasis: 'official-api',
    allowedMethod: 'api',
    credentialRef: 'secret://naver',
    permittedFields: ['keyword', 'ratio'],
    prohibitedUses: ['resale'],
    rateLimitValue: 1_000,
    rateLimitWindowSeconds: 86_400,
    geographyCoverage: ['KR'],
    coverageDefinition: 'configured keyword groups',
    accountCoverage: 'KidItem registered app',
    searchCoverage: 'configured keyword groups',
    categoryCoverage: 'stationery and toys',
    denominatorDefinition: 'requested keyword groups',
    historyBackfill: 'none',
    expectedDelayMinutes: 5,
    maxStalenessMinutes: 60,
    minimumCoverageBps: 8_000,
    revisionPolicy: 'append',
    retentionDays: 365,
    permissionStartsAt: new Date('2026-08-01T00:00:00.000Z'),
    permissionExpiresAt: new Date('2027-08-01T00:00:00.000Z'),
    killSwitch: false,
    reviewNote: 'approved',
    reviewedByUserId: 'user-1',
    reviewedAt,
    ...overrides,
  };
}

function entitlementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entitlement-1',
    organizationId: 'org-1',
    sourceKey: 'naver-datalab',
    scopeKey: 'default',
    version: 1,
    versionHash: 'a'.repeat(64),
    sourceLifecycle: 'qualified',
    decisionImpact: 'enabled',
    ownerLabel: 'Naver API owner',
    legalBasis: 'official-api',
    allowedMethod: 'api',
    credentialRef: 'secret://naver',
    permittedFields: ['keyword', 'ratio'],
    prohibitedUses: ['resale'],
    rateLimitValue: null,
    rateLimitWindowSeconds: null,
    geographyCoverage: [],
    coverageDefinition: 'configured keyword groups',
    accountCoverage: null,
    searchCoverage: null,
    categoryCoverage: null,
    denominatorDefinition: 'requested keyword groups',
    historyBackfillPolicy: 'none',
    expectedDelaySeconds: 300,
    maxStalenessSeconds: 3_600,
    minimumCoverageBps: 8_000,
    revisionPolicy: 'append',
    retentionDays: 365,
    permissionStartsAt: null,
    permissionExpiresAt: new Date('2027-08-01T00:00:00.000Z'),
    killSwitch: false,
    killReason: 'approved',
    isCurrent: true,
    reviewedByUserId: 'user-1',
    reviewedAt,
    retiredAt: null,
    createdAt: reviewedAt,
    ...overrides,
  };
}
