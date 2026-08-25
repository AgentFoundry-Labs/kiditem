import { Module } from '@nestjs/common';
import { requireWebOrigin } from '../common/config/web-origin';
import { OperationsModule } from '../operations/operations.module';
import { AgentMcpHttpController, MCP_WEB_ORIGIN } from './adapter/in/http/runtime/agent-mcp-http.controller';
import { McpHttpResponseAdapter } from './adapter/in/http/runtime/mcp-http-response.adapter';
import { KidItemAgentOsMcpServer } from './adapter/in/mcp/kiditem-agent-os-mcp-server';
import { McpRuntimeReadinessService } from './adapter/in/mcp/readiness-canary-mcp-server';
import { GatewayControlSessionModule } from './adapter/out/runtime/gateway/gateway-control-session.module';
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
      provide: MCP_WEB_ORIGIN,
      useFactory: () => requireWebOrigin(),
    },
  ],
  exports: [GatewayControlSessionModule, McpRuntimeReadinessService],
})
export class AgentOsRuntimeHttpModule {}
