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

/** Local CLI MCP exposure contains names only; execution authority is supplied
 * separately by the KidItem-spawned MCP child process and rechecked in DB. */
export interface LocalCliMcpConfig {
  schemaVersion: 1;
  servers: Array<{
    key: string;
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

const localCliMcpServerSchema = runScopedMcpServerSchema.omit({ credential: true });

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

export const LocalCliMcpConfigSchema = z.object({
  schemaVersion: z.literal(1),
  servers: z.array(localCliMcpServerSchema).max(20),
}).strict().superRefine(validateUniqueServersAndTools);

export function parseRunScopedMcpConfig(value: unknown): RunScopedMcpConfig {
  return RunScopedMcpConfigSchema.parse(value);
}

export function parseLocalCliMcpConfig(value: unknown): LocalCliMcpConfig {
  return LocalCliMcpConfigSchema.parse(value);
}

export function buildRunScopedMcpConfig(input: {
  capabilityKeys: string[];
  registeredTools: ReadonlyMap<string, RegisteredMcpTool>;
  credential: string;
}): RunScopedMcpConfig {
  const grouped = groupRegisteredTools(input);
  return parseRunScopedMcpConfig({
    ...grouped,
    servers: grouped.servers.map((server) => ({
      ...server,
      credential: input.credential,
    })),
  });
}

export function buildLocalCliMcpConfig(input: {
  capabilityKeys: string[];
  registeredTools: ReadonlyMap<string, RegisteredMcpTool>;
}): LocalCliMcpConfig {
  return parseLocalCliMcpConfig(groupRegisteredTools(input));
}

function groupRegisteredTools(input: {
  capabilityKeys: string[];
  registeredTools: ReadonlyMap<string, RegisteredMcpTool>;
}) {
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
      .map(([key, tools]) => ({ key, tools: [...tools].sort() })),
  } as const;
}

function validateUniqueServersAndTools(
  config: { servers: Array<{ key: string; tools: string[] }> },
  context: z.RefinementCtx,
): void {
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
}
