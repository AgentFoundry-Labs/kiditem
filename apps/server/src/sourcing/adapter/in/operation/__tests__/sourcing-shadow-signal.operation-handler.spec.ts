import { describe, expect, it, vi } from 'vitest';
import { OperationHandlerRegistryService } from '../../../../../operations/application/service/operation-handler-registry.service';
import { SourcingShadowSignalOperationHandler } from '../sourcing-shadow-signal.operation-handler';

describe('SourcingShadowSignalOperationHandler', () => {
  it('is the sole exact shadow collection owner and fences both persisted snapshot boundaries', async () => {
    const registry = new OperationHandlerRegistryService();
    const collect = vi.fn().mockResolvedValue({
      claimed: true,
      snapshot: {
        id: 'snapshot-1',
        payload: {
          result: { status: 'complete', decisionImpact: 'disabled' },
          meta: { generatedAt: '2026-08-14T01:00:00.000Z' },
        },
      },
    });
    const withActiveDomainAttemptFence = vi.fn(async (_input, callback) =>
      callback({}));
    const handler = new SourcingShadowSignalOperationHandler(
      registry,
      { collect } as never,
      { withActiveDomainAttemptFence } as never,
    );
    handler.onModuleInit();
    const signal = new AbortController().signal;
    const checkpoint = vi.fn(async () => undefined);

    expect(registry.getDefinition('sourcing.collect_shadow_signals')).toMatchObject({
      engineType: 'domain',
      resourceClass: 'snapshot_compute',
    });
    await expect(handler.execute({
      organizationId: 'org-a',
      operationKey: 'sourcing.collect_shadow_signals',
      input: {},
      runId: 'run-a',
      attemptToken: 'attempt-a',
      signal,
      checkpoint,
    } as never)).resolves.toEqual({
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
          source: 'market_shadow_signals',
          outcome: 'complete',
          accepted: 1,
          failed: 0,
        }],
        snapshotGeneratedAt: '2026-08-14T01:00:00.000Z',
      },
    });
    expect(collect).toHaveBeenCalledWith('org-a', expect.any(Date), {
      signal,
      checkpoint: expect.any(Function),
      withinActiveOperationAttemptFence: expect.any(Function),
    });
    const controls = collect.mock.calls[0]?.[2];
    await controls?.withinActiveOperationAttemptFence(async (transaction) => transaction);
    expect(withActiveDomainAttemptFence).toHaveBeenCalledWith({
      organizationId: 'org-a',
      runId: 'run-a',
      expectedOperationKey: 'sourcing.collect_shadow_signals',
      attemptToken: 'attempt-a',
    }, expect.any(Function));
  });
});
