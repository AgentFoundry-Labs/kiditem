import { describe, expect, it, vi } from 'vitest';
import { AgentJudgmentDispatchRecoveryService } from '../agent-judgment-dispatch-recovery.service';
import { OperationPostAcceptingHookRegistryService } from '../../../../../operations/application/service/operation-post-accepting-hook-registry.service';

const signal = new AbortController().signal;

describe('AgentJudgmentDispatchRecoveryService', () => {
  it('drains content-free pending coordinates in bounded batches through the exact dispatcher', async () => {
    const first = {
      organizationId: 'org-1', sessionId: 'session-1', taskId: 'task-1',
      executionId: 'execution-1', requestedByUserId: 'user-1',
    };
    const second = { ...first, executionId: 'execution-2' };
    const outbox = {
      listPending: vi.fn()
        .mockResolvedValueOnce([first])
        .mockResolvedValueOnce([second])
        .mockResolvedValueOnce([]),
    };
    const dispatch = { dispatchPending: vi.fn().mockResolvedValue({ operationsRunId: 'operation-1' }) };

    await new AgentJudgmentDispatchRecoveryService(outbox as never, dispatch as never).run(signal);

    expect(outbox.listPending).toHaveBeenNthCalledWith(1, { limit: 100 });
    expect(outbox.listPending).toHaveBeenCalledTimes(3);
    expect(dispatch.dispatchPending).toHaveBeenCalledTimes(2);
    expect(dispatch.dispatchPending).toHaveBeenNthCalledWith(1, first);
    expect(dispatch.dispatchPending).toHaveBeenNthCalledWith(2, second);
  });

  it('does not duplicate work held by a concurrent valid lease', async () => {
    const candidate = {
      organizationId: 'org-1', sessionId: 'session-1', taskId: 'task-1',
      executionId: 'execution-1', requestedByUserId: 'user-1',
    };
    const outbox = {
      listPending: vi.fn().mockResolvedValueOnce([candidate]).mockResolvedValueOnce([]),
    };
    const dispatch = { dispatchPending: vi.fn().mockResolvedValue(null) };

    await expect(new AgentJudgmentDispatchRecoveryService(outbox as never, dispatch as never).run(signal))
      .resolves.toBeUndefined();
    expect(dispatch.dispatchPending).toHaveBeenCalledOnce();
  });

  it('fails closed when the same candidate remains pending after a recovery pass', async () => {
    const candidate = {
      organizationId: 'org-1', sessionId: 'session-1', taskId: 'task-1',
      executionId: 'execution-1', requestedByUserId: 'user-1',
    };
    const outbox = { listPending: vi.fn().mockResolvedValue([candidate]) };
    const dispatch = { dispatchPending: vi.fn().mockResolvedValue({ operationsRunId: 'operation-1' }) };

    await expect(new AgentJudgmentDispatchRecoveryService(outbox as never, dispatch as never).run(signal))
      .rejects.toThrow('agent_judgment_dispatch_recovery_non_progress');
  });

  it('rethrows the original abort reason before beginning another batch', async () => {
    const controller = new AbortController();
    const reason = new Error('shutdown');
    controller.abort(reason);
    const outbox = { listPending: vi.fn() };
    const dispatch = { dispatchPending: vi.fn() };

    await expect(new AgentJudgmentDispatchRecoveryService(outbox as never, dispatch as never).run(controller.signal))
      .rejects.toBe(reason);
    expect(outbox.listPending).not.toHaveBeenCalled();
  });

  it('registers exactly one API-only post-accepting hook after deletion recovery hooks', async () => {
    const registry = new OperationPostAcceptingHookRegistryService();
    const order: string[] = [];
    registry.register({
      key: 'agent-session-deletion-finalizers', priority: 10,
      run: async () => { order.push('finalizers'); },
    });
    registry.register({
      key: 'agent-session-deletions', priority: 20,
      run: async () => { order.push('deletions'); },
    });
    const outbox = { listPending: vi.fn().mockResolvedValue([]) };
    const dispatch = { dispatchPending: vi.fn() };
    const recovery = new AgentJudgmentDispatchRecoveryService(outbox as never, dispatch as never, registry);

    recovery.onModuleInit();
    await registry.runAll(signal);

    expect(order).toEqual(['finalizers', 'deletions']);
    expect(outbox.listPending).toHaveBeenCalledWith({ limit: 100 });
    expect(() => recovery.onModuleInit()).toThrow('duplicate operation post-accepting hook');
  });
});
