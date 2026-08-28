import { Module } from '@nestjs/common';
import { OperationsModule } from '../operations/operations.module';
import { AgentMcpHttpController } from './adapter/in/http/runtime/agent-mcp-http.controller';
import { McpHttpResponseAdapter } from './adapter/in/http/runtime/mcp-http-response.adapter';
import { KidItemAgentOsMcpServer } from './adapter/in/mcp/kiditem-agent-os-mcp-server';
import { McpRuntimeReadinessService } from './adapter/in/mcp/readiness-canary-mcp-server';
import { GatewayCapabilityApprovalEventAdapter } from './adapter/out/runtime/gateway/gateway-capability-approval-event.adapter';
import { GatewayCommandResponseBroker } from './adapter/out/runtime/gateway/gateway-command-response.broker';
import { GatewayControlSessionModule } from './adapter/out/runtime/gateway/gateway-control-session.module';
import { CAPABILITY_APPROVAL_EVENT_PORT } from './application/port/out/event/capability-approval-event.port';
import { AgentOsInvocationModule } from './agent-os-invocation.module';

/** Private, stateless MCP v2 ingress composed only from current application ports. */
@Module({
  imports: [AgentOsInvocationModule, OperationsModule, GatewayControlSessionModule],
  controllers: [AgentMcpHttpController],
  providers: [
    McpHttpResponseAdapter,
    {
      provide: McpRuntimeReadinessService,
      useFactory: () => new McpRuntimeReadinessService(process.env),
    },
    KidItemAgentOsMcpServer,
    {
      provide: CAPABILITY_APPROVAL_EVENT_PORT,
      inject: [GatewayCommandResponseBroker],
      useFactory: (broker: GatewayCommandResponseBroker) => new GatewayCapabilityApprovalEventAdapter(broker),
    },
  ],
  exports: [GatewayControlSessionModule, McpRuntimeReadinessService],
})
export class AgentOsRuntimeHttpModule {}
