import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v3';
import { AppModule } from '../../../../app.module';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import {
  AgentOsMcpToolExecutor,
  type AgentOsMcpExecutionContext,
} from '../../../application/service/agent-os-mcp-tool-executor.service';

export interface KidItemAgentOsMcpEnvContext {
  organizationId: string;
  conversationId: string;
  requestId: string;
  runId: string;
  agentInstanceId: string;
  agentType: string;
  requestedByUserId?: string | null;
}

const REQUIRED_ENV = [
  ['KIDITEM_AGENT_OS_ORGANIZATION_ID', 'organizationId'],
  ['KIDITEM_AGENT_OS_CONVERSATION_ID', 'conversationId'],
  ['KIDITEM_AGENT_OS_REQUEST_ID', 'requestId'],
  ['KIDITEM_AGENT_OS_RUN_ID', 'runId'],
  ['KIDITEM_AGENT_OS_AGENT_INSTANCE_ID', 'agentInstanceId'],
] as const;

const openObjectInputSchema = z.object({}).catchall(z.unknown());
const scrapeUrlInputSchema = z
  .object({
    sourceUrl: z.string().min(1).optional(),
    url: z.string().min(1).optional(),
  })
  .catchall(z.unknown());
const listingGenerationPackageInputSchema = z
  .object({
    sourceArtifactIds: z.array(z.string().min(1)).optional(),
    artifactIds: z.array(z.string().min(1)).optional(),
    sourceArtifactId: z.string().min(1).optional(),
    artifactId: z.string().min(1).optional(),
    sourceUrl: z.string().min(1).optional(),
    url: z.string().min(1).optional(),
    productName: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    target: z.string().min(1).optional(),
    imageUrls: z.array(z.string().min(1)).optional(),
    thumbnailUrl: z.string().min(1).optional(),
    thumbnailUrls: z.array(z.string().min(1)).optional(),
    optionNames: z.array(z.string().min(1)).optional(),
    keywords: z.array(z.string().min(1)).optional(),
    channel: z.string().min(1).optional(),
    marketplace: z.string().min(1).optional(),
  })
  .catchall(z.unknown());
const createTaskInputSchema = z.object({
  agentType: z.string().min(1),
  playbookKey: z.string().min(1),
  planStepKey: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  executeMode: z.enum(['queued', 'inline']),
  taskInput: z.record(z.string(), z.unknown()),
});
const requestUserInputSchema = z.object({
  question: z.string().min(1),
  reason: z.string().min(1).optional(),
});
const finalizeTaskInputSchema = z.object({
  status: z.enum(['succeeded', 'failed']).optional(),
  artifactIds: z.array(z.string().min(1)).optional(),
  summary: z.union([z.record(z.string(), z.unknown()), z.string()]).optional(),
  error: z.union([z.record(z.string(), z.unknown()), z.string()]).optional(),
});
const readArtifactsInputSchema = z.object({
  artifactType: z.string().min(1).optional(),
});

interface McpToolRegistrationConfig {
  title: string;
  description: string;
  inputSchema?: z.AnyZodObject;
}

function readRequiredEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  key: string,
): string {
  const value = env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required KidItem Agent OS MCP env: ${key}`);
  }
  return value.trim();
}

export function readKidItemAgentOsMcpContext(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): AgentOsMcpExecutionContext {
  const context = Object.fromEntries(
    REQUIRED_ENV.map(([envKey, contextKey]) => [
      contextKey,
      readRequiredEnv(env, envKey),
    ]),
  ) as Omit<AgentOsMcpExecutionContext, 'agentType' | 'requestedByUserId'>;

  const rawAgentType = env.KIDITEM_AGENT_OS_AGENT_TYPE;
  const agentType =
    rawAgentType === undefined
      ? 'manager'
      : readRequiredEnv(env, 'KIDITEM_AGENT_OS_AGENT_TYPE');
  const requestedByUserId =
    env.KIDITEM_AGENT_OS_REQUESTED_BY_USER_ID?.trim() || undefined;

  return {
    ...context,
    agentType,
    requestedByUserId,
  };
}

export function toMcpText(result: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result),
      },
    ],
  };
}

export function redactMcpErrorMessage(message: string): string {
  return message
    .replace(
      /\b((?:[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|COOKIE|AUTH|PRIVATE|CREDENTIAL|CREDENTIALS)|DATABASE_URL|REDIS_URL|SENTRY_DSN)=)("[^"]*"|'[^']*'|[^\s]+)/gi,
      '$1[REDACTED]',
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/\bsecret-token-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]+/g, '[REDACTED]')
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}/g, '[REDACTED]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED]')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, '[REDACTED]')
    .replace(/\bxoxb-[A-Za-z0-9-]+/g, '[REDACTED]');
}

function toMcpToolError(error: unknown) {
  const code =
    error instanceof AgentOsRuntimeError
      ? error.code
      : 'mcp_tool_execution_failed';
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'MCP tool execution failed.';

  return {
    ...toMcpText({
      error: {
        code,
        message: redactMcpErrorMessage(rawMessage),
      },
    }),
    isError: true,
  };
}

async function executeMcpTool(input: {
  context: AgentOsMcpExecutionContext;
  executor: AgentOsMcpToolExecutor;
  toolName: string;
  arguments: Record<string, unknown>;
}) {
  try {
    const result = await input.executor.execute({
      context: input.context,
      toolName: input.toolName,
      arguments: input.arguments,
    });
    return toMcpText(result);
  } catch (error: unknown) {
    return toMcpToolError(error);
  }
}

function toolRegistrationConfig(name: string): McpToolRegistrationConfig {
  switch (name) {
    case 'agent_os_read_context':
      return {
        title: 'Read Agent OS Context',
        description: 'Read the current bounded KidItem Agent OS context.',
      };
    case 'agent_os_read_task_graph':
      return {
        title: 'Read Agent OS Task Graph',
        description: 'Read tasks, tool invocations, and artifact graph state.',
      };
    case 'agent_os_read_artifacts':
      return {
        title: 'Read Agent OS Artifacts',
        description: 'Read artifacts visible to the current Agent OS session.',
        inputSchema: readArtifactsInputSchema,
      };
    case 'agent_os_finalize_task':
      return {
        title: 'Finalize Agent OS Task',
        description:
          'Finalize the current Hermes-driven task through KidItem Agent OS.',
        inputSchema: finalizeTaskInputSchema,
      };
    case 'agent_os_list_agents':
      return {
        title: 'List Agent OS Agents',
        description: 'List KidItem Agent OS agents available for delegation.',
      };
    case 'agent_os_create_task':
      return {
        title: 'Create Agent OS Task',
        description:
          'Create a child Agent OS task. This tool is available only to Operator agents.',
        inputSchema: createTaskInputSchema,
      };
    case 'agent_os_request_user_input':
      return {
        title: 'Request User Input',
        description:
          'Pause the Operator flow and request user input or approval through KidItem.',
        inputSchema: requestUserInputSchema,
      };
    case 'sourcing_scrape_url':
      return {
        title: 'Scrape Sourcing URL',
        description:
          'Scrape an authorized product URL and create sourcing scrape/candidate artifacts. Pass sourceUrl or url.',
        inputSchema: scrapeUrlInputSchema,
      };
    case 'listing_create_generation_package':
      return {
        title: 'Create Listing Generation Package',
        description:
          'Create listing prep, detail draft, and thumbnail draft artifacts from sourceArtifactIds or direct productName plus imageUrls.',
        inputSchema: listingGenerationPackageInputSchema,
      };
    default:
      return {
        title: name,
        description:
          'Invoke a first-class KidItem domain capability through Agent OS policy.',
        inputSchema: openObjectInputSchema,
      };
  }
}

function registerExecutorTool(input: {
  server: McpServer;
  context: AgentOsMcpExecutionContext;
  executor: AgentOsMcpToolExecutor;
  toolName: string;
}): void {
  input.server.registerTool(
    input.toolName,
    toolRegistrationConfig(input.toolName),
    (args) =>
      executeMcpTool({
        context: input.context,
        executor: input.executor,
        toolName: input.toolName,
        arguments: args,
      }),
  );
}

export function createKidItemAgentOsMcpServer(input: {
  context: AgentOsMcpExecutionContext;
  executor: AgentOsMcpToolExecutor;
}): McpServer {
  const server = new McpServer({
    name: 'kiditem-agent-os-mcp',
    version: '0.1.0',
  });

  const availableTools = input.executor.listAvailableTools(input.context);

  for (const tool of availableTools) {
    registerExecutorTool({
      server,
      context: input.context,
      executor: input.executor,
      toolName: tool.name,
    });
  }

  return server;
}

export function loadKidItemAgentOsMcpEnv(cwd = process.cwd()): void {
  config({ path: resolve(cwd, 'apps/server/.env') });
  config({ path: resolve(cwd, '.env') });
}

export async function runKidItemAgentOsMcpServer(): Promise<void> {
  loadKidItemAgentOsMcpEnv();
  const context = readKidItemAgentOsMcpContext();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const executor = app.get(AgentOsMcpToolExecutor);
  const server = createKidItemAgentOsMcpServer({ context, executor });
  let closed = false;

  const close = async () => {
    if (closed) return;
    closed = true;
    await server.close();
    await app.close();
  };

  process.once('SIGINT', () => {
    close()
      .then(() => {
        process.exitCode = 0;
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(redactMcpErrorMessage(message));
        process.exitCode = 1;
      });
  });
  process.once('SIGTERM', () => {
    close()
      .then(() => {
        process.exitCode = 0;
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(redactMcpErrorMessage(message));
        process.exitCode = 1;
      });
  });

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
