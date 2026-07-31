import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const modulePath = './master-product-abc.service.js';
async function serviceModule() { return import(modulePath); }

const organizationId = '00000000-0000-4000-8000-000000000001';
const productId = '00000000-0000-4000-8000-000000000011';

function policy(overrides = {}) {
  return {
    metric: 'GROSS_PROFIT' as const,
    periodDays: 360 as const,
    aCumulativeThreshold: 70,
    bCumulativeThreshold: 90,
    minProvisionalMonths: 3,
    minClassifiedMonths: 6,
    lastCalculatedAt: null,
    sourceCapturedAt: null,
    revision: 0,
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    masterProductId: productId,
    periodMetricValue: 100,
    rankingValue: 100,
    grossRevenue: 200,
    grossCost: 100,
    grossProfit: 100,
    observedCompleteMonths: 12,
    observationStartMonth: '2025-07',
    eligible: true,
    eligibilityReason: 'ELIGIBLE' as const,
    riskFlags: [],
    ...overrides,
  };
}

describe('MasterProductAbcService', () => {
  it('normalizes every automatic calculation to the fixed gross-profit lifecycle policy', async () => {
    const { MasterProductAbcService } = await serviceModule();
    const persisted = policy({ metric: 'SALES_AMOUNT' as const, periodDays: 90 as const, revision: 3 });
    const repository = {
      findPolicy: vi.fn().mockResolvedValue(persisted),
      publishGrades: vi.fn().mockResolvedValue({ changedProductCount: 0, policy: persisted, stale: false }),
    };
    const metrics = {
      readMetricSnapshot: vi.fn().mockResolvedValue({ sourceCapturedAt: null, evidence: [] }),
    };
    const service = new MasterProductAbcService(repository as never, metrics as never);

    await service.recalculate(organizationId);

    expect(metrics.readMetricSnapshot).toHaveBeenCalledWith({
      organizationId,
      metric: 'GROSS_PROFIT',
      periodDays: 360,
    });
    expect(repository.publishGrades).toHaveBeenCalledWith(expect.objectContaining({
      policy: expect.objectContaining({
        metric: 'GROSS_PROFIT', periodDays: 360,
        aCumulativeThreshold: 70, bCumulativeThreshold: 90,
        minProvisionalMonths: 3, minClassifiedMonths: 6,
        revision: 3,
      }),
      allowPolicyReplacement: true,
    }));
  });

  it('publishes full lifecycle evaluations with official grades and ranking history values', async () => {
    const { MasterProductAbcService } = await serviceModule();
    const current = policy();
    const repository = {
      findPolicy: vi.fn().mockResolvedValue(current),
      publishGrades: vi.fn().mockResolvedValue({ changedProductCount: 1, policy: current, stale: false }),
    };
    const metrics = {
      readMetricSnapshot: vi.fn().mockResolvedValue({
        sourceCapturedAt: new Date('2026-07-23T00:00:00Z'),
        evidence: [evidence(), evidence({
          masterProductId: '00000000-0000-4000-8000-000000000012',
          periodMetricValue: null, rankingValue: null, grossRevenue: null, grossCost: null, grossProfit: null,
          observedCompleteMonths: 0, observationStartMonth: null, eligible: false, eligibilityReason: 'NO_OBSERVATION',
        })],
      }),
    };
    const service = new MasterProductAbcService(repository as never, metrics as never);

    await expect(service.recalculate(organizationId)).resolves.toMatchObject({
      changedProductCount: 1, classifiedProductCount: 1, unclassifiedProductCount: 1,
      grades: expect.arrayContaining([
        expect.objectContaining({ masterProductId: productId, abcGrade: 'A', evaluation: expect.objectContaining({ grossProfit: 100 }) }),
      ]),
    });
    expect(repository.publishGrades).toHaveBeenCalledWith(expect.objectContaining({
      organizationId,
      grades: new Map([[productId, 'A'], ['00000000-0000-4000-8000-000000000012', null]]),
      metricValues: new Map([[productId, 100], ['00000000-0000-4000-8000-000000000012', null]]),
      evaluations: expect.any(Map),
    }));
  });

  it('retries once from a fresh metric snapshot if another publication wins', async () => {
    const { MasterProductAbcService } = await serviceModule();
    const oldPolicy = policy();
    const latestPolicy = policy({ revision: 1, metric: 'SALES_AMOUNT' as const, periodDays: 90 as const });
    const repository = {
      findPolicy: vi.fn().mockResolvedValueOnce(oldPolicy).mockResolvedValueOnce(latestPolicy),
      publishGrades: vi.fn()
        .mockResolvedValueOnce({ changedProductCount: 0, policy: latestPolicy, stale: true })
        .mockResolvedValueOnce({ changedProductCount: 1, policy: latestPolicy, stale: false }),
    };
    const metrics = {
      readMetricSnapshot: vi.fn()
        .mockResolvedValueOnce({ sourceCapturedAt: null, evidence: [evidence()] })
        .mockResolvedValueOnce({ sourceCapturedAt: null, evidence: [evidence({ rankingValue: 50, periodMetricValue: 50 })] }),
    };
    const service = new MasterProductAbcService(repository as never, metrics as never);

    await expect(service.recalculate(organizationId)).resolves.toMatchObject({ changedProductCount: 1 });
    expect(metrics.readMetricSnapshot).toHaveBeenNthCalledWith(2, {
      organizationId, metric: 'GROSS_PROFIT', periodDays: 360,
    });
    expect(repository.publishGrades).toHaveBeenCalledTimes(2);
  });

  it('leaves publication untouched on collection failure and reports repeated stale publication', async () => {
    const { MasterProductAbcService } = await serviceModule();
    const repository = { publishGrades: vi.fn(), findPolicy: vi.fn().mockResolvedValue(policy()) };
    const unavailable = new MasterProductAbcService(repository as never, {
      readMetricSnapshot: vi.fn().mockRejectedValue(new Error('source unavailable')),
    } as never);
    await expect(unavailable.recalculate(organizationId)).rejects.toThrow('source unavailable');
    expect(repository.publishGrades).not.toHaveBeenCalled();

    const staleRepository = {
      findPolicy: vi.fn().mockResolvedValue(policy()),
      publishGrades: vi.fn().mockResolvedValue({ changedProductCount: 0, policy: policy(), stale: true }),
    };
    const stale = new MasterProductAbcService(staleRepository as never, {
      readMetricSnapshot: vi.fn().mockResolvedValue({ sourceCapturedAt: null, evidence: [] }),
    } as never);
    await expect(stale.recalculate(organizationId)).rejects.toBeInstanceOf(ConflictException);
  });
});
