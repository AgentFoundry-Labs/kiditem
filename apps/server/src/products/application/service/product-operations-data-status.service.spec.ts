import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductOperationsDataStatusFacts } from '../port/out/repository/product-operations-data-status.repository.port';
import { ProductOperationsDataStatusService } from './product-operations-data-status.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000002';
const NEW_PRODUCT_ID = '00000000-0000-4000-8000-000000000003';

describe('ProductOperationsDataStatusService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T00:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('combines the last official publication with live source readiness without an Operation run', async () => {
    const repository = { read: vi.fn().mockResolvedValue(facts()) };
    const service = new ProductOperationsDataStatusService(repository as never);

    await expect(service.getStatus(ORGANIZATION_ID, 30)).resolves.toEqual({
      displayDataAsOf: '2026-09-03',
      formulaRevision: 2,
      publicationRevision: 4,
      officialCutoff: '2026-07-31',
      publishedAt: '2026-08-01T01:00:00.000Z',
      actualCutoff: '2026-08-31',
      sources: {
        traffic: {
          ready: true,
          requiredCutoff: '2026-09-03',
          actualCutoff: '2026-09-03',
          latestAttempt: null,
          latestComplete: { actualCutoff: '2026-09-03' },
        },
        sellpia: {
          ready: true,
          requiredCutoff: '2026-08-31',
          actualCutoff: '2026-08-31',
          latestAttempt: { state: 'COMPLETE' },
          latestComplete: { actualCutoff: '2026-08-31' },
        },
        advertising: {
          ready: true,
          requiredCutoff: '2026-08-31',
          actualCutoff: '2026-08-31',
          latestAttempt: { state: 'COMPLETE' },
          latestComplete: { actualCutoff: '2026-08-31' },
        },
        mapping: { ready: true, generation: '8' },
      },
      abcSummary: {
        classifiedProductCount: 1,
        unclassifiedProductCount: 1,
        mappingRequiredProductCount: 0,
        otherPendingProductCount: 1,
      },
    });
    expect(repository.read).toHaveBeenCalledWith(ORGANIZATION_ID, 30);
  });

  it('retains the official publication while exposing a stale selected source', async () => {
    const stale = facts();
    stale.actualCutoff = '2026-07-31';
    stale.advertising = {
      ready: false,
      requiredCutoff: '2026-08-31',
      actualCutoff: '2026-07-31',
      latestAttempt: { state: 'FAILED' },
      latestComplete: { actualCutoff: '2026-07-31' },
    };
    const service = new ProductOperationsDataStatusService(
      { read: vi.fn().mockResolvedValue(facts()) } as never,
    );
    (service as never as { repository: { read: ReturnType<typeof vi.fn> } })
      .repository.read.mockResolvedValue(stale);

    await expect(service.getStatus(ORGANIZATION_ID, 30)).resolves.toMatchObject({
      officialCutoff: '2026-07-31',
      actualCutoff: '2026-07-31',
      publicationRevision: 4,
      sources: {
        advertising: {
          ready: false,
          actualCutoff: '2026-07-31',
          latestAttempt: { state: 'FAILED' },
          latestComplete: { actualCutoff: '2026-07-31' },
        },
      },
    });
  });

  it('keeps mapping ready when one product is unmapped while counting that product separately', async () => {
    const currentFacts = facts();
    currentFacts.products[1] = {
      ...currentFacts.products[1],
      mappingValid: false,
    };
    const repository = { read: vi.fn().mockResolvedValue(currentFacts) };
    const service = new ProductOperationsDataStatusService(repository as never);

    await expect(service.getStatus(ORGANIZATION_ID, 30)).resolves.toMatchObject({
      sources: {
        mapping: { ready: true, generation: '8' },
      },
      abcSummary: {
        classifiedProductCount: 1,
        unclassifiedProductCount: 1,
        mappingRequiredProductCount: 1,
        otherPendingProductCount: 0,
      },
    });
  });

  it('reports stale mapping when the captured generation is incoherent', async () => {
    const currentFacts = facts();
    currentFacts.mappingReady = false;
    const repository = { read: vi.fn().mockResolvedValue(currentFacts) };
    const service = new ProductOperationsDataStatusService(repository as never);

    await expect(service.getStatus(ORGANIZATION_ID, 30)).resolves.toMatchObject({
      sources: {
        mapping: { ready: false, generation: '8' },
      },
    });
  });
});

function facts(): ProductOperationsDataStatusFacts {
  return {
    mappingReady: true,
    contributionBasis: { basisFromDate: '2026-01-01', basisCutoffDate: '2026-08-31' },
    displayDataAsOf: '2026-09-03',
    traffic: {
      ready: true,
      requiredCutoff: '2026-09-03',
      actualCutoff: '2026-09-03',
      latestAttempt: null,
      latestComplete: { actualCutoff: '2026-09-03' },
    },
    actualCutoff: '2026-08-31',
    sellpia: {
      ready: true,
      requiredCutoff: '2026-08-31',
      actualCutoff: '2026-08-31',
      latestAttempt: { state: 'COMPLETE' as const },
      latestComplete: { actualCutoff: '2026-08-31' },
    },
    advertising: {
      ready: true,
      requiredCutoff: '2026-08-31',
      actualCutoff: '2026-08-31',
      latestAttempt: { state: 'COMPLETE' as const },
      latestComplete: { actualCutoff: '2026-08-31' },
    },
    sourceVector: {
      sellpia: sourceManifest('00000000-0000-4000-8000-000000000011', '4'),
      advertising: sourceManifest('00000000-0000-4000-8000-000000000012', '5'),
    },
    formulaState: {
      formulaRevision: 2,
      publicationRevision: 4,
      officialCutoff: '2026-07-31',
      publishedAt: '2026-08-01T01:00:00.000Z',
      mappingGeneration: '8',
    },
    products: [
      {
        masterProductId: PRODUCT_ID,
        abcGrade: 'B' as const,
        mappingValid: true,
        saleStartDate: '2026-07-01',
      },
      {
        masterProductId: NEW_PRODUCT_ID,
        abcGrade: null,
        mappingValid: true,
        saleStartDate: null,
      },
    ],
  };
}

function sourceManifest(sourceImportRunId: string, generation: string) {
  return {
    sourceImportRunId,
    generation,
    mappingGeneration: '8',
    coverageStartDate: '2026-01-01',
    coverageEndDate: '2026-08-31',
    capturedAt: '2026-09-01T00:00:00.000Z',
  };
}
