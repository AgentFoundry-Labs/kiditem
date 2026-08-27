import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ChannelsFinalCapabilityModule } from '../channels/channels-final-capability.module';
import { ChannelsModule } from '../channels/channels.module';
import { OperationsModule } from '../operations/operations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { SourcingModule } from '../sourcing/sourcing.module';
import {
  SOURCING_CAPABILITY_ADMISSION_PORT,
  type SourcingCapabilityAdmissionPort,
} from '../sourcing/application/port/in/capability/sourcing-capability-admission.port';
import { SupplyAgentRuntimeModule } from '../supply/supply-agent-runtime.module';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaCapabilityInvocationRepository } from './adapter/out/repository/prisma-capability-invocation.repository';
import {
  CAPABILITY_APPROVAL_PORT,
  CAPABILITY_INVOCATION_PORT,
} from './application/port/in/capability/capability-invocation.port';
import {
  CAPABILITY_INVOCATION_REPOSITORY_PORT,
  type CapabilityInvocationRepositoryPort,
} from './application/port/out/capability-invocation.repository.port';
import { AgentCapabilityRegistry } from './application/service/agent-capability-registry.service';
import { CapabilityApprovalService } from './application/service/capability-approval.service';
import { CapabilityInvocationService } from './application/service/capability-invocation.service';
import { CapabilityMutationDispatcher } from './application/service/capability-mutation-dispatcher.service';
import { FinalCapabilityCatalogRegistrar } from './application/service/final-capability-catalog-registrar.service';
import { AgentOsCapabilityModule } from './agent-os-capability.module';

/** Request and bounded API-bootstrap deterministic Invocation composition. No queue or Agent session. */
@Module({
  imports: [
    PrismaModule,
    ProductsModule,
    ChannelsModule,
    ChannelsFinalCapabilityModule,
    AnalyticsModule,
    SourcingModule,
    AgentOsCapabilityModule,
    SupplyAgentRuntimeModule,
    OperationsModule,
  ],
  providers: [
    FinalCapabilityCatalogRegistrar,
    {
      provide: PrismaCapabilityInvocationRepository,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaCapabilityInvocationRepository(prisma),
    },
    {
      provide: CAPABILITY_INVOCATION_REPOSITORY_PORT,
      useExisting: PrismaCapabilityInvocationRepository,
    },
    {
      provide: CapabilityMutationDispatcher,
      inject: [CAPABILITY_INVOCATION_REPOSITORY_PORT, AgentCapabilityRegistry],
      useFactory: (
        repository: CapabilityInvocationRepositoryPort,
        capabilities: AgentCapabilityRegistry,
      ) => new CapabilityMutationDispatcher(repository, capabilities),
    },
    {
      provide: CapabilityInvocationService,
      inject: [
        CAPABILITY_INVOCATION_REPOSITORY_PORT,
        AgentCapabilityRegistry,
        SOURCING_CAPABILITY_ADMISSION_PORT,
        CapabilityMutationDispatcher,
      ],
      useFactory: (
        repository: CapabilityInvocationRepositoryPort,
        capabilities: AgentCapabilityRegistry,
        sourcingAdmission: SourcingCapabilityAdmissionPort,
        dispatcher: CapabilityMutationDispatcher,
      ) => new CapabilityInvocationService(
        repository,
        capabilities,
        undefined,
        sourcingAdmission,
        dispatcher,
      ),
    },
    { provide: CAPABILITY_INVOCATION_PORT, useExisting: CapabilityInvocationService },
    {
      provide: CapabilityApprovalService,
      inject: [CAPABILITY_INVOCATION_REPOSITORY_PORT, CapabilityMutationDispatcher],
      useFactory: (
        repository: CapabilityInvocationRepositoryPort,
        dispatcher: CapabilityMutationDispatcher,
      ) => new CapabilityApprovalService(repository, dispatcher),
    },
    { provide: CAPABILITY_APPROVAL_PORT, useExisting: CapabilityApprovalService },
  ],
  exports: [
    CAPABILITY_INVOCATION_PORT,
    CAPABILITY_APPROVAL_PORT,
    CAPABILITY_INVOCATION_REPOSITORY_PORT,
    PrismaCapabilityInvocationRepository,
    CapabilityInvocationService,
    CapabilityApprovalService,
    AgentOsCapabilityModule,
  ],
})
export class AgentOsInvocationModule {}
