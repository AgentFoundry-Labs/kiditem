import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AgentOsModule } from './agent-os/agent-os.module';
import { AiAgentRuntimeModule } from './ai/ai-agent-runtime.module';
import { PrismaModule } from './prisma/prisma.module';
import { SourcingAgentRuntimeModule } from './sourcing/sourcing-agent-runtime.module';
import { SourcingAgentShadowOperationModule } from './sourcing/sourcing-agent-shadow-operation.module';
import { SupplyAgentRuntimeModule } from './supply/supply-agent-runtime.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    PrismaModule,
    AgentOsModule,
    SourcingAgentRuntimeModule,
    SourcingAgentShadowOperationModule,
    SupplyAgentRuntimeModule,
    AiAgentRuntimeModule,
  ],
})
export class AgentRuntimeApplicationModule {}
