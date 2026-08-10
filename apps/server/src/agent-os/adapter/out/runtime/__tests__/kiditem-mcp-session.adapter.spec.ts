import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { KidItemMcpSessionAdapter } from '../kiditem-mcp-session.adapter';

const roots: string[] = [];

async function repositoryRoot() {
  const root = await mkdtemp(join(tmpdir(), 'kiditem-mcp-session-'));
  roots.push(root);
  const entry = join(
    root,
    'apps/server/dist/agent-os/adapter/in/mcp/kiditem-agent-os-mcp-server.js',
  );
  await mkdir(join(entry, '..'), { recursive: true });
  await writeFile(entry, '', { mode: 0o600 });
  return { root, entry };
}

describe('KidItemMcpSessionAdapter', () => {
  afterEach(async () => {
    const { rm } = await import('node:fs/promises');
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
  });

  it('prepares one compiled MCP child with only scoped context and disabled workers', async () => {
    const { root, entry } = await repositoryRoot();
    const adapter = new KidItemMcpSessionAdapter(root, { NODE_ENV: 'production' });

    const descriptor = await adapter.prepare({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      requestId: 'request-1',
      runId: 'run-1',
      agentInstanceId: 'instance-1',
      agentType: 'sourcing',
      requestedByUserId: 'user-1',
      homeDirectory: '/tmp/kiditem-run/mcp-home',
    });

    expect(descriptor).toEqual({
      name: 'kiditem',
      command: process.execPath,
      args: [entry],
      env: {
        HOME: '/tmp/kiditem-run/mcp-home',
        CODEX_HOME: '/tmp/kiditem-run/mcp-home',
        ANTHROPIC_API_KEY: '',
        CLAUDE_CODE_OAUTH_TOKEN: '',
        CODEX_API_KEY: '',
        OPENAI_API_KEY: '',
        KIDITEM_AGENT_OS_ENV_ROOT: root,
        KIDITEM_AGENT_OS_ORGANIZATION_ID: 'org-1',
        KIDITEM_AGENT_OS_CONVERSATION_ID: 'conversation-1',
        KIDITEM_AGENT_OS_REQUEST_ID: 'request-1',
        KIDITEM_AGENT_OS_RUN_ID: 'run-1',
        KIDITEM_AGENT_OS_AGENT_INSTANCE_ID: 'instance-1',
        KIDITEM_AGENT_OS_AGENT_TYPE: 'sourcing',
        KIDITEM_AGENT_OS_REQUESTED_BY_USER_ID: 'user-1',
        KIDITEM_AGENT_OS_MCP_CHILD: '1',
        AGENT_RUNTIME_WORKER_ENABLED: '0',
        OPERATION_RUNTIME_WORKER_ENABLED: '0',
        OPERATION_SCHEDULER_ENABLED: '0',
        AI_DIRECT_JOB_WORKER_ENABLED: '0',
      },
    });
    expect(Object.values(descriptor.env)).not.toContain('/Users/operator');
  });

  it('does not use the TypeScript entrypoint outside development', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiditem-mcp-session-'));
    roots.push(root);
    const adapter = new KidItemMcpSessionAdapter(root, { NODE_ENV: 'production' });

    await expect(
      adapter.prepare({
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        requestId: 'request-1',
        runId: 'run-1',
        agentInstanceId: 'instance-1',
        agentType: 'sourcing',
        requestedByUserId: null,
        homeDirectory: '/tmp/kiditem-run/mcp-home',
      }),
    ).rejects.toMatchObject({ code: 'mcp_entrypoint_missing' });
  });
});
