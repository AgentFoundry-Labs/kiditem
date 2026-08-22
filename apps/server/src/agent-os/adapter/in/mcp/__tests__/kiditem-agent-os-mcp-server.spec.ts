import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { AgentOsRuntimeError } from '../../../../domain/agent-os.errors';
import type { AgentOsMcpToolExecutionPort } from '../../../../application/port/in/capability/agent-os-mcp-tool-execution.port';
import {
  createKidItemAgentOsMcpApplicationContext,
  createKidItemAgentOsMcpServer,
  readKidItemAgentOsMcpContext,
  toMcpText,
} from '../kiditem-agent-os-mcp-server';

const RUNTIME_ENV = { KIDITEM_RUNTIME_CREDENTIAL: 'runtime-credential' };

function executor(): AgentOsMcpToolExecutionPort {
  return {
    execute: vi.fn().mockResolvedValue({ status: 'succeeded' }),
    listAvailableTools: vi.fn().mockResolvedValue([
      { name: 'agent_os_read_context' },
      { name: 'analytics_read_overview' },
    ]),
  } as unknown as AgentOsMcpToolExecutionPort;
}

function registeredTools(server: unknown) {
  return (server as { _registeredTools: Record<string, unknown> })._registeredTools;
}

describe('KidItem Agent OS MCP server', () => {
  it('accepts only an issued runtime credential and rejects legacy caller context env', () => {
    expect(readKidItemAgentOsMcpContext(RUNTIME_ENV)).toEqual({
      credential: 'runtime-credential',
    });

    const legacyPrefix = `${['KIDITEM', 'AGENT', 'OS'].join('_')}_`;
    expect(() => readKidItemAgentOsMcpContext({
      [`${legacyPrefix}ORGANIZATION_ID`]: 'foreign-org',
      [`${legacyPrefix}CONVERSATION_ID`]: 'forged-conversation',
      [`${legacyPrefix}REQUEST_ID`]: 'forged-request',
      [`${legacyPrefix}RUN_ID`]: 'forged-run',
      [`${legacyPrefix}AGENT_INSTANCE_ID`]: 'forged-agent',
    })).toThrow('KIDITEM_RUNTIME_CREDENTIAL');
  });

  it('boots the MCP application context without HTTP grant configuration', async () => {
    const applicationContext = { close: vi.fn() };
    const createApplicationContext = vi.fn().mockReturnValue(applicationContext);

    await expect(createKidItemAgentOsMcpApplicationContext({
      repositoryRoot: '/missing/repository/root',
      createApplicationContext,
      loadApplicationModule: async () => ({ AgentMcpApplicationModule: class TestModule {} }),
    })).resolves.toBe(applicationContext);
  });

  it('registers only authenticated retained MCP tools', async () => {
    const server = await createKidItemAgentOsMcpServer({
      context: { credential: 'runtime-credential' } as never,
      executor: executor(),
    });

    expect(Object.keys(registeredTools(server))).toEqual([
      'agent_os_read_context',
      'analytics_read_overview',
    ]);
    expect(Object.keys(registeredTools(server))).not.toEqual(expect.arrayContaining([
      'agent_os_read_task_graph',
      'agent_os_read_artifacts',
      'agent_os_finalize_task',
      'agent_os_list_agents',
      'agent_os_create_task',
      'agent_os_request_user_input',
      'kiditem_capabilities_list',
      'kiditem_capability_invoke',
    ]));
  });

  it('returns stable redacted errors without credentials', async () => {
    const denied: AgentOsMcpToolExecutionPort = {
      execute: vi.fn().mockRejectedValue(new AgentOsRuntimeError(
        'MCP_EXECUTION_DENIED',
        'DATABASE_URL=postgres://secret-user:secret-pass@example.test/db',
      )),
      listAvailableTools: vi.fn().mockResolvedValue([{ name: 'agent_os_read_context' }]),
    } as unknown as AgentOsMcpToolExecutionPort;
    const server = await createKidItemAgentOsMcpServer({
      context: { credential: 'runtime-credential' } as never,
      executor: denied,
    });
    const tool = registeredTools(server) as Record<string, { handler: (args: Record<string, unknown>) => Promise<unknown> }>;
    const result = await tool.agent_os_read_context.handler({});
    const serialized = JSON.stringify(result);
    expect(serialized).toContain('MCP_EXECUTION_DENIED');
    expect(serialized).not.toContain('secret-user');
  });

  it('serializes successful tool results as MCP text', () => {
    expect(toMcpText({ ok: true })).toEqual({
      content: [{ type: 'text', text: JSON.stringify({ ok: true }) }],
    });
  });
});
