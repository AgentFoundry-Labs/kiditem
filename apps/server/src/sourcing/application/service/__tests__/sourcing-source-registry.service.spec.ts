import { describe, expect, it, vi } from 'vitest';
import { SourcingSourceRegistryService } from '../sourcing-source-registry.service';

describe('SourcingSourceRegistryService scope authorization', () => {
  it('keeps legacy calls on the explicit default scope and preserves custom scopes', async () => {
    const repository = sourceRepository();
    const service = new SourcingSourceRegistryService(repository as never);

    await service.createVersion(entitlementInput());
    await service.createVersion(entitlementInput({ scopeKey: ' Toys:KR ' }));

    const defaultCommand = repository.createVersion.mock.calls[0][0];
    const customCommand = repository.createVersion.mock.calls[1][0];
    expect(defaultCommand.scopeKey).toBe('default');
    expect(customCommand.scopeKey).toBe('toys:kr');
    expect(customCommand.versionHash).not.toBe(defaultCommand.versionHash);
  });

  it('hashes valid permission dates as canonical ISO strings', async () => {
    const repository = sourceRepository();
    const service = new SourcingSourceRegistryService(repository as never);

    await expect(service.createVersion(entitlementInput({
      permissionStartsAt: new Date('2026-08-01T00:00:00.000Z'),
      permissionExpiresAt: new Date('2027-08-01T00:00:00.000Z'),
    }))).resolves.toBeDefined();
    expect(repository.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({ versionHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    );
  });

  it('does not fall back to a default entitlement for an arbitrary scope', async () => {
    const repository = sourceRepository();
    repository.findCurrent.mockImplementation(async ({ scopeKey }) =>
      scopeKey === 'default' ? entitlementRecord() : null,
    );
    const service = new SourcingSourceRegistryService(repository as never);

    const custom = await service.authorize({
      organizationId: 'org-1',
      sourceKey: '1688',
      scopeKey: 'stationery',
      operation: 'collect',
      at: new Date('2026-08-08T00:00:00.000Z'),
    });
    const legacyDefault = await service.authorize({
      organizationId: 'org-1',
      sourceKey: '1688',
      operation: 'collect',
      at: new Date('2026-08-08T00:00:00.000Z'),
    });

    expect(custom).toEqual({
      allowed: false,
      reasonCode: 'source_entitlement_missing',
      entitlement: null,
    });
    expect(legacyDefault.allowed).toBe(true);
    expect(repository.findCurrent).toHaveBeenNthCalledWith(1, {
      organizationId: 'org-1',
      sourceKey: '1688',
      scopeKey: 'stationery',
    });
    expect(repository.findCurrent).toHaveBeenNthCalledWith(2, {
      organizationId: 'org-1',
      sourceKey: '1688',
      scopeKey: 'default',
    });
  });

  it('rejects decision-enabled sources without coverage, freshness, revision, and retention contracts', async () => {
    const repository = sourceRepository();
    const service = new SourcingSourceRegistryService(repository as never);

    await expect(service.createVersion({
      ...entitlementInput(),
      permittedFields: [],
      coverageDefinition: null,
      denominatorDefinition: null,
      maxStalenessMinutes: null,
      minimumCoverageBps: null,
      revisionPolicy: null,
      retentionDays: null,
    })).rejects.toMatchObject({
      response: {
        code: 'invalid_source_entitlement',
        violations: expect.arrayContaining([
          'decision_impact_requires_permitted_fields',
          'decision_impact_requires_coverage_definition',
          'decision_impact_requires_denominator_definition',
          'decision_impact_requires_max_staleness',
          'decision_impact_requires_minimum_coverage',
          'decision_impact_requires_revision_policy',
          'decision_impact_requires_retention_policy',
        ]),
      },
    });
    expect(repository.createVersion).not.toHaveBeenCalled();
  });

  it('denies scoring for a legacy enabled source with an incomplete quality contract', async () => {
    const repository = sourceRepository();
    repository.findCurrent.mockResolvedValue(entitlementRecord({
      permittedFields: [],
      coverageDefinition: null,
      denominatorDefinition: null,
      maxStalenessMinutes: null,
      minimumCoverageBps: null,
      revisionPolicy: null,
      retentionDays: null,
    }));
    const service = new SourcingSourceRegistryService(repository as never);

    await expect(service.authorize({
      organizationId: 'org-1',
      sourceKey: '1688',
      operation: 'score',
      at: new Date('2026-08-08T00:00:00.000Z'),
    })).resolves.toMatchObject({
      allowed: false,
      reasonCode: 'source_quality_contract_incomplete',
    });
  });
});

function sourceRepository() {
  return {
    createVersion: vi.fn().mockResolvedValue({
      kind: 'created',
      duplicate: false,
      record: entitlementRecord(),
    }),
    findCurrent: vi.fn(),
    findCurrentBySourceKeys: vi.fn(),
    list: vi.fn(),
  };
}

function entitlementInput(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    sourceKey: '1688',
    lifecycle: 'qualified' as const,
    decisionImpact: 'enabled' as const,
    ownerLabel: '1688 collector owner',
    legalBasis: 'contracted access',
    allowedMethod: 'reviewed collector',
    permittedFields: ['offerId', 'skuId', 'priceTier'],
    coverageDefinition: 'configured category searches',
    denominatorDefinition: 'all returned offers',
    maxStalenessMinutes: 1_440,
    minimumCoverageBps: 8_000,
    revisionPolicy: 'append revisions',
    retentionDays: 365,
    reviewedByUserId: 'user-1',
    ...overrides,
  };
}

function entitlementRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entitlement-default',
    organizationId: 'org-1',
    sourceKey: '1688',
    scopeKey: 'default',
    lifecycle: 'qualified',
    decisionImpact: 'enabled',
    killSwitch: false,
    permissionStartsAt: null,
    permissionExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    permittedFields: ['offerId', 'skuId', 'priceTier'],
    coverageDefinition: 'configured category searches',
    denominatorDefinition: 'all returned offers',
    maxStalenessMinutes: 1_440,
    minimumCoverageBps: 8_000,
    revisionPolicy: 'append revisions',
    retentionDays: 365,
    ...overrides,
  };
}
