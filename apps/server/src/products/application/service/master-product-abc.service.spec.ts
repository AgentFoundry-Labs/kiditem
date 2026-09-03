import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD } from '@kiditem/shared/product-abc';
import { MasterProductAbcService } from './master-product-abc.service';
import type {
  ProductAbcPublicationInput,
  ProductAbcRepositoryPort,
} from '../port/out/repository/master-product-abc.repository.port';
import type {
  ProfitabilityEvidence,
  ProfitabilityEvidenceSnapshot,
} from '../../../finance/application/port/in/master-product-profitability-read.port';

const organizationId = '00000000-0000-4000-8000-000000000001';
const productA = '00000000-0000-4000-8000-000000000011';
const productB = '00000000-0000-4000-8000-000000000012';
const formulaVersionId = '00000000-0000-4000-8000-000000000021';
const sellpiaRunId = '00000000-0000-4000-8000-000000000031';
const advertisingRunId = '00000000-0000-4000-8000-000000000032';

const state = {
  organizationId,
  activeFormulaVersionId: formulaVersionId,
  formulaRevision: 1,
  publicationRevision: 0,
  officialCutoffDate: null,
  publishedSellpiaSourceImportRunId: null,
  publishedAdvertisingSourceImportRunId: null,
  publishedMappingGeneration: null,
  mappingGeneration: '7',
  formula: PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD,
};

function monthlyFact(input: {
  revenue: number;
  cost: number;
  advertisingSpend?: number;
}) {
  return {
    yearMonth: '2026-08',
    coverageStartDate: '2026-08-01',
    coverageEndDate: '2026-08-30',
    coveredDays: 30,
    recognizedRevenue: input.revenue,
    orderTimeSupplyCost: input.cost,
    advertisingSpend: input.advertisingSpend ?? 0,
    provenance: {
      costBasis: 'ORDER_TIME_SUPPLY_COST' as const,
      vatIncluded: true as const,
      advertisingEvidence: input.advertisingSpend && input.advertisingSpend > 0
        ? 'OBSERVED' as const
        : 'CONFIRMED_ZERO' as const,
    },
  };
}

function snapshot(
  products: readonly {
    masterProductId: string;
    revenue: number;
    cost: number;
    advertisingSpend?: number;
  }[],
  overrides: Partial<ProfitabilityEvidenceSnapshot> = {},
): ProfitabilityEvidenceSnapshot {
  return {
    targetCutoff: '2026-08-31',
    actualCutoff: '2026-08-31',
    mappingGeneration: '7',
    sourceVector: {
      sellpia: {
        sourceImportRunId: sellpiaRunId,
        publicationSequence: '12',
        mappingGeneration: '7',
        coverageStartDate: '2026-01-01',
        coverageEndDate: '2026-08-31',
        capturedAt: '2026-09-01T00:00:00.000Z',
      },
      advertising: {
        sourceImportRunId: advertisingRunId,
        publicationSequence: '18',
        mappingGeneration: '7',
        coverageStartDate: '2026-01-01',
        coverageEndDate: '2026-08-31',
        capturedAt: '2026-09-01T00:00:00.000Z',
      },
    },
    sources: {
      sellpia: {
        status: 'READY',
        actualCutoff: '2026-08-31',
        latestAttemptState: 'COMPLETE',
        errorCode: null,
      },
      advertising: {
        status: 'READY',
        actualCutoff: '2026-08-31',
        latestAttemptState: 'COMPLETE',
        errorCode: null,
      },
    },
    products: products.map((product) => ({
      masterProductId: product.masterProductId,
      selling: true,
      mappingValid: true,
      validObservationDays: 30,
      formulaReadyFacts: {
        masterProductId: product.masterProductId,
        cutoffDate: '2026-08-31',
        monthlyFacts: [monthlyFact(product)],
      },
    })),
    ...overrides,
  };
}

function repository(overrides: Partial<ProductAbcRepositoryPort> = {}) {
  return {
    getFormulaState: vi.fn().mockResolvedValue(state),
    listCurrentAbcTargetIds: vi.fn().mockResolvedValue([productA]),
    publish: vi.fn().mockResolvedValue({
      outcome: 'PUBLISHED' as const,
      publicationRevision: 1,
      changedProductCount: 1,
    }),
    ...overrides,
  } as unknown as ProductAbcRepositoryPort & {
    getFormulaState: ReturnType<typeof vi.fn>;
    listCurrentAbcTargetIds: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
  };
}

function serviceWith(
  products: ReturnType<typeof repository>,
  evidence: ProfitabilityEvidenceSnapshot,
) {
  const profitability: ProfitabilityEvidence = {
    load: vi.fn().mockResolvedValue(evidence),
  };
  return {
    service: new MasterProductAbcService(products, profitability),
    profitability,
  };
}

describe('MasterProductAbcService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns SOURCE_NOT_READY and performs no publication write', async () => {
    const products = repository();
    const { service } = serviceWith(products, snapshot([{
      masterProductId: productA,
      revenue: 1_000_000,
      cost: 200_000,
    }], {
      sources: {
        ...snapshot([], {}).sources,
        advertising: {
          status: 'STALE',
          actualCutoff: '2026-07-31',
          latestAttemptState: 'FAILED',
          errorCode: 'COLLECTION_FAILED',
        },
      },
      actualCutoff: '2026-07-31',
    }));

    await expect(service.recalculate({ organizationId })).resolves.toMatchObject({
      outcome: 'SOURCE_NOT_READY',
      publicationRevision: 0,
      actualCutoff: '2026-07-31',
      sources: { advertising: { status: 'STALE', errorCode: 'COLLECTION_FAILED' } },
    });
    expect(products.publish).not.toHaveBeenCalled();
  });

  it('evaluates each eligible product independently and attempts one publication', async () => {
    const products = repository({
      listCurrentAbcTargetIds: vi.fn().mockResolvedValue([productA, productB]),
    });
    const { service, profitability } = serviceWith(products, snapshot([
      { masterProductId: productA, revenue: 1_000_000, cost: 200_000, advertisingSpend: 100_000 },
      { masterProductId: productB, revenue: 500_000, cost: 300_000 },
    ]));

    await expect(service.recalculate({ organizationId })).resolves.toMatchObject({
      outcome: 'PUBLISHED',
      publicationRevision: 1,
      classifiedProductCount: 2,
      unclassifiedProductCount: 0,
      changedProductCount: 1,
    });
    expect(profitability.load).toHaveBeenCalledWith({
      organizationId,
      targetCutoff: expect.any(String),
    });
    expect(products.publish).toHaveBeenCalledTimes(1);
    const publication = products.publish.mock.calls[0]![0] as ProductAbcPublicationInput;
    expect(publication.candidates).toHaveLength(2);
    expect(publication.candidates.map((candidate) => candidate.masterProductId))
      .toEqual([productA, productB]);
    expect(publication.candidates.map((candidate) => candidate.abcGrade))
      .toEqual(['A', 'B']);
  });

  it('captures the complete target set before loading profitability evidence', async () => {
    const calls: string[] = [];
    const products = repository({
      listCurrentAbcTargetIds: vi.fn(async () => {
        calls.push('targets');
        return [productA];
      }),
    });
    const profitability: ProfitabilityEvidence = {
      load: vi.fn(async () => {
        calls.push('evidence');
        return snapshot([{
          masterProductId: productA,
          revenue: 1_000_000,
          cost: 200_000,
        }]);
      }),
    };

    await new MasterProductAbcService(products, profitability)
      .recalculate({ organizationId });

    expect(calls).toEqual(['targets', 'evidence']);
  });

  it('does not change a product score when another product is added', async () => {
    const alone = repository();
    const aloneContext = serviceWith(alone, snapshot([
      { masterProductId: productA, revenue: 1_000_000, cost: 200_000, advertisingSpend: 100_000 },
    ]));
    await aloneContext.service.recalculate({ organizationId });
    const aloneCandidate = alone.publish.mock.calls[0]![0].candidates[0];

    const withPeer = repository({
      listCurrentAbcTargetIds: vi.fn().mockResolvedValue([productA, productB]),
    });
    const peerContext = serviceWith(withPeer, snapshot([
      { masterProductId: productA, revenue: 1_000_000, cost: 200_000, advertisingSpend: 100_000 },
      { masterProductId: productB, revenue: 1, cost: 0 },
    ]));
    await peerContext.service.recalculate({ organizationId });
    const peerCandidate = withPeer.publish.mock.calls[0]![0].candidates
      .find((candidate: { masterProductId: string }) => candidate.masterProductId === productA);

    expect(peerCandidate).toMatchObject({
      abcGrade: aloneCandidate.abcGrade,
      economicScore: aloneCandidate.economicScore,
      profitScore: aloneCandidate.profitScore,
      marginScore: aloneCandidate.marginScore,
      consistencyScore: aloneCandidate.consistencyScore,
    });
  });

  it('surfaces one CAS miss as INPUT_CHANGED without retrying', async () => {
    const products = repository({
      publish: vi.fn().mockResolvedValue({ outcome: 'INPUT_CHANGED' as const }),
    });
    const { service } = serviceWith(products, snapshot([{
      masterProductId: productA,
      revenue: 1_000_000,
      cost: 200_000,
    }]));

    await expect(service.recalculate({ organizationId })).rejects.toMatchObject({
      response: { code: 'INPUT_CHANGED' },
    });
    expect(products.publish).toHaveBeenCalledTimes(1);
  });

  it('does not publish a candidate for a new product with fewer than thirty valid days', async () => {
    const products = repository();
    const { service } = serviceWith(products, snapshot([{
      masterProductId: productA,
      revenue: 1_000_000,
      cost: 200_000,
    }], {
      products: [{
        masterProductId: productA,
        selling: true,
        mappingValid: true,
        validObservationDays: 29,
        formulaReadyFacts: null,
      }],
    }));

    await expect(service.recalculate({ organizationId })).resolves.toMatchObject({
      outcome: 'PUBLISHED',
      classifiedProductCount: 0,
      unclassifiedProductCount: 1,
    });
    expect(products.publish.mock.calls[0]![0].candidates).toEqual([]);
  });

  it('rejects a target missing from the coherent evidence snapshot without writing', async () => {
    const products = repository();
    const { service } = serviceWith(products, snapshot([]));

    await expect(service.recalculate({ organizationId })).rejects.toMatchObject({
      response: { code: 'INPUT_CHANGED' },
    });
    expect(products.publish).not.toHaveBeenCalled();
  });

  it('does not use the old controls or formula calibration path', async () => {
    const products = repository();
    const { service } = serviceWith(products, snapshot([{
      masterProductId: productA,
      revenue: 1_000_000,
      cost: 200_000,
    }]));

    await service.recalculate({ organizationId });

    expect(products.getFormulaState).toHaveBeenCalledTimes(1);
    expect(products.publish).toHaveBeenCalledTimes(1);
  });
});
