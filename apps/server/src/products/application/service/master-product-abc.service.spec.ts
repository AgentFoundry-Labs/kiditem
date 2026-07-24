import { describe, expect, it, vi } from 'vitest';

const modulePath = './master-product-abc.service.js';
async function serviceModule() { return import(modulePath); }

const organizationId = '00000000-0000-4000-8000-000000000001';

describe('MasterProductAbcService', () => {
  it('uses the default policy when an organization has not been initialized', async () => {
    const { MasterProductAbcService } = await serviceModule();
    const repository = { findPolicy: vi.fn().mockResolvedValue(null) };
    const service = new MasterProductAbcService(repository as never, {} as never);

    await expect(service.getPolicy(organizationId)).resolves.toMatchObject({
      metric: 'SALES_QUANTITY', periodDays: 30,
      aCumulativeThreshold: 70, bCumulativeThreshold: 90,
      lastCalculatedAt: null, sourceCapturedAt: null,
    });
  });

  it('publishes only changed organization-scoped grades and is a no-op on retry', async () => {
    const { MasterProductAbcService } = await serviceModule();
    const policy = {
      metric: 'SALES_QUANTITY', periodDays: 30,
      aCumulativeThreshold: 70, bCumulativeThreshold: 90,
      lastCalculatedAt: null, sourceCapturedAt: null,
    };
    const repository = {
      findPolicy: vi.fn().mockResolvedValue(policy),
      publishGrades: vi.fn()
        .mockResolvedValueOnce({ changedProductCount: 1, policy: { ...policy, lastCalculatedAt: new Date('2026-07-24T00:00:00Z') } })
        .mockResolvedValueOnce({ changedProductCount: 0, policy }),
    };
    const metrics = {
      readMetricSnapshot: vi.fn().mockResolvedValue({
        sourceCapturedAt: new Date('2026-07-23T00:00:00Z'),
        evidence: [
          { masterProductId: '00000000-0000-4000-8000-000000000011', metricValue: 10, eligible: true },
          { masterProductId: '00000000-0000-4000-8000-000000000012', metricValue: null, eligible: false },
        ],
      }),
    };
    const service = new MasterProductAbcService(repository as never, metrics as never);

    await expect(service.recalculate(organizationId)).resolves.toMatchObject({
      changedProductCount: 1, classifiedProductCount: 1, unclassifiedProductCount: 1,
    });
    await expect(service.recalculate(organizationId)).resolves.toMatchObject({ changedProductCount: 0 });
    expect(repository.publishGrades).toHaveBeenCalledWith(expect.objectContaining({
      organizationId,
      grades: new Map([
        ['00000000-0000-4000-8000-000000000011', 'A'],
        ['00000000-0000-4000-8000-000000000012', null],
      ]),
    }));
  });

  it('publishes a policy change atomically with recalculation under the authenticated organization', async () => {
    const { MasterProductAbcService } = await serviceModule();
    const policy = {
      metric: 'SALES_AMOUNT', periodDays: 90,
      aCumulativeThreshold: 60, bCumulativeThreshold: 85,
      lastCalculatedAt: null, sourceCapturedAt: null,
    };
    const repository = {
      findPolicy: vi.fn().mockResolvedValue(policy),
      publishGrades: vi.fn().mockResolvedValue({ changedProductCount: 0, policy }),
    };
    const metrics = { readMetricSnapshot: vi.fn().mockResolvedValue({ sourceCapturedAt: null, evidence: [] }) };
    const service = new MasterProductAbcService(repository as never, metrics as never);

    await service.updatePolicy(organizationId, {
      metric: 'SALES_AMOUNT', periodDays: 90,
      aCumulativeThreshold: 60, bCumulativeThreshold: 85,
    });
    expect(metrics.readMetricSnapshot).toHaveBeenCalledWith({
      organizationId, metric: 'SALES_AMOUNT', periodDays: 90,
    });
    expect(repository.publishGrades).toHaveBeenCalledOnce();
    expect(repository.publishGrades).toHaveBeenCalledWith(expect.objectContaining({
      organizationId,
      policy: expect.objectContaining({ metric: 'SALES_AMOUNT', periodDays: 90 }),
    }));
  });

  it('leaves policy and grades untouched when candidate metric collection fails', async () => {
    const { MasterProductAbcService } = await serviceModule();
    const repository = { publishGrades: vi.fn(), findPolicy: vi.fn() };
    const metrics = { readMetricSnapshot: vi.fn().mockRejectedValue(new Error('source unavailable')) };
    const service = new MasterProductAbcService(repository as never, metrics as never);

    await expect(service.updatePolicy(organizationId, {
      metric: 'SALES_AMOUNT', periodDays: 90,
      aCumulativeThreshold: 60, bCumulativeThreshold: 85,
    })).rejects.toThrow('source unavailable');

    expect(repository.publishGrades).not.toHaveBeenCalled();
    expect(repository.findPolicy).not.toHaveBeenCalled();
  });
});
