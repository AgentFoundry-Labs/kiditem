import { describe, expect, it, vi } from 'vitest';
import { OperationHandlerRegistryService } from '../../../../../operations/application/service/operation-handler-registry.service';
import { SourcingRisingProductOperationHandler } from '../sourcing-rising-product.operation-handler';
import type { OperationHandlerContext } from '../../../../../common/operation-definition';

const context: OperationHandlerContext = {
  runId: 'b00e8d85-e8ab-447f-8558-c98c6c580d3b',
  organizationId: '454de16d-b60e-41f7-9b9c-16dc2666ea05',
  operationKey: 'sourcing.detect_rising_products',
  triggerSource: 'domain_screen',
  input: { windowDays: 14, limit: 100 },
  requestedByUserId: null,
  scheduleId: null,
  parentRunId: null,
  attemptToken: '4e65f19e-a04f-4aac-917c-b6f973870f87',
  signal: new AbortController().signal,
  checkpoint: vi.fn().mockResolvedValue(undefined),
};

describe('SourcingRisingProductOperationHandler', () => {
  it('registers snapshot-compute detection and returns only a safe persisted summary', async () => {
    const registry = new OperationHandlerRegistryService();
    const rising = {
      detect: vi.fn().mockResolvedValue({
        businessDate: '2026-08-14',
        windowDays: 14,
        generatedAt: '2026-08-14T01:00:00.000Z',
        confidence: 0.75,
        dataGaps: [],
        model: {
          candidates: [{ id: 'candidate-row-must-not-enter-operation-result' }],
          stats: { candidateCount: 1 },
        },
      }),
    };
    const handler = new SourcingRisingProductOperationHandler(
      registry,
      rising as never,
    );
    handler.onModuleInit();

    expect(registry.getDefinition('sourcing.detect_rising_products'))
      .toMatchObject({ resourceClass: 'snapshot_compute' });
    await expect(handler.execute(context)).resolves.toEqual({
      kind: 'completed',
      result: {
        businessDate: '2026-08-14',
        windowDays: 14,
        candidateCount: 1,
        confidence: 0.75,
      },
    });
    expect(rising.detect).toHaveBeenCalledWith(
      {
        organizationId: context.organizationId,
        windowDays: 14,
        limit: 100,
      },
      { signal: context.signal, checkpoint: context.checkpoint },
    );
  });

  it('suppresses completion when its attempt signal aborts during compute', async () => {
    const controller = new AbortController();
    const registry = new OperationHandlerRegistryService();
    const rising = {
      detect: vi.fn().mockImplementation(async () => {
        controller.abort(new Error('operation_attempt_fence_lost'));
        return {
          businessDate: '2026-08-14',
          windowDays: 14,
          confidence: 0,
          model: { candidates: [], stats: { candidateCount: 0 } },
        };
      }),
    };
    const handler = new SourcingRisingProductOperationHandler(
      registry,
      rising as never,
    );

    await expect(handler.execute({ ...context, signal: controller.signal }))
      .rejects.toThrow('operation_attempt_fence_lost');
  });
});
