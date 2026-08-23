import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { ChannelsModule } from './channels/channels.module';
import { ChannelsFinalCapabilityModule } from './channels/channels-final-capability.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SourcingModule } from './sourcing/sourcing.module';
import { SupplyAgentRuntimeModule } from './supply/supply-agent-runtime.module';
import { OperationsModule } from './operations/operations.module';
import { OPERATION_RUNNER_PORT, type OperationRunnerPort } from './operations/application/port/in/operation-runner.port';
import { AgentOsSessionModule } from './agent-os/agent-os-session.module';
import { AgentOsCapabilityModule } from './agent-os/agent-os-capability.module';
import { PrismaService } from './prisma/prisma.service';
import { PrismaAgentWorkTransaction } from './agent-os/adapter/out/transaction/work/prisma-agent-work.transaction';
import { PrismaAgentWorkRepository } from './agent-os/adapter/out/repository/work/prisma-agent-work.repository';
import { AgentAttemptCapacityService } from './agent-os/application/service/work/agent-attempt-capacity.service';
import { AgentAttemptAdmissionService } from './agent-os/application/service/work/agent-attempt-admission.service';
import { AgentCapabilityInvocationService } from './agent-os/application/service/work/agent-capability-invocation.service';
import { AgentTaskDelegationService } from './agent-os/application/service/work/agent-task-delegation.service';
import { AgentTaskLifecycleService } from './agent-os/application/service/work/agent-task-lifecycle.service';
import { AgentCapabilityApprovalService } from './agent-os/application/service/work/agent-capability-approval.service';
import { AgentSessionTerminalDeleteService } from './agent-os/application/service/work/agent-session-terminal-delete.service';
import { AgentWorkProjectionService } from './agent-os/application/service/work/agent-work-projection.service';
import { AgentWorkQueryService } from './agent-os/application/service/work/agent-work-query.service';
import { AGENT_WORK_QUERY_PORT } from './agent-os/application/port/in/work/agent-work-query.port';
import { AGENT_WORK_COMMAND_PORT } from './agent-os/application/port/in/work/agent-work-command.port';
import { AgentWorkCommandService } from './agent-os/application/service/work/agent-work-command.service';
import { AgentVersionPublisher } from './agent-os/application/service/work/agent-work-version-publisher.service';
import { AgentVersionPublicationBootstrap } from './agent-os/application/service/work/agent-version-publication-bootstrap.service';
import { AgentCapabilityRegistry } from './agent-os/application/service/agent-capability-registry.service';
import { FinalCapabilityCatalogRegistrar } from './agent-os/application/service/final-capability-catalog-registrar.service';
import { SOURCING_CAPABILITY_ADMISSION_PORT, type SourcingCapabilityAdmissionPort } from './sourcing/application/port/in/capability/sourcing-capability-admission.port';
import { AGENT_WORK_REPOSITORY_PORT } from './agent-os/application/port/out/work/agent-work-repository.port';
import { AGENT_WORK_QUERY_REPOSITORY_PORT } from './agent-os/application/port/out/work/agent-work-query-repository.port';

/** Capability composition shared by API and worker roots. */
@Module({
  imports: [EventEmitterModule.forRoot(), PrismaModule, ProductsModule, ChannelsModule, ChannelsFinalCapabilityModule, AnalyticsModule, SourcingModule, AgentOsSessionModule, AgentOsCapabilityModule, SupplyAgentRuntimeModule, OperationsModule],
  providers: [
    FinalCapabilityCatalogRegistrar,
    { provide: PrismaAgentWorkTransaction, inject: [PrismaService, OPERATION_RUNNER_PORT], useFactory: (prisma: PrismaService, operations: OperationRunnerPort) => new PrismaAgentWorkTransaction(prisma, operations) },
    { provide: PrismaAgentWorkRepository, inject: [PrismaService], useFactory: (prisma: PrismaService) => new PrismaAgentWorkRepository(prisma) },
    { provide: AgentVersionPublisher, inject: [PrismaService], useFactory: (prisma: PrismaService) => new AgentVersionPublisher(prisma) },
    { provide: AgentVersionPublicationBootstrap, inject: [AgentVersionPublisher], useFactory: (publisher: AgentVersionPublisher) => new AgentVersionPublicationBootstrap(publisher) },
    { provide: AGENT_WORK_REPOSITORY_PORT, useExisting: PrismaAgentWorkRepository },
    { provide: AGENT_WORK_QUERY_REPOSITORY_PORT, useExisting: PrismaAgentWorkRepository },
    AgentAttemptCapacityService,
    { provide: AgentAttemptAdmissionService, inject: [AgentAttemptCapacityService, PrismaAgentWorkTransaction], useFactory: (capacity: AgentAttemptCapacityService, work: PrismaAgentWorkTransaction) => new AgentAttemptAdmissionService(capacity, work) },
    { provide: AgentCapabilityInvocationService, inject: [PrismaAgentWorkTransaction, AgentCapabilityRegistry, SOURCING_CAPABILITY_ADMISSION_PORT], useFactory: (work: PrismaAgentWorkTransaction, capabilities: AgentCapabilityRegistry, sourcing: SourcingCapabilityAdmissionPort) => new AgentCapabilityInvocationService(work, capabilities, undefined, sourcing) },
    { provide: AgentTaskDelegationService, inject: [PrismaAgentWorkRepository, AgentAttemptAdmissionService], useFactory: (repository: PrismaAgentWorkRepository, admissions: AgentAttemptAdmissionService) => new AgentTaskDelegationService(repository, admissions) },
    { provide: AgentTaskLifecycleService, inject: [PrismaAgentWorkTransaction], useFactory: (work: PrismaAgentWorkTransaction) => new AgentTaskLifecycleService(work) },
    { provide: AgentCapabilityApprovalService, inject: [PrismaAgentWorkTransaction], useFactory: (work: PrismaAgentWorkTransaction) => new AgentCapabilityApprovalService(work) },
    { provide: AgentSessionTerminalDeleteService, inject: [PrismaAgentWorkTransaction], useFactory: (work: PrismaAgentWorkTransaction) => new AgentSessionTerminalDeleteService(work) },
    AgentWorkProjectionService,
    AgentWorkQueryService,
    AgentWorkCommandService,
    { provide: AGENT_WORK_QUERY_PORT, useExisting: AgentWorkQueryService },
    { provide: AGENT_WORK_COMMAND_PORT, useExisting: AgentWorkCommandService },
  ],
  exports: [PrismaAgentWorkTransaction, PrismaAgentWorkRepository, AgentAttemptCapacityService, AgentAttemptAdmissionService, AgentCapabilityInvocationService, AgentTaskDelegationService, AgentTaskLifecycleService, AgentCapabilityApprovalService, AgentSessionTerminalDeleteService, AgentWorkProjectionService, AGENT_WORK_QUERY_PORT, AGENT_WORK_COMMAND_PORT, AgentOsCapabilityModule],
})
export class AgentWorkCapabilityApplicationModule {}
