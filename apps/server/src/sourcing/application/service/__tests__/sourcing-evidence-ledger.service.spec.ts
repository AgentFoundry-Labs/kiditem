import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SourcingEvidenceLedgerService } from '../sourcing-evidence-ledger.service';
import { SourcingSourceRegistryService } from '../sourcing-source-registry.service';

describe('SourcingEvidenceLedgerService source scope authorization', () => {
  const evidenceRepository = {
    startRun: vi.fn(),
    getRun: vi.fn(),
    appendObservations: vi.fn(),
    finalizeRun: vi.fn(),
    findObservationsByIds: vi.fn(),
  };
  const sourceRepository = {
    createVersion: vi.fn(),
    findCurrent: vi.fn(),
    findCurrentBySourceKeys: vi.fn(),
    list: vi.fn(),
  };
  let service: SourcingEvidenceLedgerService;

  beforeEach(() => {
    vi.resetAllMocks();
    const sources = new SourcingSourceRegistryService(sourceRepository as never);
    service = new SourcingEvidenceLedgerService(
      evidenceRepository as never,
      sources,
    );
  });

  it('binds a run to the exact entitlement scope returned by authorization', async () => {
    sourceRepository.findCurrent.mockResolvedValue(
      entitlementRecord({ id: 'entitlement-stationery', scopeKey: 'stationery' }),
    );
    evidenceRepository.startRun.mockImplementation(async (command) => ({
      kind: 'created',
      duplicate: false,
      record: { id: 'run-1', ...command },
    }));

    await service.startRun({
      organizationId: 'org-1',
      sourceKey: '1688',
      runKey: 'run-1',
      scopeKey: ' Stationery ',
      collectorVersion: 'collector/v1',
      triggeredByUserId: 'user-1',
      windowStartAt: new Date('2026-08-01T00:00:00.000Z'),
      windowEndAt: new Date('2026-08-01T01:00:00.000Z'),
    });

    expect(sourceRepository.findCurrent).toHaveBeenCalledWith({
      organizationId: 'org-1',
      sourceKey: '1688',
      scopeKey: 'stationery',
    });
    expect(evidenceRepository.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceEntitlementVersionId: 'entitlement-stationery',
        sourceKey: '1688',
        scopeKey: 'stationery',
      }),
    );
  });

  it('reauthorizes the collecting run by its exact source and scope before append', async () => {
    evidenceRepository.getRun.mockResolvedValue(runRecord());
    sourceRepository.findCurrent.mockResolvedValue(
      entitlementRecord({ id: 'entitlement-at-start', scopeKey: 'stationery' }),
    );
    evidenceRepository.appendObservations.mockResolvedValue({
      kind: 'appended',
      records: [],
      duplicateCount: 0,
    });

    await service.appendObservations({
      organizationId: 'org-1',
      runId: 'run-1',
      observations: [observationInput()],
    });

    expect(sourceRepository.findCurrent).toHaveBeenCalledWith({
      organizationId: 'org-1',
      sourceKey: '1688',
      scopeKey: 'stationery',
    });
    expect(evidenceRepository.appendObservations).toHaveBeenCalledTimes(1);
  });

  it('requires a new run after any entitlement version change', async () => {
    evidenceRepository.getRun.mockResolvedValue(runRecord());
    sourceRepository.findCurrent.mockResolvedValue(
      entitlementRecord({
        id: 'entitlement-after-downgrade',
        scopeKey: 'stationery',
        lifecycle: 'shadow',
        decisionImpact: 'disabled',
      }),
    );

    await expect(service.appendObservations({
      organizationId: 'org-1',
      runId: 'run-1',
      observations: [observationInput()],
    })).rejects.toBeInstanceOf(ConflictException);
    expect(evidenceRepository.appendObservations).not.toHaveBeenCalled();
  });

  it.each([
    ['kill_switch_enabled', { killSwitch: true, decisionImpact: 'disabled' }],
    [
      'permission_expired',
      { permissionExpiresAt: new Date('2000-01-01T00:00:00.000Z') },
    ],
    [
      'lifecycle_suspended',
      { lifecycle: 'suspended', decisionImpact: 'disabled', killSwitch: false },
    ],
  ])(
    'blocks append after current scope authorization changes: %s',
    async (reasonCode, entitlementOverrides) => {
      evidenceRepository.getRun.mockResolvedValue(runRecord());
      sourceRepository.findCurrent.mockResolvedValue(
        entitlementRecord({
          id: 'entitlement-current',
          scopeKey: 'stationery',
          ...entitlementOverrides,
        }),
      );

      const append = service.appendObservations({
        organizationId: 'org-1',
        runId: 'run-1',
        observations: [observationInput()],
      });

      await expect(append).rejects.toBeInstanceOf(BadRequestException);
      await expect(append).rejects.toMatchObject({
        response: {
          code: 'source_collection_not_authorized',
          reason: reasonCode,
        },
      });
      expect(evidenceRepository.appendObservations).not.toHaveBeenCalled();
    },
  );
});

function entitlementRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entitlement-stationery',
    organizationId: 'org-1',
    sourceKey: '1688',
    scopeKey: 'stationery',
    lifecycle: 'qualified',
    decisionImpact: 'enabled',
    killSwitch: false,
    permissionStartsAt: null,
    permissionExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function runRecord() {
  return {
    id: 'run-1',
    organizationId: 'org-1',
    sourceEntitlementVersionId: 'entitlement-at-start',
    sourceKey: '1688',
    scopeKey: 'stationery',
    decisionImpactAtIngest: 'enabled',
    status: 'collecting',
  };
}

function observationInput() {
  const capturedAt = new Date('2026-08-01T01:10:00.000Z');
  return {
    platform: '1688',
    evidenceFamily: 'china_supply',
    signalRole: 'supply' as const,
    granularity: 'supply_catalog' as const,
    sourceEntityType: 'offer',
    sourceEntityId: 'offer-1',
    schemaVersion: '1688-offer/v1',
    observationKey: 'a'.repeat(64),
    eventAt: capturedAt,
    observedAt: capturedAt,
    availableAt: capturedAt,
    rawPayload: { title: '연필통' },
  };
}
