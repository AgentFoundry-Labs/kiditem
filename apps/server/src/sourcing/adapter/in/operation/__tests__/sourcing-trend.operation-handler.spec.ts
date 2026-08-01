import { describe, expect, it, vi } from 'vitest';
import type { OperationHandlerContext } from '../../../../../common/operation-definition';
import { OperationHandlerRegistryService } from '../../../../../operations/application/service/operation-handler-registry.service';
import type { TrendCollectionPort } from '../../../../application/port/in/trend-collection.port';
import { SOURCING_OPERATIONS } from '../../../../domain/operation/sourcing.operations';
import { SourcingTrendOperationHandler } from '../sourcing-trend.operation-handler';

const context: OperationHandlerContext = {
  runId: 'b00e8d85-e8ab-447f-8558-c98c6c580d3b',
  organizationId: '454de16d-b60e-41f7-9b9c-16dc2666ea05',
  operationKey: 'sourcing.collect_daily_trends',
  triggerSource: 'dashboard',
  input: { sources: ['naver', '1688'] },
  requestedByUserId: null,
  scheduleId: null,
  parentRunId: null,
  attemptToken: '4e65f19e-a04f-4aac-917c-b6f973870f87',
};

describe('SourcingTrendOperationHandler', () => {
  it('registers a schedulable composite operation and fails when every source fails', async () => {
    const registry = new OperationHandlerRegistryService();
    const collector: TrendCollectionPort = {
      collect: vi.fn().mockResolvedValue({
        businessDate: '2026-08-01',
        results: [
          { source: 'naver', ok: false, collected: 0, error: 'upstream unavailable' },
          { source: '1688', ok: false, collected: 0, error: 'rate limited' },
        ],
      }),
    };
    const handler = new SourcingTrendOperationHandler(registry, collector);
    handler.onModuleInit();

    expect(SOURCING_OPERATIONS[0]).toMatchObject({
      key: 'sourcing.collect_daily_trends',
      ownerDomain: 'sourcing',
      engineType: 'composite',
      scheduleSupported: true,
    });
    await expect(handler.execute(context)).rejects.toThrow('trend_collection_failed');
  });

  it('completes partial collection with a warning count', async () => {
    const registry = new OperationHandlerRegistryService();
    const collector: TrendCollectionPort = {
      collect: vi.fn().mockResolvedValue({
        businessDate: '2026-08-01',
        results: [
          { source: 'naver', ok: true, collected: 12 },
          { source: '1688', ok: false, collected: 0, error: 'rate limited' },
        ],
      }),
    };
    const handler = new SourcingTrendOperationHandler(registry, collector);
    handler.onModuleInit();

    await expect(handler.execute(context)).resolves.toEqual({
      kind: 'completed',
      result: expect.objectContaining({ warningCount: 1, collected: 12 }),
    });
  });
});
