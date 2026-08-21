import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AgentOsCapabilityModule } from './agent-os/agent-os-capability.module';
import { AgentOsLegacyRunModule } from './agent-os/agent-os-legacy-run.module';
import { AgentOsSessionModule } from './agent-os/agent-os-session.module';
import { AiAgentRuntimeModule } from './ai/ai-agent-runtime.module';
import { PrismaModule } from './prisma/prisma.module';
import { SourcingAgentRuntimeModule } from './sourcing/sourcing-agent-runtime.module';
import { SourcingAgentShadowOperationModule } from './sourcing/sourcing-agent-shadow-operation.module';
import { SupplyAgentRuntimeModule } from './supply/supply-agent-runtime.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    PrismaModule,
    AgentOsSessionModule,
    AgentOsCapabilityModule,
    AgentOsLegacyRunModule,
    SourcingAgentRuntimeModule,
    SourcingAgentShadowOperationModule,
    SupplyAgentRuntimeModule,
    AiAgentRuntimeModule,
  ],
})
export class AgentRuntimeApplicationModule {}
