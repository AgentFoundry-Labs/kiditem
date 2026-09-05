import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
          status: 'READY',
          actualCutoff: '2026-09-03',
          capturedAt: '2026-09-04T00:00:00.000Z',
          latestAttemptState: null,
          errorCode: null,
        },
        sellpia: {
          status: 'READY',
          actualCutoff: '2026-08-31',
          capturedAt: '2026-09-01T00:00:00.000Z',
          latestAttemptState: 'COMPLETE',
          errorCode: null,
        },
        advertising: {
          status: 'READY',
          actualCutoff: '2026-08-31',
          capturedAt: '2026-09-01T00:01:00.000Z',
          latestAttemptState: 'COMPLETE',
          errorCode: null,
        },
        mapping: { status: 'READY', generation: '8' },
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
      status: 'STALE',
      actualCutoff: '2026-07-31',
      latestAttemptState: 'FAILED',
      errorCode: 'marketplace_login',
      capturedAt: '2026-09-01T00:01:00.000Z',
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
          status: 'STALE',
          capturedAt: '2026-09-01T00:01:00.000Z',
          latestAttemptState: 'FAILED',
          errorCode: 'marketplace_login',
        },
      },
    });
  });
});

function facts() {
  return {
    mappingReady: true,
    contributionBasis: { basisFromDate: '2026-01-01', basisCutoffDate: '2026-08-31' },
    displayDataAsOf: '2026-09-03',
    traffic: {
      status: 'READY' as const,
      actualCutoff: '2026-09-03',
      capturedAt: '2026-09-04T00:00:00.000Z',
      latestAttemptState: null,
      errorCode: null,
    },
    actualCutoff: '2026-08-31',
    sellpia: {
      status: 'READY' as const,
      actualCutoff: '2026-08-31',
      capturedAt: '2026-09-01T00:00:00.000Z',
      latestAttemptState: 'COMPLETE' as const,
      errorCode: null,
    },
    advertising: {
      status: 'READY' as const,
      actualCutoff: '2026-08-31',
      capturedAt: '2026-09-01T00:01:00.000Z',
      latestAttemptState: 'COMPLETE' as const,
      errorCode: null,
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
      { masterProductId: PRODUCT_ID, abcGrade: 'B' as const, mappingValid: true },
      { masterProductId: NEW_PRODUCT_ID, abcGrade: null, mappingValid: true },
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
