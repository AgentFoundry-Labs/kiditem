import type { OnApplicationBootstrap } from '@nestjs/common';
import type { AgentCapabilityHandler } from '../../../application/port/out/capability/agent-capability-handler.port';
import { AgentCapabilityRegistry } from '../../../application/service/agent-capability-registry.service';
import { AgentRuntimeAdapterRegistry } from '../../../application/service/agent-runtime-adapter.registry';
import {
  HermesHttpRuntimeAdapter,
  hermesFetchRuntimeTransportFromEnvironment,
} from './hermes-http-runtime.adapter';
import type { RegisteredMcpTool } from './run-scoped-mcp-config';
import { runtimeCredentialBrokerFromEnvironment } from './runtime-credential-broker';
import { runtimeHandleCipherFromEnvironment } from './runtime-handle-cipher';

const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,127}$/;

/**
 * Converts a code-owned capability key into the bounded name exposed to an
 * official runtime's generated MCP configuration. This is intentionally
 * separate from legacy MCP presentation names: durable runtimes receive only
 * the session policy's registered capability set.
 */
export function hermesRuntimeToolNameForCapability(capabilityKey: string): string {
  const toolName = capabilityKey
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  if (!TOOL_NAME_PATTERN.test(toolName)) {
    throw new Error(`HERMES_RUNTIME_TOOL_NAME_INVALID: ${capabilityKey}`);
  }
  return toolName;
}

/**
 * Registers Hermes only when an explicit control-plane endpoint is configured.
 * It makes no network request during startup; missing credential/encryption
 * configuration is instead a fail-closed boot error for an opted-in runtime.
 */
export class HermesRuntimeStartupRegistrar implements OnApplicationBootstrap {
  constructor(
    private readonly runtimes: AgentRuntimeAdapterRegistry,
    private readonly capabilities: AgentCapabilityRegistry,
    private readonly environment: Readonly<NodeJS.ProcessEnv> = process.env,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.environment.HERMES_RUNTIME_BASE_URL?.trim()) return;

    this.runtimes.register(
      new HermesHttpRuntimeAdapter({
        transport: hermesFetchRuntimeTransportFromEnvironment(this.environment),
        credentialBroker: runtimeCredentialBrokerFromEnvironment(this.environment),
        handleCipher: runtimeHandleCipherFromEnvironment(this.environment),
        toolRegistry: registeredTools(this.capabilities.list()),
      }),
    );
  }
}

function registeredTools(
  handlers: AgentCapabilityHandler[],
): ReadonlyMap<string, RegisteredMcpTool> {
  const registered = new Map<string, RegisteredMcpTool>();
  const keysByToolName = new Map<string, string>();
  for (const handler of [...handlers].sort((left, right) => left.key.localeCompare(right.key))) {
    const toolName = hermesRuntimeToolNameForCapability(handler.key);
    const existingKey = keysByToolName.get(toolName);
    if (existingKey && existingKey !== handler.key) {
      throw new Error(
        `HERMES_RUNTIME_TOOL_NAME_COLLISION: ${existingKey}, ${handler.key}`,
      );
    }
    keysByToolName.set(toolName, handler.key);
    registered.set(handler.key, { serverKey: 'kiditem', toolName });
  }
  return registered;
}
