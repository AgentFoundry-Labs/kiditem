import { describe, expect, it, vi } from 'vitest';
import { AgentDelegatedAttemptStarterService } from './agent-delegated-attempt-starter.service';
import { AgentAttemptExecutorService } from '../../../adapter/out/runtime/attempt/agent-attempt-executor.service';
import { PrismaAgentWorkTransaction } from '../../../adapter/out/transaction/work/prisma-agent-work.transaction';
import { AgentAttemptAdmissionService } from './agent-attempt-admission.service';

describe('AgentDelegatedAttemptStarterService', () => {
  it('terminalizes and releases a newly admitted child when pre-launch config is missing', async () => {
    const work = { transitionAttempt: vi.fn(async () => ({ transitioned: true })) };
    const admissions = { releaseAttempt: vi.fn() };
    const modules = { get: vi.fn((token) => token === PrismaAgentWorkTransaction ? work : token === AgentAttemptAdmissionService ? admissions : { start: vi.fn() }) };
    const old = process.env.AGENT_SUPPLY_MODEL;
    delete process.env.AGENT_SUPPLY_MODEL;
    try {
      const service = new AgentDelegatedAttemptStarterService(modules as never);
      await expect(service.start({ attemptId: 'attempt', sessionId: 'session', taskId: 'task', agentVersionId: 'version', organizationId: 'org', userId: 'user', agentKey: 'supply', runtime: 'codex_cli', capabilityKeys: [], prompt: 'work' })).rejects.toThrow('missing_required_configuration:AGENT_SUPPLY_MODEL');
      expect(work.transitionAttempt).toHaveBeenCalledWith(expect.objectContaining({ attemptId: 'attempt', from: 'starting', to: 'failed' }));
      expect(admissions.releaseAttempt).toHaveBeenCalledWith('attempt');
    } finally { if (old === undefined) delete process.env.AGENT_SUPPLY_MODEL; else process.env.AGENT_SUPPLY_MODEL = old; }
  });
});
