import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SourcingEvidenceLedgerService } from '../sourcing-evidence-ledger.service';

describe('SourcingEvidenceLedgerService', () => {
  const repository = {
    startRun: vi.fn(),
    getRun: vi.fn(),
    appendObservations: vi.fn(),
    finalizeRun: vi.fn(),
  };
  let service: SourcingEvidenceLedgerService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new SourcingEvidenceLedgerService(repository as never);
  });

  it('starts an allowlisted run without an approval lifecycle', async () => {
    repository.startRun.mockImplementation(async (command) => ({
      kind: 'created', duplicate: false, record: { id: 'run-1', ...command },
    }));

    await service.startRun({
      organizationId: 'org-1',
      sourceKey: '1688.hot_product',
      runKey: 'run-1',
      scopeKey: 'stationery',
      collectorVersion: 'collector/v1',
      triggeredByUserId: 'user-1',
    });

    expect(repository.startRun).toHaveBeenCalledWith(expect.objectContaining({
      sourceKey: '1688.hot_product',
      scopeKey: 'stationery',
    }));
  });

  it('rejects an unknown source before it creates a run', async () => {
    await expect(service.startRun({
      organizationId: 'org-1', sourceKey: 'page_world.fetch', runKey: 'run-1',
      scopeKey: 'stationery', collectorVersion: 'collector/v1', triggeredByUserId: 'user-1',
    })).rejects.toMatchObject<Partial<BadRequestException>>({
      response: { code: 'source_not_allowed' },
    });
    expect(repository.startRun).not.toHaveBeenCalled();
  });

  it('appends to an existing collecting run without reauthorizing it', async () => {
    repository.getRun.mockResolvedValue({
      id: 'run-1', sourceKey: '1688.hot_product', scopeKey: 'stationery', status: 'collecting',
    });
    repository.appendObservations.mockResolvedValue({
      kind: 'appended', records: [], duplicateCount: 0,
    });
    const capturedAt = new Date('2026-08-08T01:00:00.000Z');

    await service.appendObservations({
      organizationId: 'org-1', runId: 'run-1', observations: [{
        platform: '1688', evidenceFamily: 'hot_product', signalRole: 'supply',
        granularity: 'supply_catalog', sourceEntityType: 'supplier_offer', sourceEntityId: '1',
        schemaVersion: 'test/v1', observationKey: 'offer-1', eventAt: capturedAt,
        observedAt: capturedAt, availableAt: capturedAt, rawPayload: { offerId: '1' },
      }],
    });

    expect(repository.appendObservations).toHaveBeenCalledWith([
      expect.objectContaining({ ingestionRunId: 'run-1', sourceKey: '1688.hot_product' }),
    ]);
  });
});
