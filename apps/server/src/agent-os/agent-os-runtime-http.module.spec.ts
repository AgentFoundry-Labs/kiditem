import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AgentMcpHttpController } from './adapter/in/http/runtime/agent-mcp-http.controller';
import { KidItemAgentOsMcpServer } from './adapter/in/mcp/kiditem-agent-os-mcp-server';
import { McpRuntimeReadinessService } from './adapter/in/mcp/readiness-canary-mcp-server';
import { GatewayMcpRuntimeRegistry } from './adapter/out/runtime/gateway/gateway-mcp-runtime.registry';
import { GatewayControlSessionModule } from './adapter/out/runtime/gateway/gateway-control-session.module';
import { ConversationController } from './adapter/in/http/interaction/conversation.controller';
import { ConversationCopilotkitController } from './adapter/in/http/interaction/conversation-copilotkit.controller';
import { COPILOTKIT_CONVERSATION_HISTORY_TRANSPORT } from './adapter/in/http/interaction/copilotkit-conversation-history.transport';
import { ConversationSqliteEventHistory } from './adapter/out/history/sqlite/copilotkit-sqlite-event-history';
import { AgentOsHttpModule } from './agent-os-http.module';
import { AgentOsInteractionHttpModule } from './agent-os-interaction-http.module';
import { AgentOsInvocationModule } from './agent-os-invocation.module';
import { AgentOsRuntimeHttpModule } from './agent-os-runtime-http.module';

describe('AgentOsRuntimeHttpModule', () => {
  it('wires MCP plus the Gateway control-session composition and process-scoped MCP runtime registry', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AgentOsRuntimeHttpModule);
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AgentOsRuntimeHttpModule);
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AgentOsRuntimeHttpModule);

    expect(imports).toContain(AgentOsInvocationModule);
    expect(imports.map((entry: { name?: string }) => entry.name ?? String(entry)))
      .not.toContain('OperationsModule');
    expect(imports).toContain(GatewayControlSessionModule);
    expect(controllers).toContain(AgentMcpHttpController);
    expect(providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ provide: McpRuntimeReadinessService }),
      KidItemAgentOsMcpServer,
    ]));
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, AgentOsRuntimeHttpModule)).toContain(GatewayControlSessionModule);
    const gatewayProviders = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, GatewayControlSessionModule);
    expect(gatewayProviders).toEqual(expect.arrayContaining([
      expect.objectContaining({ provide: GatewayMcpRuntimeRegistry }),
    ]));
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
    expect(controllers).toEqual(expect.arrayContaining([
      ConversationController,
      ConversationCopilotkitController,
    ]));
    expect(providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ provide: ConversationSqliteEventHistory }),
      expect.objectContaining({
        provide: COPILOTKIT_CONVERSATION_HISTORY_TRANSPORT,
        useExisting: ConversationSqliteEventHistory,
      }),
    ]));
    expect(rendered).not.toMatch(/Prisma|ConversationRepository|ConversationPreferenceStore|conversation-preferences\.json/i);
  });

  it('keeps the Agent OS HTTP composition free of generic execution/runtime dependencies', () => {
    const source = readFileSync(resolve(__dirname, 'agent-os-runtime-http.module.ts'), 'utf8');
    expect(source).not.toMatch(/OperationsModule|OperationRun|OperationAlert|Panel/);
  });
});
