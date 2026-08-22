import { describe, expect, it, vi } from 'vitest';
import { AgentSessionDeletionFinalizerRecoveryService } from '../agent-session-deletion-finalizer-recovery.service';
import { AgentSessionDeletionRecoveryService } from '../agent-session-deletion-recovery.service';
import { OperationPostAcceptingHookRegistryService } from '../../../../../operations/application/service/operation-post-accepting-hook-registry.service';

const signal = new AbortController().signal;

describe('AgentSession deletion recovery', () => {
  it('purges every graph_deleted lineage after a crash without recreating a session', async () => {
    const purgeGraphDeletedLineage = vi.fn().mockResolvedValue(undefined);
    const finalization = {
      listGraphDeletedFinalizers: vi.fn()
        .mockResolvedValueOnce([{ organizationId: 'org-1', sessionId: 'session-1', currentOperationRunId: 'run-1' }])
        .mockResolvedValueOnce([]),
      purgeGraphDeletedLineage,
    };

    await new AgentSessionDeletionFinalizerRecoveryService(finalization as never).run(signal);

    expect(purgeGraphDeletedLineage).toHaveBeenCalledWith({
      signal,
      organizationId: 'org-1',
      sessionId: 'session-1',
      currentOperationRunId: 'run-1',
      expectedAttemptToken: null,
    });
  });

  it('creates no sixth cumulative attempt across lifecycle successors', async () => {
    const continueInterruptedDeletion = vi.fn().mockResolvedValue('failed');
    const finalization = {
      listInterruptedDeletions: vi.fn()
        .mockResolvedValueOnce([{
          organizationId: 'org-1',
          sessionId: 'session-1',
          currentOperationRunId: 'run-5',
          retryGeneration: 1,
          consumedAttempts: 5,
        }])
        .mockResolvedValueOnce([]),
      continueInterruptedDeletion,
    };

    await new AgentSessionDeletionRecoveryService(finalization as never).run(signal);

    expect(continueInterruptedDeletion).toHaveBeenCalledWith(expect.objectContaining({
      consumedAttempts: 5,
    }));
  });

  it('drains recovery batches larger than one hundred candidates', async () => {
    const candidates = Array.from({ length: 101 }, (_, index) => ({
      organizationId: 'org-1', sessionId: `session-${index}`, currentOperationRunId: `run-${index}`,
    }));
    const finalization = {
      listGraphDeletedFinalizers: vi.fn()
        .mockResolvedValueOnce(candidates.slice(0, 100))
        .mockResolvedValueOnce(candidates.slice(100))
        .mockResolvedValueOnce([]),
      purgeGraphDeletedLineage: vi.fn().mockResolvedValue(undefined),
    };

    await new AgentSessionDeletionFinalizerRecoveryService(finalization as never).run(signal);

    expect(finalization.purgeGraphDeletedLineage).toHaveBeenCalledTimes(101);
  });

  it('drains more than one hundred interrupted deletion candidates', async () => {
    const candidates = Array.from({ length: 101 }, (_, index) => ({
      organizationId: 'org-1', sessionId: `session-${index}`, currentOperationRunId: `run-${index}`,
      retryGeneration: 1, consumedAttempts: index % 5,
    }));
    const finalization = {
      listInterruptedDeletions: vi.fn()
        .mockResolvedValueOnce(candidates.slice(0, 100))
        .mockResolvedValueOnce(candidates.slice(100))
        .mockResolvedValueOnce([]),
      continueInterruptedDeletion: vi.fn().mockResolvedValue('continued'),
    };

    await new AgentSessionDeletionRecoveryService(finalization as never).run(signal);

    expect(finalization.continueInterruptedDeletion).toHaveBeenCalledTimes(101);
  });

  it('fails closed on a permanent finalizer purge error', async () => {
    const finalization = {
      listGraphDeletedFinalizers: vi.fn().mockResolvedValue([
        { organizationId: 'org-1', sessionId: 'session-1', currentOperationRunId: 'run-1' },
      ]),
      purgeGraphDeletedLineage: vi.fn().mockRejectedValue(new Error('permanent_purge_error')),
    };

    await expect(new AgentSessionDeletionFinalizerRecoveryService(finalization as never).run(signal))
      .rejects.toThrow('permanent_purge_error');
  });

  it('fails a repeated non-progressing recovery batch', async () => {
    const candidate = {
      organizationId: 'org-1', sessionId: 'session-1', currentOperationRunId: 'run-1',
      retryGeneration: 1, consumedAttempts: 1,
    };
    const finalization = {
      listInterruptedDeletions: vi.fn().mockResolvedValue([candidate]),
      continueInterruptedDeletion: vi.fn().mockResolvedValue('continued'),
    };

    await expect(new AgentSessionDeletionRecoveryService(finalization as never).run(signal))
      .rejects.toThrow('agent_session_deletion_recovery_non_progress');
  });

  it('runs finalizers before interrupted deletion recovery in a focused hook registry', async () => {
    const order: string[] = [];
    const hooks = new OperationPostAcceptingHookRegistryService();
    hooks.register({
      key: 'agent-session-deletion-finalizers', priority: 10,
      run: async () => { order.push('finalizers'); },
    });
    hooks.register({
      key: 'agent-session-deletions', priority: 20,
      run: async () => { order.push('deletions'); },
    });

    await hooks.runAll(signal);

    expect(order).toEqual(['finalizers', 'deletions']);
  });
});
