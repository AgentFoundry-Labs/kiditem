import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('ClaudeProviderSessionHistoryReader', () => {
  it('reads bounded message history directly from provider-owned session state without a KidItem transcript cache', async () => {
    const { ClaudeProviderSessionHistoryReader } = await import('./claude-session-history.reader');
    const root = await mkdtemp(join(tmpdir(), 'kiditem-claude-history-'));
    roots.push(root);
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const project = join(root, '.claude', 'projects', 'gateway-workspace');
    await mkdir(project, { recursive: true });
    await writeFile(join(project, `${sessionId}.jsonl`), [
      JSON.stringify({ type: 'user', uuid: 'user-1', timestamp: '2026-08-23T00:00:00.000Z', message: { content: 'Provider-owned question' } }),
      JSON.stringify({ type: 'assistant', uuid: 'assistant-1', timestamp: '2026-08-23T00:00:01.000Z', message: { content: [
        { type: 'text', text: 'Provider-owned answer' },
        { type: 'tool_use', id: 'tool-use-1', name: 'mcp__kiditem__capability_invoke', input: { secret: 'must not copy' } },
      ] } }),
      JSON.stringify({ type: 'user', uuid: 'tool-result-1', timestamp: '2026-08-23T00:00:02.000Z', message: { content: [
        { type: 'tool_result', tool_use_id: 'tool-use-1', is_error: false, content: 'must not copy' },
      ] } }),
      JSON.stringify({ type: 'tool', uuid: 'tool-1', raw_result: { secret: 'must not copy' } }),
    ].join('\n'));

    const reader = new ClaudeProviderSessionHistoryReader({ loginRoot: root });
    await expect(reader.read(sessionId)).resolves.toEqual([
      { id: 'user-1', role: 'user', content: 'Provider-owned question', createdAt: '2026-08-23T00:00:00.000Z' },
      { id: 'assistant-1', role: 'assistant', content: 'Provider-owned answer', createdAt: '2026-08-23T00:00:01.000Z' },
      { id: 'assistant-1-tool-1', role: 'tool', content: 'mcp__kiditem__capability_invoke: started', createdAt: '2026-08-23T00:00:01.000Z' },
      { id: 'tool-result-1-tool-0', role: 'tool', content: 'mcp__kiditem__capability_invoke: completed', createdAt: '2026-08-23T00:00:02.000Z' },
    ]);
    expect(JSON.stringify(await reader.read(sessionId))).not.toContain('must not copy');
    await expect(reader.read('44444444-4444-4444-8444-444444444444')).rejects.toThrow('claude_provider_history_unavailable');
  });

  it('skips a symlinked session entry but continues to an in-root provider session file', async () => {
    const { ClaudeProviderSessionHistoryReader } = await import('./claude-session-history.reader');
    const root = await mkdtemp(join(tmpdir(), 'kiditem-claude-history-'));
    roots.push(root);
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const projects = join(root, '.claude', 'projects');
    const outside = join(root, 'outside.jsonl');
    await mkdir(join(projects, 'a-symlink'), { recursive: true });
    await mkdir(join(projects, 'b-real'), { recursive: true });
    await writeFile(outside, JSON.stringify({ type: 'assistant', message: { content: 'outside' } }));
    await symlink(outside, join(projects, 'a-symlink', `${sessionId}.jsonl`));
    await writeFile(join(projects, 'b-real', `${sessionId}.jsonl`), JSON.stringify({ type: 'assistant', uuid: 'safe', timestamp: '2026-08-23T00:00:00.000Z', message: { content: 'in-root' } }));

    await expect(new ClaudeProviderSessionHistoryReader({ loginRoot: root }).read(sessionId)).resolves.toEqual([
      { id: 'safe', role: 'assistant', content: 'in-root', createdAt: '2026-08-23T00:00:00.000Z' },
    ]);
  });

  it('fails closed when the provider projects root resolves outside the configured login root', async () => {
    const { ClaudeProviderSessionHistoryReader } = await import('./claude-session-history.reader');
    const root = await mkdtemp(join(tmpdir(), 'kiditem-claude-history-'));
    roots.push(root);
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const outside = await mkdtemp(join(tmpdir(), 'kiditem-claude-history-outside-'));
    roots.push(outside);
    await mkdir(join(root, '.claude'), { recursive: true });
    await mkdir(join(outside, 'workspace'), { recursive: true });
    await writeFile(join(outside, 'workspace', `${sessionId}.jsonl`), JSON.stringify({ type: 'assistant', message: { content: 'outside' } }));
    await symlink(outside, join(root, '.claude', 'projects'));

    await expect(new ClaudeProviderSessionHistoryReader({ loginRoot: root }).exists(sessionId))
      .rejects.toThrow('claude_provider_history_path_invalid');
  });
});
