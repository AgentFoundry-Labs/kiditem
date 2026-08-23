import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v3';
import { AgentMcpApplicationModule } from '../../../../agent-mcp-application.module';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import {
  AGENT_OS_MCP_TOOL_EXECUTION_PORT,
  type AgentOsMcpExecutionContextPort,
  type AgentOsMcpToolExecutionPort,
} from '../../../application/port/in/capability/agent-os-mcp-tool-execution.port';

const objectInputSchema = z.object({}).catchall(z.unknown());
const localExecutionContextSchema = z.object({
  organizationId: z.string().uuid(),
  sessionId: z.string().uuid(),
  executionId: z.string().uuid(),
  attemptId: z.string().uuid(),
  startIntentId: z.string().uuid(),
  runtimeCredentialGeneration: z.number().int().nonnegative(),
}).strict();

function readRequiredEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  key: string,
): string {
  const value = env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required KidItem MCP env: ${key}`);
  }
  return value.trim();
}

/** MCP receives only the exact context of the local CLI process that spawned it. */
export function readKidItemAgentOsMcpContext(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): AgentOsMcpExecutionContextPort {
  const serialized = readRequiredEnv(env, 'KIDITEM_MCP_EXECUTION_CONTEXT');
  try {
    return localExecutionContextSchema.parse(JSON.parse(serialized));
  } catch {
    throw new Error('Invalid KidItem MCP env: KIDITEM_MCP_EXECUTION_CONTEXT');
  }
}

export function toMcpText(result: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
}

export function redactMcpErrorMessage(message: string): string {
  return message
    .replace(
      /\b((?:[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|COOKIE|AUTH|PRIVATE|CREDENTIAL|CREDENTIALS)|DATABASE_URL|REDIS_URL|SENTRY_DSN)=)("[^"]*"|'[^']*'|[^\s]+)/gi,
      '$1[REDACTED]',
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|secret-token)-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/\b(?:github_pat|gh[pousr])_[A-Za-z0-9_]+/g, '[REDACTED]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED]')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, '[REDACTED]')
    .replace(/\bxoxb-[A-Za-z0-9-]+/g, '[REDACTED]');
}

function toMcpToolError(error: unknown) {
  const code = error instanceof AgentOsRuntimeError ? error.code : 'MCP_TOOL_FAILED';
  // Deliberately do not surface arbitrary infrastructure errors from a child
  // runtime. Stable execution errors are safe; every other message is generic.
  const message = error instanceof AgentOsRuntimeError
    ? redactMcpErrorMessage(error.message)
    : 'The MCP tool could not be completed.';
  return { ...toMcpText({ error: { code, message } }), isError: true };
}

async function executeMcpTool(input: {
  context: AgentOsMcpExecutionContextPort;
  executor: AgentOsMcpToolExecutionPort;
  toolName: string;
  arguments: Record<string, unknown>;
}) {
  try {
    return toMcpText(await input.executor.execute(input));
  } catch (error: unknown) {
    return toMcpToolError(error);
  }
}

function toolDescription(name: string): string {
  return name === 'agent_os_read_context'
    ? 'Read the exact bounded context of this authenticated runtime execution.'
    : 'Invoke a policy-registered read-only KidItem capability.';
}

export async function createKidItemAgentOsMcpServer(input: {
  context: AgentOsMcpExecutionContextPort;
  executor: AgentOsMcpToolExecutionPort;
}): Promise<McpServer> {
  const server = new McpServer({ name: 'kiditem-agent-os-mcp', version: '0.1.0' });
  const availableTools = await input.executor.listAvailableTools(input.context);
  for (const tool of availableTools) {
    server.registerTool(tool.name, {
      title: tool.name,
      description: toolDescription(tool.name),
      inputSchema: objectInputSchema,
    }, (arguments_) => executeMcpTool({
      context: input.context,
      executor: input.executor,
      toolName: tool.name,
      arguments: arguments_,
    }));
  }
  return server;
}

export function loadKidItemAgentOsMcpEnv(repositoryRoot: string): void {
  config({ path: resolve(repositoryRoot, 'apps/server/.env') });
  config({ path: resolve(repositoryRoot, '.env') });
}

export async function createKidItemAgentOsMcpApplicationContext(input: {
  repositoryRoot: string;
  createApplicationContext?: (root: unknown, options: { logger: false }) => unknown | Promise<unknown>;
  loadApplicationModule?: () => Promise<{ AgentMcpApplicationModule: unknown }>;
}): Promise<any> {
  loadKidItemAgentOsMcpEnv(input.repositoryRoot);
  const loaded = await (input.loadApplicationModule ?? (async () => ({ AgentMcpApplicationModule })))();
  return (input.createApplicationContext ?? ((root, options) =>
    NestFactory.createApplicationContext(root as never, options)))(
    loaded.AgentMcpApplicationModule,
    { logger: false },
  );
}

export async function runKidItemAgentOsMcpServer(): Promise<void> {
  const repositoryRoot = readRequiredEnv(process.env, 'KIDITEM_RUNTIME_ENV_ROOT');
  const app = await createKidItemAgentOsMcpApplicationContext({ repositoryRoot });
  const context = readKidItemAgentOsMcpContext();
  const executor: AgentOsMcpToolExecutionPort = app.get(AGENT_OS_MCP_TOOL_EXECUTION_PORT);
  const server = await createKidItemAgentOsMcpServer({ context, executor });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await server.close();
    await app.close();
  };
  const closeForSignal = () => {
    void close().catch(() => { process.exitCode = 1; });
  };
  process.once('SIGINT', closeForSignal);
  process.once('SIGTERM', closeForSignal);
  try {
    await server.connect(new StdioServerTransport());
  } catch (error: unknown) {
    await close();
    throw error;
  }
}

if (require.main === module) {
  runKidItemAgentOsMcpServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(redactMcpErrorMessage(message));
    process.exitCode = 1;
  });
}
