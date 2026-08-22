import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AgentOsCapabilityModule } from './agent-os/agent-os-capability.module';
import { AgentOsLegacyRunModule } from './agent-os/agent-os-legacy-run.module';
import { AgentOsSessionModule } from './agent-os/agent-os-session.module';
import { AiAgentRuntimeModule } from './ai/ai-agent-runtime.module';
import { PrismaModule } from './prisma/prisma.module';
import { SourcingAgentShadowOperationModule } from './sourcing/sourcing-agent-shadow-operation.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    PrismaModule,
    AgentOsSessionModule,
    AgentOsCapabilityModule,
    AgentOsLegacyRunModule,
    SourcingAgentShadowOperationModule,
    AiAgentRuntimeModule,
  ],
})
export class AgentRuntimeApplicationModule {}
