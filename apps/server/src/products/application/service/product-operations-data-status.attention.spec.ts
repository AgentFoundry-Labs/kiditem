import { describe, expect, it, vi } from 'vitest';
import { ProductOperationsDataStatusService } from './product-operations-data-status.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const PARENT_ID = '00000000-0000-4000-8000-000000000002';

describe('ProductOperationsDataStatusService attention projection', () => {
  it('preserves a marketplace login requirement on the advertising source', async () => {
    const source = {
      status: 'NOT_COLLECTED' as const,
      coverageEndDate: null,
      capturedAt: null,
      lastErrorAt: null,
    };
    const repository = {
      read: vi.fn().mockResolvedValue({
        displayDataAsOf: null,
        sources: { traffic: source, advertising: source, sellpiaProfit: source, abc: source },
        abcSummary: {
          classifiedProductCount: 0,
          unclassifiedProductCount: 1,
          mappingRequiredProductCount: 0,
          orderEvidenceRequiredProductCount: 0,
          otherPendingProductCount: 1,
        },
      }),
    };
    const operations = {
      list: vi.fn().mockResolvedValue([
        operationRun({ id: PARENT_ID, status: 'attention_required' }),
        operationRun({
          id: '00000000-0000-4000-8000-000000000003',
          operationKey: 'advertising.refresh_profitability_spend',
          parentRunId: PARENT_ID,
          status: 'attention_required',
          error: { code: 'browser_attention_required', message: 'marketplace_login' },
        }),
      ]),
    };

    const service = new ProductOperationsDataStatusService(repository as never, operations as never);

    await expect(service.getStatus(ORGANIZATION_ID, 30)).resolves.toMatchObject({
      activeRun: null,
      sources: {
        advertising: {
          status: 'ACTION_REQUIRED',
          attentionReason: 'marketplace_login',
        },
      },
    });
  });
});

function operationRun(overrides: Record<string, unknown> = {}) {
  const now = '2026-08-03T01:00:00.000Z';
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
