import type { OperationHandlerContext } from '../../../../../common/operation-definition';
import { OperationHandlerRegistryService } from '../../../../../operations/application/service/operation-handler-registry.service';
import { describe, expect, it, vi } from 'vitest';
import { Sourcing1688OperationHandler } from '../sourcing-1688.operation-handler';

const baseContext: Omit<OperationHandlerContext, 'operationKey' | 'input'> = {
  runId: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000002',
  triggerSource: 'domain_screen',
  requestedByUserId: '00000000-0000-4000-8000-000000000003',
  scheduleId: null,
  parentRunId: null,
  attemptToken: '00000000-0000-4000-8000-000000000004',
  signal: new AbortController().signal,
  checkpoint: vi.fn(async () => undefined),
};

describe('Sourcing1688OperationHandler', () => {
  it('registers both exact Playwright definitions', () => {
    const registry = new OperationHandlerRegistryService();
    const handler = new Sourcing1688OperationHandler(
      registry,
      {} as never,
      {} as never,
    );

    handler.onModuleInit();

    expect(registry.getDefinition('sourcing.search_1688_keyword_batch').resourceClass)
      .toBe('playwright_1688');
    expect(registry.getDefinition('sourcing.match_wholesale_images').resourceClass)
      .toBe('playwright_1688');
  });

  it('runs keyword units serially, passes the attempt signal, and checkpoints after each atomic write', async () => {
    const events: string[] = [];
    const keywordSearch = {
      searchForOperation: vi.fn(async (input: { keyword: string; signal: AbortSignal }) => {
        events.push(`provider:${input.keyword}`);
        expect(input.signal).toBe(baseContext.signal);
        return {
          keyword: input.keyword,
          targetId: null,
          outcome: 'complete',
          discovered: 2,
          accepted: 2,
          duplicate: 0,
          failed: 0,
        };
      }),
      refreshRecommendations: vi.fn(async () => undefined),
    };
    const checkpoint = vi.fn(async (update?: { progressCurrent?: number }) => {
      events.push(`checkpoint:${update?.progressCurrent ?? 0}`);
    });
    const handler = new Sourcing1688OperationHandler(
      new OperationHandlerRegistryService(),
      keywordSearch as never,
      {} as never,
    );

    const result = await handler.execute({
      ...baseContext,
      operationKey: 'sourcing.search_1688_keyword_batch',
      input: { keywords: ['儿童笔袋', '儿童雨伞'] },
      checkpoint,
    });

    expect(events).toEqual([
      'checkpoint:0',
      'provider:儿童笔袋',
      'checkpoint:1',
      'provider:儿童雨伞',
      'checkpoint:2',
    ]);
    expect(keywordSearch.searchForOperation).toHaveBeenNthCalledWith(1, {
      organizationId: baseContext.organizationId,
      operationRunId: baseContext.runId,
      actorUserId: baseContext.requestedByUserId,
      keyword: '儿童笔袋',
      signal: baseContext.signal,
      checkpoint: expect.any(Function),
    });
    expect(keywordSearch.refreshRecommendations).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      kind: 'completed',
      result: {
        outcome: 'complete',
        summary: { discovered: 4, accepted: 4, failed: 0 },
        units: [{ keyword: '儿童笔袋' }, { keyword: '儿童雨伞' }],
      },
    });
    expect(JSON.stringify(result)).not.toContain('items');
  });

  it('resolves image/search data on the server, reports missing owner targets, and returns no rows', async () => {
    const imageSearch = {
      resolveTargets: vi.fn(async () => ({
        targets: [{
          targetId: 'product-1::',
          imageUrl: 'https://thumbnail10.coupangcdn.com/owner.jpg',
          searchQuery: '儿童笔袋文具盒',
        }],
        missingTargetIds: ['product-2::'],
      })),
      searchForOperation: vi.fn(async () => ({
        keyword: '儿童笔袋文具盒',
        targetId: 'product-1::',
        outcome: 'no_change',
        discovered: 0,
        accepted: 0,
        duplicate: 0,
        failed: 0,
      })),
      refreshRecommendations: vi.fn(async () => undefined),
    };
    const handler = new Sourcing1688OperationHandler(
      new OperationHandlerRegistryService(),
      {} as never,
      imageSearch as never,
    );

    const result = await handler.execute({
      ...baseContext,
      operationKey: 'sourcing.match_wholesale_images',
      input: { targetIds: ['product-1::', 'product-2::'] },
      checkpoint: vi.fn(async () => undefined),
    });

    expect(imageSearch.resolveTargets).toHaveBeenCalledWith({
      organizationId: baseContext.organizationId,
      targetIds: ['product-1::', 'product-2::'],
    });
    expect(imageSearch.searchForOperation).toHaveBeenCalledWith(expect.objectContaining({
      operationRunId: baseContext.runId,
      targetId: 'product-1::',
      imageUrl: 'https://thumbnail10.coupangcdn.com/owner.jpg',
      keyword: '儿童笔袋文具盒',
      signal: baseContext.signal,
    }));
    expect(imageSearch.refreshRecommendations).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      kind: 'completed',
      result: {
        outcome: 'partial',
        units: [
          { targetId: 'product-1::', outcome: 'no_change' },
          { targetId: 'product-2::', outcome: 'failed', errorCode: 'target_not_authorized' },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain('owner.jpg');
  });

  it('does not hide an all-failed batch as success', async () => {
    const keywordSearch = {
      searchForOperation: vi.fn(async () => {
        throw new Error('provider unavailable');
      }),
      refreshRecommendations: vi.fn(),
    };
    const handler = new Sourcing1688OperationHandler(
      new OperationHandlerRegistryService(),
      keywordSearch as never,
      {} as never,
    );

    await expect(handler.execute({
      ...baseContext,
      operationKey: 'sourcing.search_1688_keyword_batch',
      input: { keywords: ['儿童笔袋'] },
      checkpoint: vi.fn(async () => undefined),
    })).resolves.toEqual({
      kind: 'failed',
      code: 'all_targets_failed',
      message: 'All 1688 batch targets failed.',
    });
    expect(keywordSearch.refreshRecommendations).not.toHaveBeenCalled();
  });

  it('propagates abort/fence loss and never starts the next unit', async () => {
    const controller = new AbortController();
    const reason = new Error('operation_attempt_fence_lost');
    const keywordSearch = {
      searchForOperation: vi.fn(async () => {
        controller.abort(reason);
        throw reason;
      }),
      refreshRecommendations: vi.fn(),
    };
    const handler = new Sourcing1688OperationHandler(
      new OperationHandlerRegistryService(),
      keywordSearch as never,
      {} as never,
    );

    await expect(handler.execute({
      ...baseContext,
      signal: controller.signal,
      operationKey: 'sourcing.search_1688_keyword_batch',
      input: { keywords: ['儿童笔袋', '儿童雨伞'] },
      checkpoint: vi.fn(async () => undefined),
    })).rejects.toBe(reason);
    expect(keywordSearch.searchForOperation).toHaveBeenCalledOnce();
  });
});
