import { Module } from '@nestjs/common';
import { AgentRuntimeApplicationModule } from './agent-runtime-application.module';
import { SourcingAgentMcpCollectionModule } from './sourcing/sourcing-agent-mcp-collection.module';

@Module({
  imports: [AgentRuntimeApplicationModule, SourcingAgentMcpCollectionModule],
})
export class AgentMcpApplicationModule {}
