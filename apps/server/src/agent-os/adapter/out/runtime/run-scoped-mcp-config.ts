import { z } from 'zod';

export interface RegisteredMcpTool {
  serverKey: string;
  toolName: string;
}

export interface RunScopedMcpConfig {
  schemaVersion: 1;
  servers: Array<{
    key: string;
    credential: string;
    tools: string[];
  }>;
}

const toolSchema = z.object({
  serverKey: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  toolName: z.string().regex(/^[a-z][a-z0-9_-]{0,127}$/),
}).strict();

export function buildRunScopedMcpConfig(input: {
  capabilityKeys: string[];
  registeredTools: ReadonlyMap<string, RegisteredMcpTool>;
  credential: string;
}): RunScopedMcpConfig {
  const byServer = new Map<string, Set<string>>();
  for (const capabilityKey of [...new Set(input.capabilityKeys)].sort()) {
    const registered = input.registeredTools.get(capabilityKey);
    if (!registered) throw new Error(`RUNTIME_CAPABILITY_NOT_REGISTERED: ${capabilityKey}`);
    const tool = toolSchema.parse(registered);
    const tools = byServer.get(tool.serverKey) ?? new Set<string>();
    tools.add(tool.toolName);
    byServer.set(tool.serverKey, tools);
  }
  return {
    schemaVersion: 1,
    servers: [...byServer.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, tools]) => ({ key, credential: input.credential, tools: [...tools].sort() })),
  };
}
