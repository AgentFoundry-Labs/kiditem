import { describe, expect, it, vi } from 'vitest';
import { ProductOperationsDataStatusService } from './product-operations-data-status.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const PARENT_ID = '00000000-0000-4000-8000-000000000002';

describe('ProductOperationsDataStatusService', () => {
  it('marks only the currently executing profitability source as updating', async () => {
    const repository = { read: vi.fn().mockResolvedValue(facts()) };
    const operations = {
      list: vi.fn().mockResolvedValue([
        run({ id: PARENT_ID, operationKey: 'products.refresh_profitability_evidence', status: 'waiting_dependency' }),
        run({
          id: '00000000-0000-4000-8000-000000000003',
          parentRunId: PARENT_ID,
          operationKey: 'advertising.refresh_profitability_spend',
          status: 'waiting_runtime',
        }),
      ]),
    };
    const service = new ProductOperationsDataStatusService(repository as never, operations as never);

    await expect(service.getStatus(ORGANIZATION_ID, 30)).resolves.toMatchObject({
      sources: {
        traffic: { status: 'CURRENT' },
        advertising: { status: 'UPDATING' },
        sellpiaProfit: { status: 'CURRENT' },
        abc: { status: 'CURRENT' },
      },
      activeRun: { id: PARENT_ID, status: 'waiting_dependency' },
    });
  });

  it('attributes the latest failed child to its source without changing stored coverage', async () => {
    const repository = { read: vi.fn().mockResolvedValue(facts()) };
    const operations = {
      list: vi.fn().mockResolvedValue([
        run({
          id: PARENT_ID,
          operationKey: 'products.refresh_profitability_evidence',
          status: 'failed',
          finishedAt: new Date('2026-08-02T01:00:00.000Z'),
          updatedAt: new Date('2026-08-02T01:00:00.000Z'),
        }),
        run({
          id: '00000000-0000-4000-8000-000000000003',
          parentRunId: PARENT_ID,
          operationKey: 'inventory.refresh_sellpia_snapshot',
          status: 'failed',
          finishedAt: new Date('2026-08-02T01:00:00.000Z'),
          updatedAt: new Date('2026-08-02T01:00:00.000Z'),
        }),
      ]),
    };
    const service = new ProductOperationsDataStatusService(repository as never, operations as never);

    await expect(service.getStatus(ORGANIZATION_ID, 30)).resolves.toMatchObject({
      sources: {
        sellpiaProfit: {
          status: 'FAILED',
          coverageEndDate: '2026-08-01',
          lastErrorAt: '2026-08-02T01:00:00.000Z',
        },
      },
      activeRun: null,
    });
  });
});

function facts() {
  const source = {
    status: 'CURRENT' as const,
    coverageEndDate: '2026-08-01',
    capturedAt: '2026-08-02T00:00:00.000Z',
    lastErrorAt: null,
  };
  return {
    displayDataAsOf: '2026-08-01',
    sources: {
      traffic: source,
      advertising: source,
      sellpiaProfit: source,
      abc: source,
    },
    abcSummary: {
      classifiedProductCount: 1,
      unclassifiedProductCount: 0,
      mappingRequiredProductCount: 0,
      orderEvidenceRequiredProductCount: 0,
      otherPendingProductCount: 0,
    },
  };
}

function run(overrides: Record<string, unknown> = {}) {
  const now = '2026-08-02T00:00:00.000Z';
  return {
    id: '00000000-0000-4000-8000-000000000009',
    operationKey: 'products.refresh_profitability_evidence',
    definitionVersion: 1,
    ownerDomain: 'products',
    title: '수익성 데이터 갱신',
    engineType: 'composite',
    status: 'succeeded',
    triggerSource: 'domain_screen',
    parentRunId: null,
    scheduleId: null,
    result: null,
    progress: null,
    nativeRunType: null,
    nativeRunId: null,
    error: null,
    scheduledFor: null,
    startedAt: now,
    finishedAt: now,
    createdAt: now,
    updatedAt: now,
    requestedBy: null,
    ...overrides,
  };
}
