import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { ChannelsModule } from './channels/channels.module';
import { ChannelsFinalCapabilityModule } from './channels/channels-final-capability.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SourcingModule } from './sourcing/sourcing.module';
import { SupplyAgentRuntimeModule } from './supply/supply-agent-runtime.module';
import { AgentOsSessionModule } from './agent-os/agent-os-session.module';
import { AgentOsCapabilityModule } from './agent-os/agent-os-capability.module';
import { PrismaService } from './prisma/prisma.service';
import { PrismaAgentWorkTransaction } from './agent-os/adapter/out/transaction/work/prisma-agent-work.transaction';
import { PrismaAgentWorkRepository } from './agent-os/adapter/out/repository/work/prisma-agent-work.repository';
import { AgentAttemptCapacityService } from './agent-os/application/service/work/agent-attempt-capacity.service';
import { AgentAttemptAdmissionService } from './agent-os/application/service/work/agent-attempt-admission.service';
import { AgentCapabilityInvocationService } from './agent-os/application/service/work/agent-capability-invocation.service';
import { AgentTaskDelegationService } from './agent-os/application/service/work/agent-task-delegation.service';
import { AgentCapabilityRegistry } from './agent-os/application/service/agent-capability-registry.service';
import { FinalCapabilityCatalogRegistrar } from './agent-os/application/service/final-capability-catalog-registrar.service';
import { SOURCING_CAPABILITY_ADMISSION_PORT, type SourcingCapabilityAdmissionPort } from './sourcing/application/port/in/capability/sourcing-capability-admission.port';
import { AGENT_WORK_REPOSITORY_PORT } from './agent-os/application/port/out/work/agent-work-repository.port';

/** Capability composition shared by API and worker roots. */
@Module({
  imports: [EventEmitterModule.forRoot(), PrismaModule, ProductsModule, ChannelsModule, ChannelsFinalCapabilityModule, AnalyticsModule, SourcingModule, AgentOsSessionModule, AgentOsCapabilityModule, SupplyAgentRuntimeModule],
  providers: [
    FinalCapabilityCatalogRegistrar,
    { provide: PrismaAgentWorkTransaction, inject: [PrismaService], useFactory: (prisma: PrismaService) => new PrismaAgentWorkTransaction(prisma) },
    { provide: PrismaAgentWorkRepository, inject: [PrismaService], useFactory: (prisma: PrismaService) => new PrismaAgentWorkRepository(prisma) },
    { provide: AGENT_WORK_REPOSITORY_PORT, useExisting: PrismaAgentWorkRepository },
    AgentAttemptCapacityService,
    { provide: AgentAttemptAdmissionService, inject: [AgentAttemptCapacityService, PrismaAgentWorkTransaction], useFactory: (capacity: AgentAttemptCapacityService, work: PrismaAgentWorkTransaction) => new AgentAttemptAdmissionService(capacity, work) },
    { provide: AgentCapabilityInvocationService, inject: [PrismaAgentWorkTransaction, AgentCapabilityRegistry, SOURCING_CAPABILITY_ADMISSION_PORT], useFactory: (work: PrismaAgentWorkTransaction, capabilities: AgentCapabilityRegistry, sourcing: SourcingCapabilityAdmissionPort) => new AgentCapabilityInvocationService(work, capabilities, undefined, sourcing) },
    { provide: AgentTaskDelegationService, inject: [PrismaAgentWorkRepository, AgentAttemptAdmissionService], useFactory: (repository: PrismaAgentWorkRepository, admissions: AgentAttemptAdmissionService) => new AgentTaskDelegationService(repository, admissions) },
  ],
  exports: [PrismaAgentWorkTransaction, PrismaAgentWorkRepository, AgentAttemptCapacityService, AgentAttemptAdmissionService, AgentCapabilityInvocationService, AgentTaskDelegationService, AgentOsCapabilityModule],
})
export class AgentWorkCapabilityApplicationModule {}
