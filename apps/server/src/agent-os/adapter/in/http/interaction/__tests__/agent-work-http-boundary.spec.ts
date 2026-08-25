import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_DEFINITIONS } from '../../../../../domain/agent-definition.registry';

describe('Agent Work HTTP boundary', () => {
  it('makes REST and CopilotKit transport-only adapters over the common intake Interface', () => {
    for (const file of ['agent-work.controller.ts', 'agent-work-copilotkit.controller.ts']) {
      const source = readFileSync(resolve(__dirname, '..', file), 'utf8');
      expect(source).not.toContain('PrismaService');
      expect(source).not.toContain("application/service/work/agent-work-query.service");
      expect(source).not.toContain('adapter/out/runtime/');
      expect(source).toContain('AGENT_WORK_INTAKE_PORT');
      expect(source).toContain('AgentWorkIntakePort');
      expect(source).not.toContain('requiredEnvironment');
      expect(source).not.toContain('requiredRuntimeConfig');
      expect(source).not.toContain('supportedRuntime');
      expect(source).not.toContain('attemptRuntimeVersion');
      expect(source).not.toContain('this.executor.start');
      expect(source).not.toContain('KIDITEM_ATTEMPT_LOGIN_HOME');
      expect(source).not.toContain('KIDITEM_ATTEMPT_CLI_VERSION');
    }

    const rest = readFileSync(resolve(__dirname, '..', 'agent-work.controller.ts'), 'utf8');
    expect(rest).not.toContain('this.queries.activeVersion');
    expect(rest).not.toContain('this.queries.taskVersion');
    expect(rest).not.toContain('this.queries.continuationContext');
    expect(rest).not.toContain('this.launch.start');

    const copilot = readFileSync(resolve(__dirname, '..', 'agent-work-copilotkit.controller.ts'), 'utf8');
    expect(copilot).not.toContain('AGENT_WORK_QUERY_PORT');
    expect(copilot).not.toContain('AGENT_WORK_COMMAND_PORT');
    expect(copilot).not.toContain('AGENT_ATTEMPT_LAUNCH_CAPABILITY_PORT');
    expect(copilot).toContain('Object.fromEntries(AGENT_DEFINITIONS.map');
    expect(copilot).not.toContain('agents: { operator:');
  });

  it('exposes only the six code-owned Agent definitions and never turns terminal thread replay into reasoning', () => {
    const source = readFileSync(resolve(__dirname, '../../../../../application/service/work/agent-work-intake.module.ts'), 'utf8');
    expect(AGENT_DEFINITIONS.map((definition) => definition.key)).toEqual([
      'operator',
      'sourcing',
      'merchandising',
      'supply',
      'channel_operations',
      'advertising',
    ]);
    expect(source).toContain('agent_definition_not_supported');
    expect(source).toContain("agent_thread_agent_mismatch");
    expect(source).toContain('sessionId: input.sessionId');
    expect(source).toContain('this.queries.threadContinuation');
    expect(source).toContain('this.liveMessages.send');
    expect(source).toContain("kind: 'live_input'");
    expect(source).not.toContain("kind: 'successor'");
    expect(source).not.toContain('futureOutput');
    expect(source).not.toContain('conversation/replay');
  });

  it('derives explicit Continue prompts from bounded durable context without an automatic successor path', () => {
    const source = readFileSync(resolve(__dirname, '../../../../../application/service/work/agent-work-intake.module.ts'), 'utf8');
    expect(source).toContain('continuationContext');
    expect(source).not.toContain("input: { prompt: input.prompt ?? '' }");
    expect(source).not.toContain("prompt: input.prompt ?? ''");
    expect(source).not.toContain('successorContext');
  });

  it('binds final work input ports to Host Runner control and never API-local broker/process handlers', () => {
    const workModule = readFileSync(resolve(__dirname, '../../../../../../agent-work-capability-application.module.ts'), 'utf8');
    const runtimeModule = readFileSync(resolve(__dirname, '../../../../../../agent-runtime-application.module.ts'), 'utf8');
    expect(workModule).toContain('provide: AGENT_WORK_QUERY_PORT');
    expect(workModule).not.toContain('provide: AGENT_WORK_COMMAND_PORT');
    expect(workModule).toContain('AGENT_WORK_QUERY_REPOSITORY_PORT');
    expect(runtimeModule).not.toContain('AttemptMcpBrokerService');
    expect(runtimeModule).not.toContain('AgentAttemptExecutorService');
    expect(runtimeModule).toContain('HostRunnerAttemptExecutorService');
    expect(runtimeModule).toContain('HostRunnerControlSession');
    expect(runtimeModule).toContain('HOST_RUNNER_CONTROL_ATTEMPT_PORT');
    expect(runtimeModule).not.toContain('RunnerLeaseRegistry');
    expect(runtimeModule).not.toContain('RunnerCommandQueue');
    expect(runtimeModule).toContain('provide: AGENT_WORK_COMMAND_PORT');
    expect(runtimeModule).toContain('provide: AGENT_WORK_INTAKE_PORT');
    expect(runtimeModule).toContain('AgentLiveMessageService');
    expect(runtimeModule).toContain('provide: LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT');
    expect(runtimeModule).toContain('useExisting: HostRunnerAttemptExecutorService');
    expect(runtimeModule).not.toContain('FutureOutput');
    expect(runtimeModule).not.toContain('future-output');
  });

  it('keeps approval decisions and durable worker completion outside live CLI wake/relaunch wiring', () => {
    const capabilityModule = readFileSync(resolve(__dirname, '../../../../../../agent-work-capability-application.module.ts'), 'utf8');
    const workerModule = readFileSync(resolve(__dirname, '../../../../../../agent-worker-application.module.ts'), 'utf8');

    expect(capabilityModule).toContain('AgentCapabilityApprovalService, inject: [AGENT_WORK_INVOCATION_APPROVAL_PORT]');
    expect(capabilityModule).not.toContain('LIVE_ATTEMPT_OUTPUT_CAPABILITY_PORT');
    expect(capabilityModule).not.toContain('AGENT_ATTEMPT_LAUNCH_CAPABILITY_PORT');
    expect(workerModule).toContain('AgentMutationDispatcherService');
    expect(workerModule).not.toContain('AgentRuntimeApplicationModule');
    expect(workerModule).not.toContain('AgentWorkIntake');
    expect(workerModule).not.toContain('AgentAttemptLaunch');
    expect(workerModule).not.toContain('LIVE_ATTEMPT_OUTPUT');
  });
});
