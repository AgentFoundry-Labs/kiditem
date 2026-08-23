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
});
