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
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

async function call(tool: string, arguments_: Record<string, unknown>) {
  return text(await callAttemptMcpProxy(socketPath(), { tool, arguments: arguments_ }));
}

export async function createKidItemAgentOsMcpServer(): Promise<McpServer> {
  const server = new McpServer({ name: 'kiditem-attempt-mcp', version: '1.0.0' });
  server.registerTool('capability_catalog_search', { inputSchema: z.object({ query: z.string().default('') }) }, (args) => call('capability_catalog_search', args));
  server.registerTool('capability_invoke', { inputSchema: z.object({ capabilityKey: z.string(), input: z.record(z.unknown()) }) }, (args) => call('capability_invoke', args));
  server.registerTool('delegate_to_agent', { inputSchema: z.object({ targetAgentKey: z.string(), objective: z.string() }) }, (args) => call('delegate_to_agent', args));
  for (const action of ['status', 'wait', 'result', 'message', 'interrupt'] as const) {
    server.registerTool(`child_${action}`, { inputSchema: z.object({ childTaskId: z.string(), message: z.string().optional() }) }, (args) => call(`child_${action}`, args));
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
