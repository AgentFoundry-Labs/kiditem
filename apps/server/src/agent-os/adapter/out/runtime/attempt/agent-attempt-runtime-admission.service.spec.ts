import { describe, expect, it, vi } from 'vitest';
import { AgentAttemptRuntimeAdmissionService } from './agent-attempt-runtime-admission.service';

describe('AgentAttemptRuntimeAdmissionService', () => {
  it('admits a retired immutable version already pinned by the exact live Attempt tuple', async () => {
    const findFirst = vi.fn().mockResolvedValue({ runtimeType: 'codex_cli', reportedModel: 'gpt-5', applicationVersion: '1.2.3', authorizingGitSha: 'a'.repeat(40), agentVersion: { runtimeType: 'codex_cli' } });
    const readiness = { assertRuntime: vi.fn(async () => undefined) };
    const service = new AgentAttemptRuntimeAdmissionService({ agentAttempt: { findFirst } } as never, readiness as never);
    await expect(service.assert({ attemptId: 'attempt', organizationId: 'org', sessionId: 'session', taskId: 'task', agentVersionId: 'retired-version' }, 'codex_cli')).resolves.toBeUndefined();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.not.objectContaining({ agentVersion: expect.objectContaining({ retiredAt: null }) }) }));
    expect(readiness.assertRuntime).toHaveBeenCalledWith('codex_cli', 'gpt-5', `1.2.3:${'a'.repeat(40)}`);
  });

  it('preflights a successor against an activated retired Task snapshot', async () => {
    const taskFindFirst = vi.fn().mockResolvedValue({
      assignedAgentVersion: {
        runtimeType: 'codex_cli',
        activatedAt: new Date(),
        retiredAt: new Date(),
      },
    });
    const readiness = { assertRuntime: vi.fn(async () => undefined) };
    const service = new AgentAttemptRuntimeAdmissionService({
      agentTask: { findFirst: taskFindFirst },
    } as never, readiness as never);

    await expect(service.assertFollowUp({
      organizationId: 'org',
      sessionId: 'session',
      taskId: 'task',
      applicationVersion: '1.2.3',
      authorizingGitSha: 'a'.repeat(40),
      reportedModel: 'exact-model',
    } as never)).resolves.toBeUndefined();

    expect(readiness.assertRuntime).toHaveBeenCalledWith(
      'codex_cli',
      'exact-model',
      `1.2.3:${'a'.repeat(40)}`,
    );
  });

  it('preflights the exact active root, follow-up, and delegated AgentVersion tuples before durable admission', async () => {
    const versionFindFirst = vi
      .fn()
      .mockResolvedValueOnce({ runtimeType: 'codex_cli', activatedAt: new Date(), retiredAt: null })
      .mockResolvedValueOnce({ runtimeType: 'claude_cli', activatedAt: new Date(), retiredAt: null });
    const taskFindFirst = vi.fn().mockResolvedValue({
      assignedAgentVersion: { runtimeType: 'claude_cli', activatedAt: new Date(), retiredAt: null },
    });
    const readiness = { assertRuntime: vi.fn(async () => undefined) };
    const service = new AgentAttemptRuntimeAdmissionService({
      agentVersion: { findFirst: versionFindFirst },
      agentTask: { findFirst: taskFindFirst },
    } as never, readiness as never);
    const snapshot = {
      applicationVersion: '1.2.3',
      authorizingGitSha: 'a'.repeat(40),
      reportedModel: 'exact-model',
    };

    await expect(service.assertRoot({
      ...snapshot,
      assignedAgentVersionId: 'root-version',
    } as never)).resolves.toBeUndefined();
    await expect(service.assertFollowUp({
      ...snapshot,
      organizationId: 'org',
      sessionId: 'session',
      taskId: 'task',
    } as never)).resolves.toBeUndefined();
    await expect(service.assertDelegation({
      ...snapshot,
      targetAgentVersionId: 'child-version',
    } as never)).resolves.toBeUndefined();

    expect(readiness.assertRuntime).toHaveBeenNthCalledWith(
      1,
      'codex_cli',
      'exact-model',
      `1.2.3:${'a'.repeat(40)}`,
    );
    expect(readiness.assertRuntime).toHaveBeenNthCalledWith(
      2,
      'claude_cli',
      'exact-model',
      `1.2.3:${'a'.repeat(40)}`,
    );
    expect(readiness.assertRuntime).toHaveBeenNthCalledWith(
      3,
      'claude_cli',
      'exact-model',
      `1.2.3:${'a'.repeat(40)}`,
    );
    expect(versionFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'root-version', activatedAt: { not: null }, retiredAt: null },
    }));
    expect(taskFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'task', organizationId: 'org', sessionId: 'session' },
    }));
    expect(versionFindFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'child-version', activatedAt: { not: null }, retiredAt: null },
    }));
  });
});
