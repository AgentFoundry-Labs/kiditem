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
  it('registers only the tabless image matcher and leaves keyword search to the browser runtime', () => {
    const registry = new OperationHandlerRegistryService();
    const handler = new Sourcing1688OperationHandler(
      registry,
      {} as never,
    );

    handler.onModuleInit();

    expect(registry.listDefinitions().map((definition) => definition.key)).toEqual([
      'sourcing.match_wholesale_images',
    ]);
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

  it('does not execute the browser-owned keyword operation in the server handler', async () => {
    const imageSearch = {
      resolveTargets: vi.fn(),
      searchForOperation: vi.fn(),
    };
    const handler = new Sourcing1688OperationHandler(
      new OperationHandlerRegistryService(),
      imageSearch as never,
    );

    await expect(handler.execute({
      ...baseContext,
      operationKey: 'sourcing.search_1688_keyword_batch',
      input: { keywords: ['儿童笔袋'] },
      checkpoint: vi.fn(async () => undefined),
    })).resolves.toEqual({
      kind: 'failed',
      code: 'unsupported_operation',
      message: 'Unsupported 1688 operation.',
    });
    expect(imageSearch.resolveTargets).not.toHaveBeenCalled();
  });
});
