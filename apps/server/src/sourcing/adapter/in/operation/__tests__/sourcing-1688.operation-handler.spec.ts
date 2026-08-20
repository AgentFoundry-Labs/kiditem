import type { OperationHandlerContext } from '../../../../../common/operation-definition';
import { OperationHandlerRegistryService } from '../../../../../operations/application/service/operation-handler-registry.service';
import { Sourcing1688BatchResultSchema } from '@kiditem/shared/sourcing';
import {
  Sourcing1688KeywordAttentionError,
  Sourcing1688KeywordProviderError,
} from '../../../../application/port/out/provider/1688-keyword-search.port';
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

function createHandler(...dependencies: unknown[]): Sourcing1688OperationHandler {
  return Reflect.construct(Sourcing1688OperationHandler, dependencies) as Sourcing1688OperationHandler;
}

describe('Sourcing1688OperationHandler', () => {
  it('registers the exact keyword domain operation alongside image matching', () => {
    const registry = new OperationHandlerRegistryService();
    const handler = createHandler(registry, {});

    handler.onModuleInit();

    expect(registry.listDefinitions().map((definition) => definition.key)).toEqual(
      expect.arrayContaining([
        'sourcing.search_1688_keyword_batch',
        'sourcing.match_wholesale_images',
      ]),
    );
  });

  it('keeps image matching on the server without exposing searched rows', async () => {
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
        outcome: 'no_change' as const,
        discovered: 0,
        accepted: 0,
        duplicate: 0,
        failed: 0,
      })),
    };
    const handler = createHandler(
      new OperationHandlerRegistryService(),
      {},
      {},
      imageSearch,
      {},
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

  it('uses one session for serial keyword persistence and fences every canonical commit', async () => {
    const events: string[] = [];
    const session = { searchKeyword: vi.fn(), close: vi.fn(async () => events.push('close')) };
    const provider = {
      openSession: vi.fn(async ({ signal }) => {
        expect(signal).toBe(baseContext.signal);
        events.push('open');
        return session;
      }),
    };
    const attemptVerifier = {
      withActiveDomainAttemptFence: vi.fn(async (_input, commit) => {
        events.push('fence');
        return commit({}, { transaction: true });
      }),
    };
    const keywordSearch = {
      searchForOperation: vi.fn(async (input: { keyword: string; session: unknown; commitWithinActiveOperationAttempt: (commit: (transaction: unknown) => Promise<unknown>) => Promise<unknown> }) => {
        events.push(`persist:${input.keyword}`);
        expect(input.session).toBe(session);
        await input.commitWithinActiveOperationAttempt(async () => undefined);
        return {
          keyword: input.keyword,
          targetId: null,
          outcome: 'complete' as const,
          discovered: 1,
          accepted: 1,
          duplicate: 0,
          failed: 0,
        };
      }),
    };
    const handler = createHandler(
      new OperationHandlerRegistryService(),
      provider,
      keywordSearch,
      {},
      attemptVerifier,
    );

    const result = await handler.execute({
      ...baseContext,
      operationKey: 'sourcing.search_1688_keyword_batch',
      input: { keywords: ['儿童笔袋', '儿童雨伞'] },
      checkpoint: vi.fn(async ({ progressCurrent }: { progressCurrent?: number } = {}) => {
        events.push(`checkpoint:${progressCurrent ?? 0}`);
      }),
    });

    expect(events).toEqual([
      'checkpoint:0',
      'open',
      'persist:儿童笔袋',
      'fence',
      'checkpoint:1',
      'persist:儿童雨伞',
      'fence',
      'checkpoint:2',
      'close',
    ]);
    expect(attemptVerifier.withActiveDomainAttemptFence).toHaveBeenCalledWith({
      organizationId: baseContext.organizationId,
      runId: baseContext.runId,
      expectedOperationKey: 'sourcing.search_1688_keyword_batch',
      attemptToken: baseContext.attemptToken,
    }, expect.any(Function));
    expect(result).toMatchObject({
      kind: 'completed',
      result: {
        outcome: 'complete',
        summary: { discovered: 2, accepted: 2, failed: 0 },
        units: [{ keyword: '儿童笔袋' }, { keyword: '儿童雨伞' }],
      },
    });
  });

  it('returns a strict row-free attention result with no canonical fence when the Office profile needs security verification', async () => {
    const session = { searchKeyword: vi.fn(), close: vi.fn(async () => undefined) };
    const attemptVerifier = { withActiveDomainAttemptFence: vi.fn() };
    const handler = createHandler(
      new OperationHandlerRegistryService(),
      { openSession: vi.fn(async () => session) },
      { searchForOperation: vi.fn(async () => { throw new Sourcing1688KeywordAttentionError('security_challenge'); }) },
      {},
      attemptVerifier,
    );

    const result = await handler.execute({
      ...baseContext,
      operationKey: 'sourcing.search_1688_keyword_batch',
      input: { keywords: ['儿童笔袋'] },
      checkpoint: vi.fn(async () => undefined),
    });

    expect(result).toMatchObject({
      kind: 'attention_required',
      reason: 'marketplace_login',
      result: { units: [{ keyword: '儿童笔袋', outcome: 'failed' }] },
    });
    if (result.kind !== 'attention_required') throw new Error('expected attention result');
    expect(Sourcing1688BatchResultSchema.safeParse(result.result).success).toBe(true);
    expect(JSON.stringify(result.result)).not.toContain('offer');
    expect(attemptVerifier.withActiveDomainAttemptFence).not.toHaveBeenCalled();
  });

  it.each(['cdp_unavailable', 'browser_context_unavailable', 'search_extraction_failed'] as const)(
    'uses the bounded %s provider code when every keyword fails before persistence',
    async (code) => {
    const handler = createHandler(
      new OperationHandlerRegistryService(),
      { openSession: vi.fn(async () => ({ searchKeyword: vi.fn(), close: vi.fn() })) },
      { searchForOperation: vi.fn(async () => { throw new Sourcing1688KeywordProviderError(code); }) },
      {},
      { withActiveDomainAttemptFence: vi.fn() },
    );

    await expect(handler.execute({
      ...baseContext,
      operationKey: 'sourcing.search_1688_keyword_batch',
      input: { keywords: ['儿童笔袋'] },
      checkpoint: vi.fn(async () => undefined),
    })).resolves.toEqual({
      kind: 'failed',
      code,
      message: '1688 keyword provider is unavailable.',
    });
    },
  );

  it('propagates a coordinator or repository failure instead of hiding it as a partial provider result', async () => {
    const failure = new Error('collection_commit_database_failure');
    const handler = createHandler(
      new OperationHandlerRegistryService(),
      { openSession: vi.fn(async () => ({ searchKeyword: vi.fn(), close: vi.fn() })) },
      { searchForOperation: vi.fn(async () => { throw failure; }) },
      {},
      { withActiveDomainAttemptFence: vi.fn() },
    );

    await expect(handler.execute({
      ...baseContext,
      operationKey: 'sourcing.search_1688_keyword_batch',
      input: { keywords: ['儿童笔袋', '儿童雨伞'] },
      checkpoint: vi.fn(async () => undefined),
    })).rejects.toBe(failure);
  });
});
