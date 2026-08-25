import { Module } from '@nestjs/common';
import { requireWebOrigin } from '../common/config/web-origin';
import { OperationsModule } from '../operations/operations.module';
import { AgentMcpHttpController, MCP_WEB_ORIGIN } from './adapter/in/http/runtime/agent-mcp-http.controller';
import { McpHttpResponseAdapter } from './adapter/in/http/runtime/mcp-http-response.adapter';
import { KidItemAgentOsMcpServer } from './adapter/in/mcp/kiditem-agent-os-mcp-server';
import { McpRuntimeReadinessService } from './adapter/in/mcp/readiness-canary-mcp-server';
import { ExecutionBindingRegistry } from './adapter/out/runtime/gateway/execution-binding.registry';
import { AgentOsInvocationModule } from './agent-os-invocation.module';

/** Private, stateless MCP v2 ingress composed only from current application ports. */
@Module({
  imports: [AgentOsInvocationModule, OperationsModule],
  controllers: [AgentMcpHttpController],
  providers: [
    // These two classes intentionally accept deterministic collaborators when
    // unit-tested. Instantiate their production process-local forms here so
    // Nest never mistakes those function/default constructor parameters for
    // injectable application dependencies.
    {
      provide: ExecutionBindingRegistry,
      useFactory: () => new ExecutionBindingRegistry(),
    },
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
  exports: [ExecutionBindingRegistry, McpRuntimeReadinessService],
})
export class AgentOsRuntimeHttpModule {}
