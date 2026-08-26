import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AgentMcpHttpController } from './adapter/in/http/runtime/agent-mcp-http.controller';
import { KidItemAgentOsMcpServer } from './adapter/in/mcp/kiditem-agent-os-mcp-server';
import { McpRuntimeReadinessService } from './adapter/in/mcp/readiness-canary-mcp-server';
import { ExecutionBindingRegistry } from './adapter/out/runtime/gateway/execution-binding.registry';
import { GatewayControlSessionModule } from './adapter/out/runtime/gateway/gateway-control-session.module';
import { ConversationController } from './adapter/in/http/interaction/conversation.controller';
import { AgentOsHttpModule } from './agent-os-http.module';
import { AgentOsInteractionHttpModule } from './agent-os-interaction-http.module';
import { AgentOsInvocationModule } from './agent-os-invocation.module';
import { AgentOsRuntimeHttpModule } from './agent-os-runtime-http.module';

describe('AgentOsRuntimeHttpModule', () => {
  it('wires MCP plus the Gateway control-session composition and execution binding registry', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AgentOsRuntimeHttpModule);
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AgentOsRuntimeHttpModule);
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AgentOsRuntimeHttpModule);

    expect(imports).toContain(AgentOsInvocationModule);
    expect(imports).toContain(GatewayControlSessionModule);
    expect(controllers).toContain(AgentMcpHttpController);
    expect(providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ provide: McpRuntimeReadinessService }),
      KidItemAgentOsMcpServer,
    ]));
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, AgentOsRuntimeHttpModule)).toContain(GatewayControlSessionModule);
  });

  it('keeps the browser conversation facade composed only from the Gateway control ports, without Prisma or a local conversation repository', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AgentOsInteractionHttpModule);
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AgentOsInteractionHttpModule);
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AgentOsInteractionHttpModule);
    const rendered = JSON.stringify({
      imports: imports.map((entry: { name?: string }) => entry.name ?? String(entry)),
      controllers: controllers.map((entry: { name?: string }) => entry.name ?? String(entry)),
      providers: providers.map((entry: { provide?: unknown; name?: string }) =>
        entry.provide ? String(entry.provide) : entry.name ?? String(entry)),
    });

    expect(imports).toEqual(expect.arrayContaining([AgentOsHttpModule, GatewayControlSessionModule]));
    expect(controllers).toContain(ConversationController);
    expect(rendered).not.toMatch(/Prisma|ConversationRepository|ConversationPreferenceStore|conversation-preferences\.json/i);
  });
});
