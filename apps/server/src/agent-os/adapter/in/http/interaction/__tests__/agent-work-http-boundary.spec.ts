import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Agent Work HTTP boundary', () => {
  it('depends only on capability-named Agent Work input ports', () => {
    for (const file of ['agent-work.controller.ts', 'agent-work-copilotkit.controller.ts']) {
      const source = readFileSync(resolve(__dirname, '..', file), 'utf8');
      expect(source).not.toContain('PrismaService');
      expect(source).not.toContain("application/service/work/agent-work-query.service");
      expect(source).not.toContain('adapter/out/runtime/');
      expect(source).toContain('AGENT_WORK_QUERY_PORT');
      expect(source).toContain('AgentWorkQueryPort');
      expect(source).toContain('LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT');
    }
  });

  it('uses the client UUID thread as a fenced durable session and follows up only after a terminal predecessor', () => {
    const source = readFileSync(resolve(__dirname, '..', 'agent-work-copilotkit.controller.ts'), 'utf8');
    expect(source).toContain('sessionId: threadId');
    expect(source).toContain('this.queries.threadContinuation');
    expect(source).toContain('if (!predecessor?.terminal) throw error');
    expect(source).not.toContain('conversation/replay');
  });

  it('derives all successor prompts from bounded durable context instead of an empty prompt', () => {
    for (const file of ['agent-work.controller.ts', 'agent-work-copilotkit.controller.ts']) {
      const source = readFileSync(resolve(__dirname, '..', file), 'utf8');
      expect(source).toContain('continuationContext');
      expect(source).not.toContain("input: { prompt: input.prompt ?? '' }");
      expect(source).not.toContain("prompt: input.prompt ?? ''");
    }
  });

  it('binds final work input ports to Host Runner control and never API-local broker/process handlers', () => {
    const workModule = readFileSync(resolve(__dirname, '../../../../../../agent-work-capability-application.module.ts'), 'utf8');
    const runtimeModule = readFileSync(resolve(__dirname, '../../../../../../agent-runtime-application.module.ts'), 'utf8');
    expect(workModule).toContain('provide: AGENT_WORK_QUERY_PORT');
    expect(workModule).toContain('provide: AGENT_WORK_COMMAND_PORT');
    expect(workModule).toContain('AGENT_WORK_QUERY_REPOSITORY_PORT');
    expect(runtimeModule).not.toContain('AttemptMcpBrokerService');
    expect(runtimeModule).not.toContain('AgentAttemptExecutorService');
    expect(runtimeModule).toContain('HostRunnerAttemptExecutorService');
    expect(runtimeModule).toContain('RunnerLeaseRegistry');
    expect(runtimeModule).toContain('provide: LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT');
    expect(runtimeModule).toContain('useExisting: HostRunnerAttemptExecutorService');
    expect(runtimeModule).toContain('provide: LIVE_ATTEMPT_FUTURE_OUTPUT_CAPABILITY_PORT');
    expect(runtimeModule).toContain('useExisting: AttemptFutureOutputChannel');
  });
});
