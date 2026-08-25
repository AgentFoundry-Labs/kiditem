import { Module } from '@nestjs/common';
import { AgentWorkCapabilityApplicationModule } from './agent-work-capability-application.module';
import { PrismaAgentWorkRepository } from './agent-os/adapter/out/repository/work/prisma-agent-work.repository';
import { AttemptFutureOutputChannel } from './agent-os/adapter/out/runtime/attempt/attempt-future-output-channel';
import { AgentAttemptRuntimeAdmissionService } from './agent-os/adapter/out/runtime/attempt/agent-attempt-runtime-admission.service';
import { AttemptTokenRegistry } from './agent-os/adapter/out/runtime/runner/attempt-token.registry';
import { HostRunnerAttemptControlAdapter } from './agent-os/adapter/out/runtime/runner/host-runner-attempt-control.adapter';
import { HostRunnerAttemptExecutorService } from './agent-os/adapter/out/runtime/runner/host-runner-attempt-executor.service';
import {
  HOST_RUNNER_CONTROL_ATTEMPT_PORT,
  HOST_RUNNER_CONTROL_HTTP_PORT,
  HOST_RUNNER_CONTROL_READINESS_PORT,
  HOST_RUNNER_CONTROL_SESSION,
  HostRunnerControlSession,
  type HostRunnerControlAttemptPort,
  type HostRunnerControlHttpPort,
  type HostRunnerControlReadinessPort,
  type HostRunnerControlSessionPort,
} from './agent-os/adapter/out/runtime/runner/host-runner-control-session.module';
import { RunnerAttemptPromptResolverService } from './agent-os/adapter/out/runtime/runner/runner-attempt-prompt-resolver.service';
import { RunnerInstallationTokenService } from './agent-os/adapter/out/runtime/runner/runner-installation-token.service';
import {
  AGENT_ATTEMPT_LAUNCH_CAPABILITY_PORT,
  type AgentAttemptLaunchCapabilityPort,
} from './agent-os/application/port/in/capability/agent-attempt-launch.capability.port';
import {
  LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT,
  type LiveAttemptExecutionCapabilityPort,
} from './agent-os/application/port/in/capability/live-attempt-execution.capability.port';
import {
  LIVE_ATTEMPT_FUTURE_OUTPUT_CAPABILITY_PORT,
  type LiveAttemptFutureOutputCapabilityPort,
} from './agent-os/application/port/in/capability/live-attempt-future-output.capability.port';
import {
  ATTEMPT_MCP_ACTIONS_PORT,
  type AttemptMcpActionsPort,
} from './agent-os/application/port/in/mcp/attempt-mcp-actions.port';
import {
  AGENT_WORK_COMMAND_PORT,
  type AgentWorkCommandPort,
} from './agent-os/application/port/in/work/agent-work-command.port';
import {
  AGENT_WORK_INTAKE_PORT,
  type AgentWorkIntakePort,
} from './agent-os/application/port/in/work/agent-work-intake.port';
import {
  AGENT_WORK_QUERY_PORT,
  type AgentWorkQueryPort,
} from './agent-os/application/port/in/work/agent-work-query.port';
import {
  ATTEMPT_RUNTIME_CONTROL_PORT,
  type AttemptRuntimeControlPort,
} from './agent-os/application/port/out/runtime/attempt-runtime-control.port';
import {
  AGENT_WORK_ADMISSION_PORT,
  type AgentWorkAdmissionPort,
} from './agent-os/application/port/out/work/agent-work-admission.port';
import {
  AGENT_WORK_LIFECYCLE_PORT,
  type AgentWorkLifecyclePort,
} from './agent-os/application/port/out/work/agent-work-lifecycle.port';
import { AgentCapabilityRegistry } from './agent-os/application/service/agent-capability-registry.service';
import { AgentCapabilityApprovalService } from './agent-os/application/service/work/agent-capability-approval.service';
import { AgentCapabilityInvocationService } from './agent-os/application/service/work/agent-capability-invocation.service';
import { AgentApiStartupReconciler } from './agent-os/application/service/work/agent-api-startup-reconciler.service';
import { AgentAttemptAdmissionService } from './agent-os/application/service/work/agent-attempt-admission.service';
import { AgentAttemptCapacityService } from './agent-os/application/service/work/agent-attempt-capacity.service';
import { AgentAttemptLaunchService } from './agent-os/application/service/work/agent-attempt-launch.service';
import { AgentAttemptReconciler } from './agent-os/application/service/work/agent-attempt-reconciler.service';
import { AgentDelegatedAttemptStarterService } from './agent-os/application/service/work/agent-delegated-attempt-starter.service';
import { AgentLiveMessageService } from './agent-os/application/service/work/agent-live-message.service';
import { AgentSessionTerminalDeleteService } from './agent-os/application/service/work/agent-session-terminal-delete.service';
import { AgentTaskDelegationService } from './agent-os/application/service/work/agent-task-delegation.service';
import { AgentTaskLifecycleService } from './agent-os/application/service/work/agent-task-lifecycle.service';
import { AttemptMcpActionsService } from './agent-os/application/service/work/attempt-mcp-actions.service';
import { AgentWorkCommandService } from './agent-os/application/service/work/agent-work-command.service';
import { createAgentWorkIntake } from './agent-os/application/service/work/agent-work-intake.module';
import { PrismaService } from './prisma/prisma.service';

/**
 * API-owned durable admission plus one process-memory Host Runner control
 * Module. HTTP, MCP, launch, and live-message Adapters receive only narrow
 * views of that shared control session.
 */
@Module({
  imports: [AgentWorkCapabilityApplicationModule],
  providers: [
    AttemptFutureOutputChannel,
    { provide: LIVE_ATTEMPT_FUTURE_OUTPUT_CAPABILITY_PORT, useExisting: AttemptFutureOutputChannel },
    { provide: RunnerInstallationTokenService, useFactory: () => new RunnerInstallationTokenService() },
    AttemptTokenRegistry,
    AgentAttemptCapacityService,
    {
      provide: AgentAttemptReconciler,
      inject: [AGENT_WORK_LIFECYCLE_PORT, AgentAttemptCapacityService],
      useFactory: (work: AgentWorkLifecyclePort, capacity: AgentAttemptCapacityService) =>
        new AgentAttemptReconciler(work, capacity, currentWorkRuntimeIdentity()),
    },
    {
      provide: HOST_RUNNER_CONTROL_SESSION,
      inject: [
        AttemptTokenRegistry,
        AGENT_WORK_LIFECYCLE_PORT,
        AgentAttemptCapacityService,
        AttemptFutureOutputChannel,
        AgentAttemptReconciler,
      ],
      useFactory: (
        tokens: AttemptTokenRegistry,
        work: AgentWorkLifecyclePort,
        capacity: AgentAttemptCapacityService,
        output: AttemptFutureOutputChannel,
        reconciler: AgentAttemptReconciler,
      ): HostRunnerControlSessionPort => new HostRunnerControlSession({
        tokens,
        work,
        capacity,
        output,
        reconciler,
        loopbackOrigin: hostRunnerLoopbackOrigin(),
      }),
    },
    {
      provide: HOST_RUNNER_CONTROL_HTTP_PORT,
      inject: [HOST_RUNNER_CONTROL_SESSION],
      useFactory: (session: HostRunnerControlSessionPort): HostRunnerControlHttpPort => session.http,
    },
    {
      provide: HOST_RUNNER_CONTROL_ATTEMPT_PORT,
      inject: [HOST_RUNNER_CONTROL_SESSION],
      useFactory: (session: HostRunnerControlSessionPort): HostRunnerControlAttemptPort => session.attempts,
    },
    {
      provide: HOST_RUNNER_CONTROL_READINESS_PORT,
      inject: [HOST_RUNNER_CONTROL_SESSION],
      useFactory: (session: HostRunnerControlSessionPort): HostRunnerControlReadinessPort => session.readiness,
    },
    {
      provide: AgentAttemptRuntimeAdmissionService,
      inject: [PrismaService, HOST_RUNNER_CONTROL_READINESS_PORT],
      useFactory: (prisma: PrismaService, readiness: HostRunnerControlReadinessPort) =>
        new AgentAttemptRuntimeAdmissionService(prisma, readiness),
    },
    {
      provide: AgentAttemptAdmissionService,
      inject: [
        AgentAttemptCapacityService,
        AGENT_WORK_ADMISSION_PORT,
        AgentAttemptRuntimeAdmissionService,
      ],
      useFactory: (
        capacity: AgentAttemptCapacityService,
        work: AgentWorkAdmissionPort,
        readiness: AgentAttemptRuntimeAdmissionService,
      ) => new AgentAttemptAdmissionService(capacity, work, readiness),
    },
    {
      provide: AgentTaskDelegationService,
      inject: [PrismaAgentWorkRepository, AgentAttemptAdmissionService],
      useFactory: (
        repository: PrismaAgentWorkRepository,
        admissions: AgentAttemptAdmissionService,
      ) => new AgentTaskDelegationService(repository, admissions),
    },
    {
      provide: AgentWorkCommandService,
      inject: [
        AgentAttemptAdmissionService,
        AgentCapabilityApprovalService,
        AgentTaskLifecycleService,
        AgentSessionTerminalDeleteService,
      ],
      useFactory: (
        admissions: AgentAttemptAdmissionService,
        approvals: AgentCapabilityApprovalService,
        tasks: AgentTaskLifecycleService,
        deletion: AgentSessionTerminalDeleteService,
      ) => new AgentWorkCommandService(admissions, approvals, tasks, deletion),
    },
    { provide: AGENT_WORK_COMMAND_PORT, useExisting: AgentWorkCommandService },
    RunnerAttemptPromptResolverService,
    {
      provide: HostRunnerAttemptControlAdapter,
      inject: [HOST_RUNNER_CONTROL_ATTEMPT_PORT],
      useFactory: (control: HostRunnerControlAttemptPort) =>
        new HostRunnerAttemptControlAdapter({ control }),
    },
    { provide: ATTEMPT_RUNTIME_CONTROL_PORT, useExisting: HostRunnerAttemptControlAdapter },
    {
      provide: AgentApiStartupReconciler,
      inject: [AgentAttemptReconciler],
      useFactory: (attempts: AgentAttemptReconciler) => new AgentApiStartupReconciler(attempts),
    },
    {
      provide: AgentLiveMessageService,
      inject: [ATTEMPT_RUNTIME_CONTROL_PORT, PrismaAgentWorkRepository],
      useFactory: (controls: AttemptRuntimeControlPort, work: PrismaAgentWorkRepository) =>
        new AgentLiveMessageService({
          deliver: async (input) => controls.send({
            attemptId: input.attemptId,
            turnId: input.turnId,
            message: input.content,
          }),
        }, work),
    },
    {
      provide: HostRunnerAttemptExecutorService,
      inject: [
        AgentAttemptRuntimeAdmissionService,
        RunnerAttemptPromptResolverService,
        HOST_RUNNER_CONTROL_ATTEMPT_PORT,
      ],
      useFactory: (
        admission: AgentAttemptRuntimeAdmissionService,
        prompts: RunnerAttemptPromptResolverService,
        control: HostRunnerControlAttemptPort,
      ) => new HostRunnerAttemptExecutorService({
        admission,
        prompts,
        control,
        loopbackOrigin: hostRunnerLoopbackOrigin(),
      }),
    },
    { provide: LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT, useExisting: HostRunnerAttemptExecutorService },
    {
      provide: AgentAttemptLaunchService,
      inject: [
        LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT,
        AGENT_WORK_LIFECYCLE_PORT,
        AgentAttemptCapacityService,
        AttemptFutureOutputChannel,
      ],
      useFactory: (
        execution: LiveAttemptExecutionCapabilityPort,
        work: AgentWorkLifecyclePort,
        capacity: AgentAttemptCapacityService,
        output: AttemptFutureOutputChannel,
      ) => new AgentAttemptLaunchService(execution, work, capacity, output),
    },
    { provide: AGENT_ATTEMPT_LAUNCH_CAPABILITY_PORT, useExisting: AgentAttemptLaunchService },
    {
      provide: AGENT_WORK_INTAKE_PORT,
      inject: [
        AGENT_WORK_QUERY_PORT,
        AGENT_WORK_COMMAND_PORT,
        AGENT_ATTEMPT_LAUNCH_CAPABILITY_PORT,
        AgentLiveMessageService,
        LIVE_ATTEMPT_FUTURE_OUTPUT_CAPABILITY_PORT,
      ],
      useFactory: (
        queries: AgentWorkQueryPort,
        commands: AgentWorkCommandPort,
        launch: AgentAttemptLaunchCapabilityPort,
        liveMessages: AgentLiveMessageService,
        futureOutput: LiveAttemptFutureOutputCapabilityPort,
      ): AgentWorkIntakePort => createAgentWorkIntake(queries, commands, launch, liveMessages, futureOutput),
    },
    {
      provide: AgentDelegatedAttemptStarterService,
      inject: [AGENT_ATTEMPT_LAUNCH_CAPABILITY_PORT],
      useFactory: (launch: AgentAttemptLaunchCapabilityPort) => new AgentDelegatedAttemptStarterService(launch),
    },
    {
      provide: ATTEMPT_MCP_ACTIONS_PORT,
      inject: [
        AgentCapabilityInvocationService,
        AgentTaskDelegationService,
        PrismaAgentWorkRepository,
        ATTEMPT_RUNTIME_CONTROL_PORT,
        AgentDelegatedAttemptStarterService,
        AgentCapabilityRegistry,
      ],
      useFactory: (
        invocations: AgentCapabilityInvocationService,
        delegation: AgentTaskDelegationService,
        work: PrismaAgentWorkRepository,
        controls: AttemptRuntimeControlPort,
        starter: AgentDelegatedAttemptStarterService,
        capabilities: AgentCapabilityRegistry,
      ): AttemptMcpActionsPort =>
        new AttemptMcpActionsService(invocations, delegation, work, controls, starter, capabilities),
    },
  ],
  exports: [
    ATTEMPT_MCP_ACTIONS_PORT,
    ATTEMPT_RUNTIME_CONTROL_PORT,
    HOST_RUNNER_CONTROL_HTTP_PORT,
    HOST_RUNNER_CONTROL_ATTEMPT_PORT,
    HOST_RUNNER_CONTROL_READINESS_PORT,
    AttemptFutureOutputChannel,
    AttemptTokenRegistry,
    AgentApiStartupReconciler,
    AgentAttemptReconciler,
    AgentAttemptCapacityService,
    AgentAttemptAdmissionService,
    AgentTaskDelegationService,
    AGENT_WORK_COMMAND_PORT,
    AGENT_WORK_INTAKE_PORT,
    AgentLiveMessageService,
    AgentAttemptLaunchService,
    AGENT_ATTEMPT_LAUNCH_CAPABILITY_PORT,
    HostRunnerAttemptExecutorService,
    LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT,
    LIVE_ATTEMPT_FUTURE_OUTPUT_CAPABILITY_PORT,
    RunnerInstallationTokenService,
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
