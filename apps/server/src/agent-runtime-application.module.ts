import { Module } from '@nestjs/common';
import { AgentWorkCapabilityApplicationModule } from './agent-work-capability-application.module';
import { AgentAttemptProcessRegistry } from './agent-os/adapter/out/runtime/attempt/agent-attempt-process-registry';
import { AttemptFilesystemService } from './agent-os/adapter/out/runtime/attempt/attempt-filesystem.service';
import { AttemptLiveControlRegistry } from './agent-os/adapter/out/runtime/attempt/attempt-live-control.registry';
import { AgentAttemptExecutorService } from './agent-os/adapter/out/runtime/attempt/agent-attempt-executor.service';
import { AgentAttemptRuntimeAdmissionService } from './agent-os/adapter/out/runtime/attempt/agent-attempt-runtime-admission.service';
import { AttemptMcpBrokerService } from './agent-os/adapter/in/mcp/attempt-mcp-broker.service';
import { AgentAttemptReconciler } from './agent-os/application/service/work/agent-attempt-reconciler.service';
import { AgentRuntimeDirectoryReconciler } from './agent-os/application/service/work/agent-runtime-directory-reconciler.service';
import { AgentLiveMessageService } from './agent-os/application/service/work/agent-live-message.service';
import { AttemptMcpActionsService } from './agent-os/application/service/work/attempt-mcp-actions.service';
import { ATTEMPT_MCP_ACTIONS_PORT, type AttemptMcpActionsPort } from './agent-os/application/port/in/mcp/attempt-mcp-actions.port';
import { ATTEMPT_RUNTIME_CONTROL_PORT, type AttemptRuntimeControlPort } from './agent-os/application/port/out/runtime/attempt-runtime-control.port';
import { AGENT_OS_MCP_TOOL_EXECUTION_PORT } from './agent-os/application/port/in/capability/agent-os-mcp-tool-execution.port';
import { AgentOsMcpToolExecutor } from './agent-os/application/service/agent-os-mcp-tool-executor.service';
import { AgentCapabilityInvocationService } from './agent-os/application/service/work/agent-capability-invocation.service';
import { AgentTaskDelegationService } from './agent-os/application/service/work/agent-task-delegation.service';
import { PrismaAgentWorkRepository } from './agent-os/adapter/out/repository/work/prisma-agent-work.repository';
import { AgentAttemptAdmissionService } from './agent-os/application/service/work/agent-attempt-admission.service';
import { PrismaAgentWorkTransaction } from './agent-os/adapter/out/transaction/work/prisma-agent-work.transaction';
import { PrismaService } from './prisma/prisma.service';
import { AgentOsSessionModule } from './agent-os/agent-os-session.module';

/** API-only local CLI/MCP execution and transient same-process recovery. */
@Module({
  imports: [AgentWorkCapabilityApplicationModule, AgentOsSessionModule],
  providers: [
    AgentOsMcpToolExecutor, AgentAttemptProcessRegistry, AttemptFilesystemService, AttemptLiveControlRegistry,
    { provide: ATTEMPT_RUNTIME_CONTROL_PORT, useExisting: AttemptLiveControlRegistry },
    { provide: AgentAttemptRuntimeAdmissionService, inject: [PrismaService], useFactory: (prisma: PrismaService) => new AgentAttemptRuntimeAdmissionService(prisma) },
    { provide: AgentRuntimeDirectoryReconciler, inject: [AttemptFilesystemService], useFactory: (files: AttemptFilesystemService) => new AgentRuntimeDirectoryReconciler({ cleanAttempt: (attemptId) => files.cleanAttempt(attemptId) }) },
    { provide: AgentAttemptReconciler, inject: [PrismaAgentWorkTransaction, AgentAttemptAdmissionService, AgentAttemptProcessRegistry, AgentRuntimeDirectoryReconciler], useFactory: (work: PrismaAgentWorkTransaction, admissions: AgentAttemptAdmissionService, processes: AgentAttemptProcessRegistry, directories: AgentRuntimeDirectoryReconciler) => new AgentAttemptReconciler(work, admissions, processes, directories, currentWorkRuntimeIdentity()) },
    { provide: AgentLiveMessageService, inject: [AttemptLiveControlRegistry, PrismaAgentWorkRepository], useFactory: (controls: AttemptLiveControlRegistry, work: PrismaAgentWorkRepository) => new AgentLiveMessageService({ deliver: async (input) => controls.get(input.attemptId)?.send(input.content) }, work) },
    { provide: ATTEMPT_MCP_ACTIONS_PORT, inject: [AgentCapabilityInvocationService, AgentTaskDelegationService, PrismaAgentWorkRepository, ATTEMPT_RUNTIME_CONTROL_PORT], useFactory: (invocations: AgentCapabilityInvocationService, delegation: AgentTaskDelegationService, work: PrismaAgentWorkRepository, controls: AttemptRuntimeControlPort) => new AttemptMcpActionsService(invocations, delegation, work, controls) },
    { provide: AttemptMcpBrokerService, inject: [ATTEMPT_MCP_ACTIONS_PORT], useFactory: (actions: AttemptMcpActionsPort) => new AttemptMcpBrokerService(actions) },
    { provide: AgentAttemptExecutorService, inject: [AttemptFilesystemService, AgentAttemptProcessRegistry, AttemptLiveControlRegistry, AttemptMcpBrokerService, AgentAttemptRuntimeAdmissionService], useFactory: (files: AttemptFilesystemService, processes: AgentAttemptProcessRegistry, controls: AttemptLiveControlRegistry, broker: AttemptMcpBrokerService, admission: AgentAttemptRuntimeAdmissionService) => new AgentAttemptExecutorService(files, processes, controls, broker, undefined, undefined, admission) },
    { provide: AGENT_OS_MCP_TOOL_EXECUTION_PORT, useExisting: AgentOsMcpToolExecutor },
  ],
  exports: [AGENT_OS_MCP_TOOL_EXECUTION_PORT, AgentAttemptExecutorService, AttemptMcpBrokerService, AgentAttemptReconciler],
})
export class AgentRuntimeApplicationModule {}

function currentWorkRuntimeIdentity() {
  return { applicationVersion: process.env.KIDITEM_APPLICATION_VERSION ?? '0.1.30', gitSha: process.env.KIDITEM_GIT_SHA ?? process.env.GIT_SHA ?? 'unknown' };
}
