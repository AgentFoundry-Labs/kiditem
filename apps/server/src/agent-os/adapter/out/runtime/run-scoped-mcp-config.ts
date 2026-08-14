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

const runScopedMcpServerSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  credential: z.string().min(1).max(4_096),
  tools: z.array(z.string().regex(/^[a-z][a-z0-9_-]{0,127}$/)).min(1).max(100),
}).strict();

export const RunScopedMcpConfigSchema = z.object({
  schemaVersion: z.literal(1),
  servers: z.array(runScopedMcpServerSchema).max(20),
}).strict().superRefine((config, context) => {
  const serverKeys = new Set<string>();
  for (const [index, server] of config.servers.entries()) {
    if (serverKeys.has(server.key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['servers', index, 'key'],
        message: 'Run-scoped MCP server keys must be unique.',
      });
    }
    serverKeys.add(server.key);
    if (new Set(server.tools).size !== server.tools.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['servers', index, 'tools'],
        message: 'Run-scoped MCP tools must be unique.',
      });
    }
  }
});

export function parseRunScopedMcpConfig(value: unknown): RunScopedMcpConfig {
  return RunScopedMcpConfigSchema.parse(value);
}

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
  return parseRunScopedMcpConfig({
    schemaVersion: 1,
    servers: [...byServer.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, tools]) => ({ key, credential: input.credential, tools: [...tools].sort() })),
  });
}
