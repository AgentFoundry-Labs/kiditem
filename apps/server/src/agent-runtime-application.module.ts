import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AgentOsCapabilityModule } from './agent-os/agent-os-capability.module';
import { AgentOsSessionModule } from './agent-os/agent-os-session.module';
import { AGENT_OS_MCP_TOOL_EXECUTION_PORT } from './agent-os/application/port/in/capability/agent-os-mcp-tool-execution.port';
import { AgentOsMcpToolExecutor } from './agent-os/application/service/agent-os-mcp-tool-executor.service';
import { SourcingAgentReadCapabilityModule } from './sourcing/sourcing-agent-read-capability.module';
import { SourcingAgentListingCapabilityModule } from './sourcing/sourcing-agent-listing-capability.module';
import { SupplyAgentRuntimeModule } from './supply/supply-agent-runtime.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { AgentAttemptProcessRegistry } from './agent-os/adapter/out/runtime/attempt/agent-attempt-process-registry';
import { AttemptFilesystemService } from './agent-os/adapter/out/runtime/attempt/attempt-filesystem.service';
import { AttemptLiveControlRegistry } from './agent-os/adapter/out/runtime/attempt/attempt-live-control.registry';
import { AgentAttemptExecutorService } from './agent-os/adapter/out/runtime/attempt/agent-attempt-executor.service';
import { AgentAttemptRuntimeAdmissionService } from './agent-os/adapter/out/runtime/attempt/agent-attempt-runtime-admission.service';
import { AttemptMcpBrokerService } from './agent-os/adapter/in/mcp/attempt-mcp-broker.service';
import { AttemptMcpBrokerActionsService } from './agent-os/adapter/in/mcp/attempt-mcp-broker-actions.service';
import { PrismaAgentWorkTransaction } from './agent-os/adapter/out/transaction/work/prisma-agent-work.transaction';
import { PrismaAgentWorkRepository } from './agent-os/adapter/out/repository/work/prisma-agent-work.repository';
import { AgentAttemptCapacityService } from './agent-os/application/service/work/agent-attempt-capacity.service';
import { AgentAttemptAdmissionService } from './agent-os/application/service/work/agent-attempt-admission.service';
import { AgentCapabilityInvocationService } from './agent-os/application/service/work/agent-capability-invocation.service';
import { AgentTaskDelegationService } from './agent-os/application/service/work/agent-task-delegation.service';
import { AgentLiveMessageService } from './agent-os/application/service/work/agent-live-message.service';
import { AgentCapabilityRegistry } from './agent-os/application/service/agent-capability-registry.service';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    PrismaModule,
    AgentOsSessionModule,
    AgentOsCapabilityModule,
    SourcingAgentReadCapabilityModule,
    SourcingAgentListingCapabilityModule,
    SupplyAgentRuntimeModule,
  ],
  providers: [
    AgentOsMcpToolExecutor,
    AgentAttemptProcessRegistry,
    {
      provide: AgentAttemptRuntimeAdmissionService,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new AgentAttemptRuntimeAdmissionService(prisma),
    },
    AttemptFilesystemService,
    AttemptLiveControlRegistry,
    {
      provide: PrismaAgentWorkTransaction,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaAgentWorkTransaction(prisma),
    },
    {
      provide: PrismaAgentWorkRepository,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaAgentWorkRepository(prisma),
    },
    AgentAttemptCapacityService,
    {
      provide: AgentAttemptAdmissionService,
      inject: [AgentAttemptCapacityService, PrismaAgentWorkTransaction],
      useFactory: (capacity: AgentAttemptCapacityService, transactions: PrismaAgentWorkTransaction) => new AgentAttemptAdmissionService(capacity, transactions),
    },
    {
      provide: AgentCapabilityInvocationService,
      inject: [PrismaAgentWorkTransaction, AgentCapabilityRegistry],
      useFactory: (transactions: PrismaAgentWorkTransaction, capabilities: AgentCapabilityRegistry) => new AgentCapabilityInvocationService(transactions, capabilities),
    },
    {
      provide: AgentTaskDelegationService,
      inject: [PrismaAgentWorkRepository, AgentAttemptAdmissionService],
      useFactory: (repository: PrismaAgentWorkRepository, admissions: AgentAttemptAdmissionService) => new AgentTaskDelegationService(repository, admissions),
    },
    {
      provide: AgentLiveMessageService,
      inject: [AttemptLiveControlRegistry, PrismaAgentWorkRepository],
      useFactory: (controls: AttemptLiveControlRegistry, repository: PrismaAgentWorkRepository) => new AgentLiveMessageService({ deliver: async (input) => controls.get(input.attemptId)?.send(input.content) }, repository),
    },
    AttemptMcpBrokerActionsService,
    {
      provide: AttemptMcpBrokerService,
      inject: [AttemptMcpBrokerActionsService],
      useFactory: (actions: AttemptMcpBrokerActionsService) => new AttemptMcpBrokerService(actions),
    },
    {
      provide: AgentAttemptExecutorService,
      inject: [AttemptFilesystemService, AgentAttemptProcessRegistry, AttemptLiveControlRegistry, AttemptMcpBrokerService, AgentAttemptRuntimeAdmissionService],
      useFactory: (files: AttemptFilesystemService, processes: AgentAttemptProcessRegistry, controls: AttemptLiveControlRegistry, broker: AttemptMcpBrokerService, admission: AgentAttemptRuntimeAdmissionService) => new AgentAttemptExecutorService(files, processes, controls, broker, undefined, undefined, admission),
    },
    {
      provide: AGENT_OS_MCP_TOOL_EXECUTION_PORT,
      useExisting: AgentOsMcpToolExecutor,
    },
  ],
  exports: [AGENT_OS_MCP_TOOL_EXECUTION_PORT, AgentAttemptExecutorService, AttemptMcpBrokerService],
})
export class AgentRuntimeApplicationModule {}
