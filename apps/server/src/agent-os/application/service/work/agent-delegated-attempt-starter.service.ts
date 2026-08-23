import { ModuleRef } from '@nestjs/core';
import { AgentAttemptExecutorService } from '../../../adapter/out/runtime/attempt/agent-attempt-executor.service';
import { PrismaAgentWorkTransaction } from '../../../adapter/out/transaction/work/prisma-agent-work.transaction';
import { AgentAttemptAdmissionService } from './agent-attempt-admission.service';

/**
 * Starts a newly admitted delegated Attempt exactly once.  The lazy API-root
 * lookup avoids making the MCP broker and executor a construction-time cycle.
 */
export class AgentDelegatedAttemptStarterService {
  constructor(private readonly modules: ModuleRef) {}

  async start(input: {
    attemptId: string;
    sessionId: string;
    taskId: string;
    agentVersionId: string;
    organizationId: string;
    userId: string;
    agentKey: string;
    runtime: string;
    capabilityKeys: readonly string[];
    prompt: string;
  }): Promise<void> {
    try {
      if (input.runtime !== 'codex_cli' && input.runtime !== 'claude_cli') throw new Error('attempt_runtime_not_supported');
      const executor = this.modules.get(AgentAttemptExecutorService, { strict: false });
      const model = required(`AGENT_${input.agentKey.toUpperCase()}_MODEL`);
      await executor.start({
        attemptId: input.attemptId,
        runtime: input.runtime,
        profile: { model, loginHome: required('KIDITEM_ATTEMPT_LOGIN_HOME') },
        prompt: input.prompt,
        mcp: {
          attemptId: input.attemptId, sessionId: input.sessionId, taskId: input.taskId,
          agentVersionId: input.agentVersionId, organizationId: input.organizationId,
          userId: input.userId, capabilityKeys: [...input.capabilityKeys],
        },
      });
    } catch (error) {
      // Config failures happen before AgentAttemptExecutorService owns the
      // Attempt, so terminalize/release here rather than leaking a `starting`
      // row and its admission slot.
      const work = this.modules.get(PrismaAgentWorkTransaction, { strict: false });
      const admissions = this.modules.get(AgentAttemptAdmissionService, { strict: false });
      try {
        await work.transitionAttempt({
          attemptId: input.attemptId, from: 'starting', to: 'failed', at: new Date(),
          error: { code: 'attempt_start_failed', message: error instanceof Error ? error.message.slice(0, 1_000) : 'Attempt failed to start.' },
        });
      } finally { admissions.releaseAttempt(input.attemptId); }
      throw error;
    }
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_required_configuration:${name}`);
  return value;
}
