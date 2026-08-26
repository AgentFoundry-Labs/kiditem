import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('Claude turn MCP configuration', () => {
  it('writes one Gateway-owned 0600 transient config with the process transport token and static conversation header', async () => {
    const { ClaudeMcpConfigStore } = await import('./claude-mcp-config');
    const root = await mkdtemp(join(tmpdir(), 'kiditem-claude-mcp-'));
    roots.push(root);
    const configs = new ClaudeMcpConfigStore({ stateRoot: root, platform: 'macos' });
    const path = await configs.create({
      turnId: 'turn/with/untrusted-path',
      conversationId: 'conversation-1',
      mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
      mcpTransportToken: 'A'.repeat(43),
    });

    const saved = JSON.parse(await readFile(path, 'utf8'));
    expect(saved).toEqual({
      mcpServers: {
        kiditem: {
          type: 'http',
          url: 'http://127.0.0.1:4000/internal/agent-runtime/mcp',
          headers: {
            Authorization: `Bearer ${'A'.repeat(43)}`,
            'x-kiditem-conversation-id': 'conversation-1',
          },
        },
      },
    });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(path).not.toContain('turn/with');
    await configs.remove(path);
    await expect(stat(path)).rejects.toThrow();
  });

  it('cleans stale per-turn secret files on Gateway startup without touching descriptor state', async () => {
    const { ClaudeMcpConfigStore } = await import('./claude-mcp-config');
    const root = await mkdtemp(join(tmpdir(), 'kiditem-claude-mcp-'));
    roots.push(root);
    const staleRoot = join(root, 'claude-turn-mcp');
    await (await import('node:fs/promises')).mkdir(staleRoot, { recursive: true, mode: 0o700 });
    const stale = join(staleRoot, `${'a'.repeat(64)}.json`);
    await writeFile(stale, `Bearer ${'A'.repeat(43)}`, { mode: 0o600 });

    const configs = new ClaudeMcpConfigStore({ stateRoot: root, platform: 'macos' });
    await configs.cleanup();
    await expect(stat(stale)).rejects.toThrow();
  });

  it('removes a just-written transport config when chmod fails and surfaces startup cleanup I/O failures', async () => {
    const { ClaudeMcpConfigStore } = await import('./claude-mcp-config');
    const root = await mkdtemp(join(tmpdir(), 'kiditem-claude-mcp-'));
    roots.push(root);
    const configs = new ClaudeMcpConfigStore({
      stateRoot: root,
      platform: 'macos',
      filesystem: {
        chmod: async (path) => {
          if (path.endsWith('.json')) throw new Error('chmod denied');
        },
      },
    });
    await expect(configs.create({ turnId: 'turn-1', conversationId: 'conversation-1', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp', mcpTransportToken: 'A'.repeat(43) }))
      .rejects.toThrow('chmod denied');
    await expect((await import('node:fs/promises')).readdir(join(root, 'claude-turn-mcp'))).resolves.toEqual([]);

    const unreadable = new ClaudeMcpConfigStore({
      stateRoot: root,
      platform: 'macos',
      filesystem: { readdir: async () => { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }); } },
    });
    await expect(unreadable.cleanup()).rejects.toThrow('permission denied');
  });

  it('fails closed when a chmod failure cannot unlink the just-written secret file', async () => {
    const { ClaudeMcpConfigStore } = await import('./claude-mcp-config');
    const root = await mkdtemp(join(tmpdir(), 'kiditem-claude-mcp-'));
    roots.push(root);
    const configs = new ClaudeMcpConfigStore({
      stateRoot: root,
      platform: 'macos',
      filesystem: {
        chmod: async (path) => { if (path.endsWith('.json')) throw new Error('chmod denied'); },
        unlink: async () => { throw Object.assign(new Error('unlink denied'), { code: 'EACCES' }); },
      },
    });

    await expect(configs.create({ turnId: 'turn-1', conversationId: 'conversation-1', mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp', mcpTransportToken: 'A'.repeat(43) }))
      .rejects.toThrow('claude_mcp_config_cleanup_failed');
  });
});
