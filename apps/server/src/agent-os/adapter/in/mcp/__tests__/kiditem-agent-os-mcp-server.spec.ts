import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { AgentOsRuntimeError } from '../../../../domain/agent-os.errors';
import type { AgentOsMcpToolExecutor } from '../../../../application/service/agent-os-mcp-tool-executor.service';
import {
  createKidItemAgentOsMcpServer,
  readKidItemAgentOsMcpContext,
  toMcpText,
} from '../kiditem-agent-os-mcp-server';

const CONTEXT_ENV = {
  KIDITEM_AGENT_OS_ORGANIZATION_ID: 'org_123',
  KIDITEM_AGENT_OS_CONVERSATION_ID: 'conversation_123',
  KIDITEM_AGENT_OS_REQUEST_ID: 'request_123',
  KIDITEM_AGENT_OS_RUN_ID: 'run_123',
  KIDITEM_AGENT_OS_AGENT_INSTANCE_ID: 'instance_123',
  KIDITEM_AGENT_OS_REQUESTED_BY_USER_ID: 'user_123',
};

const CONTEXT = {
  organizationId: 'org_123',
  conversationId: 'conversation_123',
  requestId: 'request_123',
  runId: 'run_123',
  agentInstanceId: 'instance_123',
  agentType: 'manager',
  requestedByUserId: 'user_123',
};

function createExecutor(result: unknown): AgentOsMcpToolExecutor {
  return {
    execute: vi.fn().mockResolvedValue(result),
    listAvailableTools: vi.fn().mockReturnValue([
      { name: 'agent_os_read_context' },
      { name: 'agent_os_read_task_graph' },
      { name: 'agent_os_read_artifacts' },
      { name: 'agent_os_finalize_task' },
      { name: 'agent_os_list_agents' },
      { name: 'agent_os_create_task' },
      { name: 'agent_os_request_user_input' },
    ]),
  } as unknown as AgentOsMcpToolExecutor;
}

function registeredTools(server: unknown) {
  return (
    server as {
      _registeredTools: Record<
        string,
        {
          handler: (...args: unknown[]) => unknown;
          inputSchema?: unknown;
          description?: string;
        }
      >;
    }
  )._registeredTools;
}

function parseTextResult(result: unknown) {
  const content = (result as { content: Array<{ text: string }> }).content;
  return JSON.parse(content[0]?.text ?? 'null');
}

describe('KidItem Agent OS MCP server', () => {
  it('reads valid MCP env context and defaults agentType to manager when unset', () => {
    expect(readKidItemAgentOsMcpContext(CONTEXT_ENV)).toEqual(CONTEXT);
  });

  it('rejects missing or explicitly blank MCP env without leaking secret-like values', () => {
    const missingRunIdEnv = { ...CONTEXT_ENV };
    delete missingRunIdEnv.KIDITEM_AGENT_OS_RUN_ID;

    expect(() =>
      readKidItemAgentOsMcpContext(missingRunIdEnv),
    ).toThrow('Missing required KidItem Agent OS MCP env: KIDITEM_AGENT_OS_RUN_ID');

    expect(() =>
      readKidItemAgentOsMcpContext({
        ...CONTEXT_ENV,
        KIDITEM_AGENT_OS_REQUEST_ID: '   ',
        DATABASE_URL: 'postgres://secret-user:secret-pass@example.test/db',
      }),
    ).toThrow('Missing required KidItem Agent OS MCP env: KIDITEM_AGENT_OS_REQUEST_ID');

    expect(() =>
      readKidItemAgentOsMcpContext({
        ...CONTEXT_ENV,
        KIDITEM_AGENT_OS_AGENT_TYPE: '   ',
      }),
    ).toThrow('Missing required KidItem Agent OS MCP env: KIDITEM_AGENT_OS_AGENT_TYPE');
  });

  it('returns JSON text content for successful results', () => {
    expect(toMcpText({ ok: true, items: [1, 2, 3] })).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ok: true, items: [1, 2, 3] }),
        },
      ],
    });
  });

  it('registers filtered first-class KidItem MCP tools and no generic invoke tools', () => {
    const server = createKidItemAgentOsMcpServer({
      context: CONTEXT,
      executor: createExecutor({ ok: true }),
    });

    const toolNames = Object.keys(registeredTools(server));
    expect(toolNames).toEqual([
      'agent_os_read_context',
      'agent_os_read_task_graph',
      'agent_os_read_artifacts',
      'agent_os_finalize_task',
      'agent_os_list_agents',
      'agent_os_create_task',
      'agent_os_request_user_input',
    ]);
    expect(toolNames).not.toContain('kiditem_capability_invoke');
    expect(toolNames).not.toContain('delegate_task');
    expect(toolNames).not.toContain('terminal.exec');
    expect(toolNames).not.toContain('file.write');
    expect(toolNames).not.toContain('browser_navigate');
  });

  it('delegates registered tool handlers with the expected context, toolName, and arguments', async () => {
    const executor = createExecutor({ status: 'ok' });
    const server = createKidItemAgentOsMcpServer({
      context: CONTEXT,
      executor,
    });
    const tools = registeredTools(server);

    await tools.agent_os_read_context.handler({});
    await tools.agent_os_read_task_graph.handler({});
    const invokeResult = await tools.agent_os_create_task.handler(
      {
        agentType: 'sourcing',
        taskInput: { sourceUrl: 'https://example.test/item' },
      },
      {},
    );

    expect(executor.execute).toHaveBeenNthCalledWith(1, {
      context: CONTEXT,
      toolName: 'agent_os_read_context',
      arguments: {},
    });
    expect(executor.execute).toHaveBeenNthCalledWith(2, {
      context: CONTEXT,
      toolName: 'agent_os_read_task_graph',
      arguments: {},
    });
    expect(executor.execute).toHaveBeenNthCalledWith(3, {
      context: CONTEXT,
      toolName: 'agent_os_create_task',
      arguments: {
        agentType: 'sourcing',
        taskInput: { sourceUrl: 'https://example.test/item' },
      },
    });
    expect(parseTextResult(invokeResult)).toEqual({ status: 'ok' });
  });

  it('registers first-class domain tools with concrete input schemas for Hermes correction loops', async () => {
    const executor = {
      execute: vi.fn().mockResolvedValue({ status: 'succeeded' }),
      listAvailableTools: vi.fn().mockReturnValue([
        { name: 'sourcing_scrape_url' },
        { name: 'listing_create_generation_package' },
      ]),
    } as unknown as AgentOsMcpToolExecutor;
    const server = createKidItemAgentOsMcpServer({
      context: { ...CONTEXT, agentType: 'listing' },
      executor,
    });
    const tools = registeredTools(server);

    expect(tools.sourcing_scrape_url).toEqual(
      expect.objectContaining({
        inputSchema: expect.any(Object),
        description: expect.stringContaining('sourceUrl or url'),
      }),
    );
    expect(tools.listing_create_generation_package).toEqual(
      expect.objectContaining({
        inputSchema: expect.any(Object),
        description: expect.stringContaining('sourceArtifact'),
      }),
    );

    await tools.listing_create_generation_package.handler({
      sourceArtifactIds: ['artifact-sourcing-1'],
      channel: 'coupang',
    });
    expect(executor.execute).toHaveBeenCalledWith({
      context: { ...CONTEXT, agentType: 'listing' },
      toolName: 'listing_create_generation_package',
      arguments: {
        sourceArtifactIds: ['artifact-sourcing-1'],
        channel: 'coupang',
      },
    });
  });

  it('returns redacted MCP error output from tool execution failures', async () => {
    const executor = {
      execute: vi.fn().mockRejectedValue(
        new AgentOsRuntimeError(
          'mcp_capability_failed',
          [
            'failed Bearer bearer-secret sk-test-secret secret-token-value',
            'bearer lowercase-secret',
            'github_pat_abcdefghijklmnopqrstuvwxyz1234567890AB',
            'ghp_abcdefghijklmnopqrstuvwxyz1234567890AB',
            'AKIAABCDEFGHIJKLMNOP AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ1234',
            'xoxb-123-secret API_KEY=supersecret',
            'PASSWORD=password-secret COOKIE=session-secret AUTH=basic-secret',
            'PRIVATE_KEY=private-secret MARKETPLACE_CREDENTIAL=credential-secret',
            'DATABASE_URL=postgres://user:pass@host/db',
            'REDIS_URL=redis://:pass@host',
            'SENTRY_DSN=https://dsn@example.test/1',
          ].join(' '),
        ),
      ),
      listAvailableTools: vi.fn().mockReturnValue([{ name: 'agent_os_read_context' }]),
    } as unknown as AgentOsMcpToolExecutor;
    const server = createKidItemAgentOsMcpServer({ context: CONTEXT, executor });

    const result = await registeredTools(server).agent_os_read_context.handler({});

    expect((result as { isError?: boolean }).isError).toBe(true);
    const parsed = parseTextResult(result);
    expect(parsed).toEqual({
      error: {
        code: 'mcp_capability_failed',
        message: expect.stringContaining('Bearer [REDACTED]'),
      },
    });
    const serialized = JSON.stringify(parsed);
    for (const secret of [
      'bearer-secret',
      'lowercase-secret',
      'sk-test-secret',
      'secret-token-value',
      'github_pat_abcdefghijklmnopqrstuvwxyz1234567890AB',
      'ghp_abcdefghijklmnopqrstuvwxyz1234567890AB',
      'AKIAABCDEFGHIJKLMNOP',
      'AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ1234',
      'xoxb-123-secret',
      'supersecret',
      'password-secret',
      'session-secret',
      'basic-secret',
      'private-secret',
      'credential-secret',
      'postgres://user:pass@host/db',
      'redis://:pass@host',
      'https://dsn@example.test/1',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });
});
