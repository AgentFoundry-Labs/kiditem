import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v3';
import { callAttemptMcpProxy } from './attempt-mcp-proxy';

export const ATTEMPT_MCP_SOCKET_PATH = 'ATTEMPT_MCP_SOCKET_PATH';

function socketPath(env: NodeJS.ProcessEnv = process.env): string {
  const value = env[ATTEMPT_MCP_SOCKET_PATH]?.trim();
  if (!value?.startsWith('/')) throw new Error('attempt_mcp_socket_required');
  return value;
}

function text(value: unknown) {
  const isError = Boolean(value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string');
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}) };
}

async function call(tool: string, arguments_: Record<string, unknown>) {
  return text(await callAttemptMcpProxy(socketPath(), { tool, arguments: arguments_ }));
}

export async function createKidItemAgentOsMcpServer(): Promise<McpServer> {
  const server = new McpServer({ name: 'kiditem-attempt-mcp', version: '1.0.0' });
  server.registerTool('capability_catalog_search', { description: 'Discover bounded public capability manifests and strict inputs.', inputSchema: z.object({ query: z.string().max(256).default('') }).strict() }, (args) => call('capability_catalog_search', args));
  server.registerTool('capability_invoke', { description: 'Invoke one discovered capability with exact strict input.', inputSchema: z.object({ capabilityKey: z.string().min(1).max(160), input: z.record(z.unknown()) }).strict() }, (args) => call('capability_invoke', args));
  for (const action of ['status', 'wait', 'result'] as const) {
    server.registerTool(`invocation_${action}`, { description: 'Read or bounded-wait for this Attempt’s exact durable mutation result.', inputSchema: z.object({ invocationId: z.string().uuid() }).strict() }, (args) => call(`invocation_${action}`, args));
  }
  server.registerTool('delegate_to_agent', { description: 'Delegate a state-changing cross-domain capability and exact strict input to its selected owning Agent.', inputSchema: z.object({ targetAgentKey: z.string().min(1).max(64), objective: z.string().min(1).max(8_000), capabilityKey: z.string().min(1).max(160).optional(), input: z.record(z.unknown()).optional() }).strict().superRefine((value, ctx) => { if (Boolean(value.capabilityKey) !== Boolean(value.input)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'capabilityKey and input must be supplied together' }); }) }, (args) => call('delegate_to_agent', args));
  for (const action of ['status', 'wait', 'result', 'message', 'interrupt'] as const) {
    server.registerTool(`child_${action}`, { description: 'Inspect, wait for, or control an exact delegated child Task.', inputSchema: z.object({ childTaskId: z.string().uuid(), message: z.string().min(1).max(4_000).optional() }).strict() }, (args) => call(`child_${action}`, args));
  }
  return server;
}

export async function runKidItemAgentOsMcpServer(): Promise<void> {
  const server = await createKidItemAgentOsMcpServer();
  await server.connect(new StdioServerTransport());
}

if (require.main === module) {
  runKidItemAgentOsMcpServer().catch((error) => {
    console.error(error instanceof Error ? error.message : 'attempt_mcp_failed');
    process.exitCode = 1;
  });
}
