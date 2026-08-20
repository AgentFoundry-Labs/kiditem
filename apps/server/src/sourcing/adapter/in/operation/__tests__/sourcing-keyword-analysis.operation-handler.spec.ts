import { describe, expect, it, vi } from 'vitest';
import { OperationHandlerRegistryService } from '../../../../../operations/application/service/operation-handler-registry.service';
import { SourcingKeywordAnalysisOperationHandler } from '../sourcing-keyword-analysis.operation-handler';

describe('SourcingKeywordAnalysisOperationHandler', () => {
  it('is the only exact owner that passes cancellation and the active domain fence to Naver collection', async () => {
    const registry = new OperationHandlerRegistryService();
    const collectAnalysis = vi.fn().mockResolvedValue({
      snapshot: { id: 'snapshot-a' },
      payload: { result: { popular: null, related: null, autocomplete: [], trends: null } },
    });
    const withActiveDomainAttemptFence = vi.fn(async (_input, callback) => callback({}, { opaque: true }));
    const handler = new SourcingKeywordAnalysisOperationHandler(
      registry,
      { collectAnalysis } as never,
      { withActiveDomainAttemptFence } as never,
    );
    handler.onModuleInit();
    const signal = new AbortController().signal;
    const checkpoint = vi.fn(async () => undefined);

    expect(registry.getDefinition('sourcing.collect_keyword_analysis')).toMatchObject({
      engineType: 'domain',
      resourceClass: 'naver_api',
    });
    await expect(handler.execute({
      organizationId: 'org-a',
      operationKey: 'sourcing.collect_keyword_analysis',
      input: {
        action: 'popular',
        timeUnit: 'date',
        gender: 'all',
        age: 'all',
        device: 'all',
        selectedBoardKey: 'all',
        rankLimit: 20,
        focusMode: 'all',
        finalLimit: 30,
      },
      runId: 'run-a',
      attemptToken: 'attempt-a',
      signal,
      checkpoint,
    } as never)).resolves.toMatchObject({
      kind: 'completed',
      result: {
        outcome: 'complete',
        sources: [{ source: 'naver_keyword_analysis', outcome: 'complete' }],
      },
    });

    expect(collectAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-a',
      signal,
      checkpoint: expect.any(Function),
      withinActiveOperationAttemptFence: expect.any(Function),
    }));
    const controls = collectAnalysis.mock.calls[0]?.[0];
    await controls?.withinActiveOperationAttemptFence(async (transaction: unknown) => transaction);
    expect(withActiveDomainAttemptFence).toHaveBeenCalledWith({
      organizationId: 'org-a',
      runId: 'run-a',
      expectedOperationKey: 'sourcing.collect_keyword_analysis',
      attemptToken: 'attempt-a',
    }, expect.any(Function));
  });

  it('rejects a different operation key rather than becoming an action bridge', async () => {
    const handler = new SourcingKeywordAnalysisOperationHandler(
      new OperationHandlerRegistryService(),
      { collectAnalysis: vi.fn() } as never,
      { withActiveDomainAttemptFence: vi.fn() } as never,
    );

    await expect(handler.execute({ operationKey: 'sourcing.other' } as never))
      .rejects.toThrow('keyword_analysis_operation_key_invalid');
  });
});
