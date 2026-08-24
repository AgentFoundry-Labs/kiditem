import { describe, expect, it, vi } from 'vitest';
import { AgentDelegatedAttemptStarterService } from './agent-delegated-attempt-starter.service';

describe('AgentDelegatedAttemptStarterService', () => {
  it('does not re-enter common cleanup when the shared admitted launch lifecycle reports startup failure', async () => {
    const launch = {
      start: vi.fn(async () => { throw new Error('runner_unavailable'); }),
      failBeforeStart: vi.fn(async () => undefined),
    };
    const service = new AgentDelegatedAttemptStarterService(launch as never);

    await expect(service.start({ attemptId: 'attempt', sessionId: 'session', taskId: 'task', agentVersionId: 'version', organizationId: 'org', userId: 'user', agentKey: 'supply', runtime: 'codex_cli', capabilityKeys: [], prompt: 'work', model: 'gpt-5', instructionProfileRef: 'agent-config/prompts/agents/supply.md' })).rejects.toThrow('runner_unavailable');

    expect(launch.failBeforeStart).not.toHaveBeenCalled();
  });

  it('uses only the live execution capability port and never adds a login-home runtime profile', async () => {
    const launch = { start: vi.fn(async () => undefined), failBeforeStart: vi.fn(async () => undefined) };
    const service = new AgentDelegatedAttemptStarterService(launch as never);

    await service.start({ attemptId: 'attempt', sessionId: 'session', taskId: 'task', agentVersionId: 'version', organizationId: 'org', userId: 'user', agentKey: 'supply', runtime: 'claude_cli', capabilityKeys: ['sourcing.scrapeProductUrl'], prompt: 'work', model: 'claude-3', instructionProfileRef: 'agent-config/prompts/agents/supply.md' });

    expect(launch.start).toHaveBeenCalledWith(expect.objectContaining({
      runtime: 'claude_cli',
      profile: { model: 'claude-3' },
      attemptId: 'attempt',
      capabilityKeys: ['sourcing.scrapeProductUrl'],
    }));
    expect(launch.start.mock.calls[0][0].profile).not.toHaveProperty('loginHome');
  });
});
