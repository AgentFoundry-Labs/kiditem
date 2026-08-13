import { describe, expect, it, vi } from 'vitest';
import { AgentInlineRunReconciler } from '../agent-inline-run-reconciler.service';

function buildReconciler(env: NodeJS.ProcessEnv = {}) {
  const repository = {
    failInterruptedInlineRuns: vi.fn().mockResolvedValue([]),
    markRequestStatus: vi.fn(),
  };
  return {
    repository,
    reconciler: new AgentInlineRunReconciler(repository as never, env),
  };
}

describe('AgentInlineRunReconciler', () => {
  it('fails interrupted dashboard requests without requeueing them', async () => {
    const { reconciler, repository } = buildReconciler();
    repository.failInterruptedInlineRuns.mockResolvedValueOnce([
      {
        organizationId: 'org-1',
        requestId: 'r1',
        runId: 'run1',
        agentInstanceId: 'instance-1',
      },
    ]);

    await reconciler.onModuleInit();

    expect(repository.failInterruptedInlineRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'sourcing_dashboard',
        requestStatuses: ['pending', 'claimed', 'requires_approval'],
        errorCode: 'process_interrupted',
        limit: 100,
      }),
    );
    expect(repository.markRequestStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
    );
  });

  it('does not reconcile requests from an Agent OS MCP child context', async () => {
    const { reconciler, repository } = buildReconciler({
      KIDITEM_AGENT_OS_MCP_CHILD: '1',
    });

    await reconciler.onModuleInit();

    expect(repository.failInterruptedInlineRuns).not.toHaveBeenCalled();
  });
});
