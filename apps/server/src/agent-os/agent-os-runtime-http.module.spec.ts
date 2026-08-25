import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AgentMcpHttpController } from './adapter/in/http/runtime/agent-mcp-http.controller';
import { KidItemAgentOsMcpServer } from './adapter/in/mcp/kiditem-agent-os-mcp-server';
import { McpRuntimeReadinessService } from './adapter/in/mcp/readiness-canary-mcp-server';
import { ExecutionBindingRegistry } from './adapter/out/runtime/gateway/execution-binding.registry';
import { AgentOsInvocationModule } from './agent-os-invocation.module';
import { AgentOsRuntimeHttpModule } from './agent-os-runtime-http.module';

describe('AgentOsRuntimeHttpModule', () => {
  it('wires the fresh MCP endpoint, invocation composition, and execution binding registry', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AgentOsRuntimeHttpModule);
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AgentOsRuntimeHttpModule);
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AgentOsRuntimeHttpModule);

    expect(imports).toContain(AgentOsInvocationModule);
    expect(controllers).toContain(AgentMcpHttpController);
    expect(providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ provide: ExecutionBindingRegistry }),
      expect.objectContaining({ provide: McpRuntimeReadinessService }),
      KidItemAgentOsMcpServer,
    ]));
  });
});
