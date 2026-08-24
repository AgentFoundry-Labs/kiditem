import { Module } from '@nestjs/common';
import { AgentWorkCapabilityApplicationModule } from './agent-work-capability-application.module';
import { AttemptFutureOutputChannel } from './agent-os/adapter/out/runtime/attempt/attempt-future-output-channel';
import { AgentAttemptRuntimeAdmissionService } from './agent-os/adapter/out/runtime/attempt/agent-attempt-runtime-admission.service';
import { AttemptTokenRegistry } from './agent-os/adapter/out/runtime/runner/attempt-token.registry';
import { HostRunnerAttemptExecutorService } from './agent-os/adapter/out/runtime/runner/host-runner-attempt-executor.service';
import { RunnerAttemptPromptResolverService } from './agent-os/adapter/out/runtime/runner/runner-attempt-prompt-resolver.service';
import { RunnerAttemptRuntimeControlService } from './agent-os/adapter/out/runtime/runner/runner-attempt-runtime-control.service';
import { RunnerCommandQueue } from './agent-os/adapter/out/runtime/runner/runner-command.queue';
import { RunnerEventHandlerService } from './agent-os/adapter/out/runtime/runner/runner-event-handler.service';
import { RunnerInstallationTokenService } from './agent-os/adapter/out/runtime/runner/runner-installation-token.service';
import { RunnerLeaseRegistry } from './agent-os/adapter/out/runtime/runner/runner-lease.registry';
import { RunnerReadinessService } from './agent-os/adapter/out/runtime/runner/runner-readiness.service';
import { AgentAttemptReconciler } from './agent-os/application/service/work/agent-attempt-reconciler.service';
import { AgentApiStartupReconciler } from './agent-os/application/service/work/agent-api-startup-reconciler.service';
import { AgentLiveMessageService } from './agent-os/application/service/work/agent-live-message.service';
import { AttemptMcpActionsService } from './agent-os/application/service/work/attempt-mcp-actions.service';
import { AgentDelegatedAttemptStarterService } from './agent-os/application/service/work/agent-delegated-attempt-starter.service';
import { AgentAttemptLaunchService } from './agent-os/application/service/work/agent-attempt-launch.service';
import { ATTEMPT_MCP_ACTIONS_PORT, type AttemptMcpActionsPort } from './agent-os/application/port/in/mcp/attempt-mcp-actions.port';
import { LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT, type LiveAttemptExecutionCapabilityPort } from './agent-os/application/port/in/capability/live-attempt-execution.capability.port';
import {
  AGENT_ATTEMPT_LAUNCH_CAPABILITY_PORT,
  type AgentAttemptLaunchCapabilityPort,
} from './agent-os/application/port/in/capability/agent-attempt-launch.capability.port';
import { LIVE_ATTEMPT_FUTURE_OUTPUT_CAPABILITY_PORT } from './agent-os/application/port/in/capability/live-attempt-future-output.capability.port';
import { ATTEMPT_RUNTIME_CONTROL_PORT, type AttemptRuntimeControlPort } from './agent-os/application/port/out/runtime/attempt-runtime-control.port';
import { AgentCapabilityInvocationService } from './agent-os/application/service/work/agent-capability-invocation.service';
import { AgentTaskDelegationService } from './agent-os/application/service/work/agent-task-delegation.service';
import { AgentCapabilityRegistry } from './agent-os/application/service/agent-capability-registry.service';
import { PrismaAgentWorkRepository } from './agent-os/adapter/out/repository/work/prisma-agent-work.repository';
import { AgentAttemptAdmissionService } from './agent-os/application/service/work/agent-attempt-admission.service';
import { PrismaAgentWorkTransaction } from './agent-os/adapter/out/transaction/work/prisma-agent-work.transaction';
import { PrismaService } from './prisma/prisma.service';

/**
 * API-owned durable admission plus process-memory Host Runner control.
 * Provider processes, homes, workspaces, and protocol streams stay outside Nest.
 */
@Module({
  imports: [AgentWorkCapabilityApplicationModule],
  providers: [
    AttemptFutureOutputChannel,
    { provide: LIVE_ATTEMPT_FUTURE_OUTPUT_CAPABILITY_PORT, useExisting: AttemptFutureOutputChannel },
    { provide: RunnerInstallationTokenService, useFactory: () => new RunnerInstallationTokenService() },
    RunnerCommandQueue,
    AttemptTokenRegistry,
    {
      provide: RunnerLeaseRegistry,
      inject: [RunnerCommandQueue],
      useFactory: (commands: RunnerCommandQueue) => new RunnerLeaseRegistry({
        commands,
        // The event handler replaces this process-memory hook during module
        // composition, avoiding a durable control record or Nest ModuleRef.
        interruptAttempt: async () => undefined,
      }),
    },
    {
      provide: RunnerReadinessService,
      inject: [RunnerLeaseRegistry],
      useFactory: (leases: RunnerLeaseRegistry) => new RunnerReadinessService(leases),
    },
    {
      provide: AgentAttemptRuntimeAdmissionService,
      inject: [PrismaService, RunnerReadinessService],
      useFactory: (prisma: PrismaService, readiness: RunnerReadinessService) =>
        new AgentAttemptRuntimeAdmissionService(prisma, readiness),
    },
    RunnerAttemptPromptResolverService,
    {
      provide: RunnerAttemptRuntimeControlService,
      inject: [RunnerCommandQueue, AttemptTokenRegistry],
      useFactory: (commands: RunnerCommandQueue, tokens: AttemptTokenRegistry) =>
        new RunnerAttemptRuntimeControlService({ commands, tokens }),
    },
    { provide: ATTEMPT_RUNTIME_CONTROL_PORT, useExisting: RunnerAttemptRuntimeControlService },
    {
      provide: AgentAttemptReconciler,
      inject: [PrismaAgentWorkTransaction, AgentAttemptAdmissionService],
      useFactory: (work: PrismaAgentWorkTransaction, admissions: AgentAttemptAdmissionService) =>
        new AgentAttemptReconciler(work, admissions, currentWorkRuntimeIdentity()),
    },
    {
      provide: AgentApiStartupReconciler,
      inject: [AgentAttemptReconciler],
      useFactory: (attempts: AgentAttemptReconciler) => new AgentApiStartupReconciler(attempts),
    },
    {
      provide: AgentLiveMessageService,
      inject: [RunnerAttemptRuntimeControlService, PrismaAgentWorkRepository],
      useFactory: (controls: RunnerAttemptRuntimeControlService, work: PrismaAgentWorkRepository) =>
        new AgentLiveMessageService({
          deliver: async (input) => controls.send({ attemptId: input.attemptId, message: input.content }),
        }, work),
    },
    {
      provide: RunnerEventHandlerService,
      inject: [RunnerLeaseRegistry, RunnerCommandQueue, AttemptTokenRegistry, PrismaAgentWorkTransaction, AgentAttemptAdmissionService, AttemptFutureOutputChannel],
      useFactory: (
        leases: RunnerLeaseRegistry,
        commands: RunnerCommandQueue,
        tokens: AttemptTokenRegistry,
        work: PrismaAgentWorkTransaction,
        admissions: AgentAttemptAdmissionService,
        output: AttemptFutureOutputChannel,
      ) => new RunnerEventHandlerService({
        leases,
        commands,
        tokens,
        work,
        capacity: admissions,
        output,
      }),
    },
    {
      provide: HostRunnerAttemptExecutorService,
      inject: [AgentAttemptRuntimeAdmissionService, RunnerAttemptPromptResolverService, AttemptTokenRegistry, RunnerCommandQueue, RunnerLeaseRegistry],
      useFactory: (
        admission: AgentAttemptRuntimeAdmissionService,
        prompts: RunnerAttemptPromptResolverService,
        tokens: AttemptTokenRegistry,
        commands: RunnerCommandQueue,
        leases: RunnerLeaseRegistry,
      ) => new HostRunnerAttemptExecutorService({
        admission,
        prompts,
        tokens,
        commands,
        leases,
        loopbackOrigin: hostRunnerLoopbackOrigin(),
      }),
    },
    { provide: LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT, useExisting: HostRunnerAttemptExecutorService },
    {
      provide: AgentAttemptLaunchService,
      inject: [LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT, PrismaAgentWorkTransaction, AgentAttemptAdmissionService, AttemptFutureOutputChannel],
      useFactory: (
        execution: LiveAttemptExecutionCapabilityPort,
        work: PrismaAgentWorkTransaction,
        admissions: AgentAttemptAdmissionService,
        output: AttemptFutureOutputChannel,
      ) => new AgentAttemptLaunchService(execution, work, admissions, output),
    },
    { provide: AGENT_ATTEMPT_LAUNCH_CAPABILITY_PORT, useExisting: AgentAttemptLaunchService },
    {
      provide: AgentDelegatedAttemptStarterService,
      inject: [AGENT_ATTEMPT_LAUNCH_CAPABILITY_PORT],
      useFactory: (launch: AgentAttemptLaunchCapabilityPort) => new AgentDelegatedAttemptStarterService(launch),
    },
    {
      provide: ATTEMPT_MCP_ACTIONS_PORT,
      inject: [AgentCapabilityInvocationService, AgentTaskDelegationService, PrismaAgentWorkRepository, ATTEMPT_RUNTIME_CONTROL_PORT, AgentDelegatedAttemptStarterService, AgentCapabilityRegistry],
      useFactory: (
        invocations: AgentCapabilityInvocationService,
        delegation: AgentTaskDelegationService,
        work: PrismaAgentWorkRepository,
        controls: AttemptRuntimeControlPort,
        starter: AgentDelegatedAttemptStarterService,
        capabilities: AgentCapabilityRegistry,
      ): AttemptMcpActionsPort => new AttemptMcpActionsService(invocations, delegation, work, controls, starter, capabilities),
    },
  ],
  exports: [
    ATTEMPT_MCP_ACTIONS_PORT,
    ATTEMPT_RUNTIME_CONTROL_PORT,
    AttemptFutureOutputChannel,
    AttemptTokenRegistry,
    AgentApiStartupReconciler,
    AgentAttemptReconciler,
    AgentLiveMessageService,
    AgentAttemptLaunchService,
    AGENT_ATTEMPT_LAUNCH_CAPABILITY_PORT,
    HostRunnerAttemptExecutorService,
    LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT,
    LIVE_ATTEMPT_FUTURE_OUTPUT_CAPABILITY_PORT,
    RunnerCommandQueue,
    RunnerEventHandlerService,
    RunnerInstallationTokenService,
    RunnerLeaseRegistry,
    RunnerReadinessService,
  ],
})
export class AgentRuntimeApplicationModule {}

function currentWorkRuntimeIdentity() {
  const applicationVersion = process.env.KIDITEM_APPLICATION_VERSION?.trim();
  const gitSha = process.env.KIDITEM_GIT_SHA?.trim();
  if (!applicationVersion || !gitSha) throw new Error('missing_required_work_runtime_identity');
  return { applicationVersion, gitSha };
}

function hostRunnerLoopbackOrigin(): string {
  return 'http://127.0.0.1:4000';
}
