import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AgentOsCapabilityModule } from './agent-os/agent-os-capability.module';
import { AgentOsSessionModule } from './agent-os/agent-os-session.module';
import { AGENT_OS_MCP_TOOL_EXECUTION_PORT } from './agent-os/application/port/in/capability/agent-os-mcp-tool-execution.port';
import { AgentOsMcpToolExecutor } from './agent-os/application/service/agent-os-mcp-tool-executor.service';
import { SourcingAgentReadCapabilityModule } from './sourcing/sourcing-agent-read-capability.module';
import { SourcingAgentListingCapabilityModule } from './sourcing/sourcing-agent-listing-capability.module';
import { SupplyAgentRuntimeModule } from './supply/supply-agent-runtime.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    AgentOsSessionModule,
    AgentOsCapabilityModule,
    SourcingAgentReadCapabilityModule,
    SourcingAgentListingCapabilityModule,
    SupplyAgentRuntimeModule,
  ],
  providers: [
    AgentOsMcpToolExecutor,
    {
      provide: AGENT_OS_MCP_TOOL_EXECUTION_PORT,
      useExisting: AgentOsMcpToolExecutor,
    },
  ],
  exports: [AGENT_OS_MCP_TOOL_EXECUTION_PORT],
})
export class AgentRuntimeApplicationModule {}
