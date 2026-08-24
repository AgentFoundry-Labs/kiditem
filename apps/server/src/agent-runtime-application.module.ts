import { Module } from '@nestjs/common';
import { AgentWorkCapabilityApplicationModule } from './agent-work-capability-application.module';
import { AgentAttemptProcessRegistry } from './agent-os/adapter/out/runtime/attempt/agent-attempt-process-registry';
import { AttemptFilesystemService } from './agent-os/adapter/out/runtime/attempt/attempt-filesystem.service';
import { AttemptLiveControlRegistry } from './agent-os/adapter/out/runtime/attempt/attempt-live-control.registry';
import { AgentAttemptExecutorService } from './agent-os/adapter/out/runtime/attempt/agent-attempt-executor.service';
import { AttemptFutureOutputChannel } from './agent-os/adapter/out/runtime/attempt/attempt-future-output-channel';
import { AgentAttemptRuntimeAdmissionService } from './agent-os/adapter/out/runtime/attempt/agent-attempt-runtime-admission.service';
import { AgentAttemptReadinessService } from './agent-os/adapter/out/runtime/attempt/agent-attempt-readiness.service';
import { AttemptMcpBrokerService } from './agent-os/adapter/in/mcp/attempt-mcp-broker.service';
import { AgentAttemptReconciler } from './agent-os/application/service/work/agent-attempt-reconciler.service';
import { AgentApiStartupReconciler } from './agent-os/application/service/work/agent-api-startup-reconciler.service';
import { AgentRuntimeDirectoryReconciler } from './agent-os/application/service/work/agent-runtime-directory-reconciler.service';
import { AgentLiveMessageService } from './agent-os/application/service/work/agent-live-message.service';
import { AttemptMcpActionsService } from './agent-os/application/service/work/attempt-mcp-actions.service';
import { AgentDelegatedAttemptStarterService } from './agent-os/application/service/work/agent-delegated-attempt-starter.service';
import { ATTEMPT_MCP_ACTIONS_PORT, type AttemptMcpActionsPort } from './agent-os/application/port/in/mcp/attempt-mcp-actions.port';
import { LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT } from './agent-os/application/port/in/capability/live-attempt-execution.capability.port';
import { LIVE_ATTEMPT_FUTURE_OUTPUT_CAPABILITY_PORT } from './agent-os/application/port/in/capability/live-attempt-future-output.capability.port';
import { ATTEMPT_RUNTIME_CONTROL_PORT, type AttemptRuntimeControlPort } from './agent-os/application/port/out/runtime/attempt-runtime-control.port';
import { AgentCapabilityInvocationService } from './agent-os/application/service/work/agent-capability-invocation.service';
import { AgentTaskDelegationService } from './agent-os/application/service/work/agent-task-delegation.service';
import { AgentCapabilityRegistry } from './agent-os/application/service/agent-capability-registry.service';
import { PrismaAgentWorkRepository } from './agent-os/adapter/out/repository/work/prisma-agent-work.repository';
import { AgentAttemptAdmissionService } from './agent-os/application/service/work/agent-attempt-admission.service';
import { PrismaAgentWorkTransaction } from './agent-os/adapter/out/transaction/work/prisma-agent-work.transaction';
import { PrismaService } from './prisma/prisma.service';
import { AgentOsSessionModule } from './agent-os/agent-os-session.module';

/** API-only local CLI/MCP execution and transient same-process recovery. */
@Module({
  imports: [AgentWorkCapabilityApplicationModule, AgentOsSessionModule],
  providers: [
    AgentAttemptProcessRegistry, AttemptFilesystemService, AttemptLiveControlRegistry, AttemptFutureOutputChannel,
    { provide: LIVE_ATTEMPT_FUTURE_OUTPUT_CAPABILITY_PORT, useExisting: AttemptFutureOutputChannel },
    { provide: AgentAttemptReadinessService, useFactory: () => new AgentAttemptReadinessService() },
    { provide: ATTEMPT_RUNTIME_CONTROL_PORT, useExisting: AttemptLiveControlRegistry },
    { provide: AgentAttemptRuntimeAdmissionService, inject: [PrismaService, AgentAttemptReadinessService], useFactory: (prisma: PrismaService, readiness: AgentAttemptReadinessService) => new AgentAttemptRuntimeAdmissionService(prisma, readiness) },
    { provide: AgentRuntimeDirectoryReconciler, inject: [AttemptFilesystemService], useFactory: (files: AttemptFilesystemService) => new AgentRuntimeDirectoryReconciler({ cleanAttempt: (attemptId) => files.cleanAttempt(attemptId), reapMarkedProcess: (attemptId) => files.reapMarkedProcess(attemptId) }) },
    { provide: AgentAttemptReconciler, inject: [PrismaAgentWorkTransaction, AgentAttemptAdmissionService, AgentAttemptProcessRegistry, AgentRuntimeDirectoryReconciler], useFactory: (work: PrismaAgentWorkTransaction, admissions: AgentAttemptAdmissionService, processes: AgentAttemptProcessRegistry, directories: AgentRuntimeDirectoryReconciler) => new AgentAttemptReconciler(work, admissions, processes, directories, currentWorkRuntimeIdentity()) },
    { provide: AgentApiStartupReconciler, inject: [AgentAttemptReconciler], useFactory: (attempts: AgentAttemptReconciler) => new AgentApiStartupReconciler(attempts) },
    { provide: AgentLiveMessageService, inject: [AttemptLiveControlRegistry, PrismaAgentWorkRepository], useFactory: (controls: AttemptLiveControlRegistry, work: PrismaAgentWorkRepository) => new AgentLiveMessageService({ deliver: async (input) => controls.get(input.attemptId)?.send(input.content) }, work) },
    AgentDelegatedAttemptStarterService,
    { provide: ATTEMPT_MCP_ACTIONS_PORT, inject: [AgentCapabilityInvocationService, AgentTaskDelegationService, PrismaAgentWorkRepository, ATTEMPT_RUNTIME_CONTROL_PORT, AgentDelegatedAttemptStarterService, AgentCapabilityRegistry], useFactory: (invocations: AgentCapabilityInvocationService, delegation: AgentTaskDelegationService, work: PrismaAgentWorkRepository, controls: AttemptRuntimeControlPort, starter: AgentDelegatedAttemptStarterService, capabilities: AgentCapabilityRegistry) => new AttemptMcpActionsService(invocations, delegation, work, controls, starter, capabilities) },
    { provide: AttemptMcpBrokerService, inject: [ATTEMPT_MCP_ACTIONS_PORT], useFactory: (actions: AttemptMcpActionsPort) => new AttemptMcpBrokerService(actions) },
    { provide: AgentAttemptExecutorService, inject: [AttemptFilesystemService, AgentAttemptProcessRegistry, AttemptLiveControlRegistry, AttemptMcpBrokerService, AgentAttemptRuntimeAdmissionService, PrismaAgentWorkTransaction, AgentAttemptAdmissionService, AttemptFutureOutputChannel], useFactory: (files: AttemptFilesystemService, processes: AgentAttemptProcessRegistry, controls: AttemptLiveControlRegistry, broker: AttemptMcpBrokerService, admission: AgentAttemptRuntimeAdmissionService, work: PrismaAgentWorkTransaction, attempts: AgentAttemptAdmissionService, live: AttemptFutureOutputChannel) => new AgentAttemptExecutorService(files, processes, controls, broker, undefined, undefined, admission, { running: async (attemptId) => { await work.transitionAttempt({ attemptId, from: 'starting', to: 'running', at: new Date() }); }, terminal: async (attemptId, status, error, result) => { const data = { attemptId, to: status, at: new Date(), ...(error ? { error } : {}), ...(result ? { result } : {}) }; const transitioned = await work.transitionAttempt({ ...data, from: 'running' }); if (!transitioned.transitioned) await work.transitionAttempt({ ...data, from: 'starting' }); await work.finalizeTaskFromAttempt({ attemptId, at: new Date() }); live.finish({ attemptId, outcome: status === 'succeeded' ? 'completed' : 'failed', ...(result?.summary ? { summary: result.summary } : {}) }); }, release: (attemptId) => attempts.releaseAttempt(attemptId) }) },
    { provide: LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT, useExisting: AgentAttemptExecutorService },
  ],
  exports: [AgentAttemptExecutorService, AttemptMcpBrokerService, AgentAttemptReconciler, AgentLiveMessageService, AttemptFutureOutputChannel, LIVE_ATTEMPT_EXECUTION_CAPABILITY_PORT, LIVE_ATTEMPT_FUTURE_OUTPUT_CAPABILITY_PORT],
})
export class AgentRuntimeApplicationModule {}

function currentWorkRuntimeIdentity() {
  const applicationVersion = process.env.KIDITEM_APPLICATION_VERSION?.trim();
  const gitSha = process.env.KIDITEM_GIT_SHA?.trim();
  if (!applicationVersion || !gitSha) throw new Error('missing_required_work_runtime_identity');
  return { applicationVersion, gitSha };
}
