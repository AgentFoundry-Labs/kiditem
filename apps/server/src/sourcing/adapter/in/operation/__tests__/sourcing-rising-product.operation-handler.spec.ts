import { describe, expect, it, vi } from 'vitest';
import { SourcingOperationResultSchema } from '@kiditem/shared/sourcing';
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
    const execution = await handler.execute(context);
    expect(execution).toEqual({
      kind: 'completed',
      result: {
        outcome: 'complete',
        summary: {
          discovered: 1,
          accepted: 1,
          duplicate: 0,
          unchanged: 0,
          failed: 0,
        },
        sources: [{
          source: 'rising_products',
          outcome: 'complete',
          accepted: 1,
          failed: 0,
        }],
        snapshotGeneratedAt: '2026-08-14T01:00:00.000Z',
      },
    });
    if (execution.kind !== 'completed') throw new Error('expected completed result');
    expect(SourcingOperationResultSchema.parse(execution.result)).toEqual(execution.result);
    expect(JSON.stringify(execution.result)).not.toContain('candidate-row-must-not-enter');
    expect(rising.detect).toHaveBeenCalledWith(
      {
        organizationId: context.organizationId,
        windowDays: 14,
        limit: 100,
      },
      { signal: context.signal, checkpoint: context.checkpoint },
    );
  });

  it('returns partial with a bounded code when the persisted snapshot has data gaps', async () => {
    const registry = new OperationHandlerRegistryService();
    const rising = {
      detect: vi.fn().mockResolvedValue({
        businessDate: '2026-08-14',
        windowDays: 14,
        generatedAt: '2026-08-14T01:00:00.000Z',
        confidence: 0.5,
        dataGaps: ['raw provider gap detail', 'another raw gap'],
        model: {
          candidates: [{ id: 'candidate-1' }, { id: 'candidate-2' }],
          stats: { candidateCount: 2 },
        },
      }),
    };
    const handler = new SourcingRisingProductOperationHandler(
      registry,
      rising as never,
    );

    const execution = await handler.execute(context);

    expect(execution).toEqual({
      kind: 'completed',
      result: {
        outcome: 'partial',
        summary: {
          discovered: 2,
          accepted: 2,
          duplicate: 0,
          unchanged: 0,
          failed: 2,
        },
        sources: [{
          source: 'rising_products',
          outcome: 'partial',
          accepted: 2,
          failed: 2,
          errorCode: 'rising_data_gaps',
        }],
        snapshotGeneratedAt: '2026-08-14T01:00:00.000Z',
      },
    });
    if (execution.kind !== 'completed') throw new Error('expected completed result');
    expect(SourcingOperationResultSchema.parse(execution.result)).toEqual(execution.result);
    expect(JSON.stringify(execution.result)).not.toContain('raw provider gap');
  });

  it('returns no_change when detection completes with no candidates or data gaps', async () => {
    const registry = new OperationHandlerRegistryService();
    const rising = {
      detect: vi.fn().mockResolvedValue({
        businessDate: '2026-08-14',
        windowDays: 14,
        generatedAt: '2026-08-14T01:00:00.000Z',
        confidence: 1,
        dataGaps: [],
        model: { candidates: [], stats: { candidateCount: 0 } },
      }),
    };
    const handler = new SourcingRisingProductOperationHandler(
      registry,
      rising as never,
    );

    const execution = await handler.execute(context);

    expect(execution).toEqual({
      kind: 'completed',
      result: {
        outcome: 'no_change',
        summary: {
          discovered: 0,
          accepted: 0,
          duplicate: 0,
          unchanged: 0,
          failed: 0,
        },
        sources: [{
          source: 'rising_products',
          outcome: 'no_change',
          accepted: 0,
          failed: 0,
        }],
        snapshotGeneratedAt: '2026-08-14T01:00:00.000Z',
      },
    });
    if (execution.kind !== 'completed') throw new Error('expected completed result');
    expect(SourcingOperationResultSchema.parse(execution.result)).toEqual(execution.result);
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
