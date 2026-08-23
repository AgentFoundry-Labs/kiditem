import type { OnApplicationBootstrap } from '@nestjs/common';
import { resolve } from 'node:path';
import { AgentCapabilityRegistry } from '../../../application/service/agent-capability-registry.service';
import { AgentRuntimeAdapterRegistry } from '../../../application/service/agent-runtime-adapter.registry';
import type { IsolatedCliRuntimeAdapter } from './isolated-cli-runtime.adapter';
import { isolatedCliRunRootFromEnvironment } from './isolated-cli-runtime.adapter';
import { ClaudeCliRuntimeAdapter } from './claude-cli-runtime.adapter';
import { CodexCliRuntimeAdapter } from './codex-cli-runtime.adapter';
import { LocalIsolatedCliTransport } from './local-isolated-cli.transport';
import { NodeIsolatedCliFilesystem } from './node-isolated-cli-filesystem';
import { buildLocalCliMcpConfig, type RegisteredMcpTool } from './run-scoped-mcp-config';
import { localRuntimeHandleCodec } from './local-runtime-handle-codec';
import { firstClassMcpToolNameForCapability } from '../../../application/service/kiditem-mcp-tool-registry.service';
import { commonMcpToolsForAgentType } from '../../../application/service/kiditem-mcp-tool-registry.service';

type ReadyCliAdapter = IsolatedCliRuntimeAdapter & { assertReady(): Promise<void> };
type AdapterFactory = () => ReadyCliAdapter[];

export class LocalCliRuntimeStartupRegistrar implements OnApplicationBootstrap {
  constructor(
    private readonly runtimes: AgentRuntimeAdapterRegistry,
    private readonly capabilities: AgentCapabilityRegistry,
    private readonly environment: Readonly<NodeJS.ProcessEnv> = process.env,
    private readonly adapterFactory?: AdapterFactory,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const adapters = this.adapterFactory?.() ?? this.createAdapters();
    for (const adapter of adapters) {
      try {
        await adapter.assertReady();
      } catch (cause) {
        const detail = cause instanceof Error ? `: ${cause.message}` : '';
        throw new Error(`LOCAL_CLI_RUNTIME_UNAVAILABLE:${adapter.runtimeType}${detail}`);
      }
    }
    for (const adapter of adapters) this.runtimes.register(adapter);
  }

  private createAdapters(): ReadyCliAdapter[] {
    const runRoot = isolatedCliRunRootFromEnvironment(this.environment as NodeJS.ProcessEnv);
    const repositoryRoot = this.environment.KIDITEM_RUNTIME_ENV_ROOT?.trim()
      || resolve(__dirname, '../../../../../../..');
    const filesystem = new NodeIsolatedCliFilesystem(runRoot);
    const transport = new LocalIsolatedCliTransport(runRoot);
    const common = {
      filesystem,
      transport,
      runRoot,
      handleCipher: localRuntimeHandleCodec,
      ambientEnv: this.environment as NodeJS.ProcessEnv,
      mcpServer: {
        command: process.execPath,
        args: [resolve(
          repositoryRoot,
          'apps/server/dist/agent-os/adapter/in/mcp/kiditem-agent-os-mcp-server.js',
        )],
        environmentRoot: repositoryRoot,
      },
      claudeMaxBudgetUsd:
        this.environment.AGENT_RUNTIME_CLAUDE_MAX_BUDGET_USD?.trim() || '0.25',
      mcpConfig: (context: {
        agentDefinitionKey: string;
        capabilityKeys: string[];
        organizationId: string;
        sessionId: string;
        executionId: string;
        attemptId: string;
        startIntentId: string;
        runtimeCredentialGeneration: number;
      }) => localCliMcpConfigForExecution(context, this.capabilities.list()),
    };
    return [new ClaudeCliRuntimeAdapter(common), new CodexCliRuntimeAdapter(common)];
  }
}

function registeredTools(
  handlers: ReturnType<AgentCapabilityRegistry['list']>,
): ReadonlyMap<string, RegisteredMcpTool> {
  const tools = new Map(handlers.map((handler) => [
    handler.key,
    {
      serverKey: 'kiditem',
      toolName: firstClassMcpToolNameForCapability(handler.key),
    },
  ]));
  for (const name of [
    'agent_os_read_context',
    'agent_os_read_task_graph',
    'agent_os_read_artifacts',
    'agent_os_finalize_task',
  ]) {
    tools.set(name, { serverKey: 'kiditem', toolName: name });
  }
  return tools;
}

/** Exact parent allowlist is derived from the same names the child resolves. */
export function localCliMcpConfigForExecution(
  context: Pick<
    Parameters<IsolatedCliRuntimeAdapter['start']>[0],
    'agentDefinitionKey' | 'capabilityKeys'
  >,
  handlers: ReturnType<AgentCapabilityRegistry['list']>,
) {
  const lowRisk = new Set(
    handlers
      .filter((handler) => handler.approvalRisk === 'none' || handler.approvalRisk === 'low')
      .map((handler) => handler.key),
  );
  return buildLocalCliMcpConfig({
    capabilityKeys: [
      ...commonMcpToolsForAgentType(context.agentDefinitionKey),
      ...context.capabilityKeys.filter((key) => lowRisk.has(key)),
    ],
    registeredTools: registeredTools(handlers),
  });
}
