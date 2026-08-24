import { describe, expect, it, vi } from 'vitest';
import { AgentDelegatedAttemptStarterService } from './agent-delegated-attempt-starter.service';

describe('AgentDelegatedAttemptStarterService', () => {
  it('terminalizes and releases a newly admitted child when pre-launch config is missing', async () => {
    const work = { transitionAttempt: vi.fn(async () => ({ transitioned: true })) };
    const admissions = { releaseAttempt: vi.fn() };
    const execution = { start: vi.fn(async () => { throw new Error('runner_unavailable'); }) };
    const service = new AgentDelegatedAttemptStarterService(execution as never, work as never, admissions);

    await expect(service.start({ attemptId: 'attempt', sessionId: 'session', taskId: 'task', agentVersionId: 'version', organizationId: 'org', userId: 'user', agentKey: 'supply', runtime: 'codex_cli', capabilityKeys: [], prompt: 'work', model: 'gpt-5', instructionProfileRef: 'agent-config/prompts/agents/supply.md' })).rejects.toThrow('runner_unavailable');

    expect(work.transitionAttempt).toHaveBeenCalledWith(expect.objectContaining({ attemptId: 'attempt', from: 'starting', to: 'failed' }));
    expect(admissions.releaseAttempt).toHaveBeenCalledWith('attempt');
  });

  it('uses only the live execution capability port and never adds a login-home runtime profile', async () => {
    const execution = { start: vi.fn(async () => undefined) };
    const service = new AgentDelegatedAttemptStarterService(
      execution as never,
      { transitionAttempt: vi.fn(async () => ({ transitioned: true })) } as never,
      { releaseAttempt: vi.fn() },
    );

    await service.start({ attemptId: 'attempt', sessionId: 'session', taskId: 'task', agentVersionId: 'version', organizationId: 'org', userId: 'user', agentKey: 'supply', runtime: 'claude_cli', capabilityKeys: ['sourcing.scrapeProductUrl'], prompt: 'work', model: 'claude-3', instructionProfileRef: 'agent-config/prompts/agents/supply.md' });

    expect(execution.start).toHaveBeenCalledWith(expect.objectContaining({
      runtime: 'claude_cli',
      profile: { model: 'claude-3' },
      mcp: expect.objectContaining({ attemptId: 'attempt', capabilityKeys: ['sourcing.scrapeProductUrl'] }),
    }));
    expect(execution.start.mock.calls[0][0].profile).not.toHaveProperty('loginHome');
  });
});
