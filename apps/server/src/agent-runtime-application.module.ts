import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AgentOsCapabilityModule } from './agent-os/agent-os-capability.module';
import { AgentOsSessionModule } from './agent-os/agent-os-session.module';
import { AGENT_OS_MCP_TOOL_EXECUTION_PORT } from './agent-os/application/port/in/capability/agent-os-mcp-tool-execution.port';
import { AgentOsMcpToolExecutor } from './agent-os/application/service/agent-os-mcp-tool-executor.service';
import { SupplyAgentRuntimeModule } from './supply/supply-agent-runtime.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { AgentAttemptProcessRegistry } from './agent-os/adapter/out/runtime/attempt/agent-attempt-process-registry';
import { AttemptFilesystemService } from './agent-os/adapter/out/runtime/attempt/attempt-filesystem.service';
import { AttemptLiveControlRegistry } from './agent-os/adapter/out/runtime/attempt/attempt-live-control.registry';
import { AgentAttemptExecutorService } from './agent-os/adapter/out/runtime/attempt/agent-attempt-executor.service';
import { AgentAttemptRuntimeAdmissionService } from './agent-os/adapter/out/runtime/attempt/agent-attempt-runtime-admission.service';
import { AttemptMcpBrokerService } from './agent-os/adapter/in/mcp/attempt-mcp-broker.service';
import { PrismaAgentWorkTransaction } from './agent-os/adapter/out/transaction/work/prisma-agent-work.transaction';
import { PrismaAgentWorkRepository } from './agent-os/adapter/out/repository/work/prisma-agent-work.repository';
import { AgentAttemptCapacityService } from './agent-os/application/service/work/agent-attempt-capacity.service';
import { AgentAttemptAdmissionService } from './agent-os/application/service/work/agent-attempt-admission.service';
import { AgentCapabilityInvocationService } from './agent-os/application/service/work/agent-capability-invocation.service';
import { AgentTaskDelegationService } from './agent-os/application/service/work/agent-task-delegation.service';
import { AgentLiveMessageService } from './agent-os/application/service/work/agent-live-message.service';
import { AgentCapabilityRegistry } from './agent-os/application/service/agent-capability-registry.service';
import {
  FinalCapabilityCatalogRegistrar,
} from './agent-os/application/service/final-capability-catalog-registrar.service';
import { ProductsModule } from './products/products.module';
import { ChannelsModule } from './channels/channels.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SourcingModule } from './sourcing/sourcing.module';
import { ChannelsFinalCapabilityModule } from './channels/channels-final-capability.module';
import { SOURCING_CAPABILITY_ADMISSION_PORT, type SourcingCapabilityAdmissionPort } from './sourcing/application/port/in/capability/sourcing-capability-admission.port';
import { ATTEMPT_MCP_ACTIONS_PORT, type AttemptMcpActionsPort } from './agent-os/application/port/in/mcp/attempt-mcp-actions.port';
import { ATTEMPT_RUNTIME_CONTROL_PORT, type AttemptRuntimeControlPort } from './agent-os/application/port/out/runtime/attempt-runtime-control.port';
import { AGENT_WORK_REPOSITORY_PORT, type AgentWorkRepositoryPort } from './agent-os/application/port/out/work/agent-work-repository.port';
import { AttemptMcpActionsService } from './agent-os/application/service/work/attempt-mcp-actions.service';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    PrismaModule,
    ProductsModule,
    ChannelsModule,
    ChannelsFinalCapabilityModule,
    AnalyticsModule,
    SourcingModule,
    AgentOsSessionModule,
    AgentOsCapabilityModule,
    SupplyAgentRuntimeModule,
  ],
  providers: [
    AgentOsMcpToolExecutor,
    FinalCapabilityCatalogRegistrar,
    AgentAttemptProcessRegistry,
    {
      provide: AgentAttemptRuntimeAdmissionService,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new AgentAttemptRuntimeAdmissionService(prisma),
    },
    AttemptFilesystemService,
    AttemptLiveControlRegistry,
    {
      provide: ATTEMPT_RUNTIME_CONTROL_PORT,
      useExisting: AttemptLiveControlRegistry,
    },
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
    {
      provide: AGENT_WORK_REPOSITORY_PORT,
      useExisting: PrismaAgentWorkRepository,
    },
    AgentAttemptCapacityService,
    {
      provide: AgentAttemptAdmissionService,
      inject: [AgentAttemptCapacityService, PrismaAgentWorkTransaction],
      useFactory: (capacity: AgentAttemptCapacityService, transactions: PrismaAgentWorkTransaction) => new AgentAttemptAdmissionService(capacity, transactions),
    },
    {
      provide: AgentCapabilityInvocationService,
      inject: [PrismaAgentWorkTransaction, AgentCapabilityRegistry, SOURCING_CAPABILITY_ADMISSION_PORT],
      useFactory: (transactions: PrismaAgentWorkTransaction, capabilities: AgentCapabilityRegistry, sourcingAdmission: SourcingCapabilityAdmissionPort) => new AgentCapabilityInvocationService(transactions, capabilities, undefined, sourcingAdmission),
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
    {
      provide: ATTEMPT_MCP_ACTIONS_PORT,
      inject: [AgentCapabilityInvocationService, AgentTaskDelegationService, AGENT_WORK_REPOSITORY_PORT, ATTEMPT_RUNTIME_CONTROL_PORT],
      useFactory: (invocations: AgentCapabilityInvocationService, delegation: AgentTaskDelegationService, work: AgentWorkRepositoryPort, controls: AttemptRuntimeControlPort) =>
        new AttemptMcpActionsService(invocations, delegation, work, controls),
    },
    {
      provide: AttemptMcpBrokerService,
      inject: [ATTEMPT_MCP_ACTIONS_PORT],
      useFactory: (actions: AttemptMcpActionsPort) => new AttemptMcpBrokerService(actions),
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
