import { describe, expect, it, vi } from 'vitest';
import { OperationHandlerRegistryService } from '../../../../../operations/application/service/operation-handler-registry.service';
import { SourcingLiveCommerceOperationHandler } from '../sourcing-live-commerce.operation-handler';

describe('SourcingLiveCommerceOperationHandler', () => {
  it('owns the exact Taobao operation and returns only a bounded sourcing summary', async () => {
    const registry = new OperationHandlerRegistryService();
    const collectTaobao = vi.fn().mockResolvedValue({
      businessDate: '2026-08-14',
      broadcastCount: 2,
      productCount: 5,
      warnings: ['provider_rate_limited'],
    });
    const handler = new SourcingLiveCommerceOperationHandler(
      registry,
      { collectTaobao } as never,
    );
    handler.onModuleInit();
    const controller = new AbortController();
    const checkpoint = vi.fn(async () => undefined);

    expect(registry.getDefinition('sourcing.collect_taobao_live')).toMatchObject({
      engineType: 'domain',
      ownerDomain: 'sourcing',
    });

    await expect(handler.execute({
      organizationId: 'org-a',
      operationKey: 'sourcing.collect_taobao_live',
      input: { liveIds: ['123', '456'] },
      runId: 'run-a',
      signal: controller.signal,
      checkpoint,
    } as never)).resolves.toEqual({
      kind: 'completed',
      result: {
        outcome: 'partial',
        summary: {
          discovered: 7,
          accepted: 7,
          duplicate: 0,
          unchanged: 0,
          failed: 1,
        },
        sources: [{
          source: 'taobao_live',
          outcome: 'partial',
          accepted: 7,
          failed: 1,
          errorCode: 'taobao_live_warning',
        }],
      },
    });
    expect(collectTaobao).toHaveBeenCalledWith('org-a', {
      liveIds: ['123', '456'],
      queryDate: undefined,
    }, 'operation:run-a', {
      signal: controller.signal,
      checkpoint: expect.any(Function),
    });
  });

  it('rejects another operation key instead of becoming a generic live-action bridge', async () => {
    const handler = new SourcingLiveCommerceOperationHandler(
      new OperationHandlerRegistryService(),
      { collectTaobao: vi.fn() } as never,
    );

    await expect(handler.execute({ operationKey: 'sourcing.other' } as never))
      .rejects.toThrow('live_commerce_operation_key_invalid');
  });
});
