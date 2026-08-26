import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const roots: string[] = [];
afterEach(async () => {
  vi.doUnmock('node:fs/promises');
  vi.doUnmock('node:path');
  vi.resetModules();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('ClaudeProviderSessionStore', () => {
  it('reads bounded message history directly from provider-owned session state without a KidItem transcript cache', async () => {
    const { ClaudeProviderSessionStore } = await import('./claude-session.store');
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

    const sessions = new ClaudeProviderSessionStore({ loginRoot: root });
    await expect(sessions.read(sessionId)).resolves.toEqual([
      { id: 'user-1', role: 'user', content: 'Provider-owned question', createdAt: '2026-08-23T00:00:00.000Z' },
      { id: 'assistant-1', role: 'assistant', content: 'Provider-owned answer', createdAt: '2026-08-23T00:00:01.000Z' },
      { id: 'assistant-1-tool-1', role: 'tool', content: 'mcp__kiditem__capability_invoke: started', createdAt: '2026-08-23T00:00:01.000Z' },
      { id: 'tool-result-1-tool-0', role: 'tool', content: 'mcp__kiditem__capability_invoke: completed', createdAt: '2026-08-23T00:00:02.000Z' },
    ]);
    expect(JSON.stringify(await sessions.read(sessionId))).not.toContain('must not copy');
    await expect(sessions.read('44444444-4444-4444-8444-444444444444')).rejects.toThrow('claude_provider_history_unavailable');
  });

  it('skips a symlinked session entry but continues to an in-root provider session file', async () => {
    const { ClaudeProviderSessionStore } = await import('./claude-session.store');
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

    await expect(new ClaudeProviderSessionStore({ loginRoot: root }).read(sessionId)).resolves.toEqual([
      { id: 'safe', role: 'assistant', content: 'in-root', createdAt: '2026-08-23T00:00:00.000Z' },
    ]);
  });

  it('fails closed when the provider projects root resolves outside the configured login root', async () => {
    const { ClaudeProviderSessionStore } = await import('./claude-session.store');
    const root = await mkdtemp(join(tmpdir(), 'kiditem-claude-history-'));
    roots.push(root);
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const outside = await mkdtemp(join(tmpdir(), 'kiditem-claude-history-outside-'));
    roots.push(outside);
    await mkdir(join(root, '.claude'), { recursive: true });
    await mkdir(join(outside, 'workspace'), { recursive: true });
    await writeFile(join(outside, 'workspace', `${sessionId}.jsonl`), JSON.stringify({ type: 'assistant', message: { content: 'outside' } }));
    await symlink(outside, join(root, '.claude', 'projects'));

    await expect(new ClaudeProviderSessionStore({ loginRoot: root }).exists(sessionId))
      .rejects.toThrow('claude_provider_history_path_invalid');
  });

  it('removes only the exact provider transcript and its exact sibling sidecar directory', async () => {
    const { ClaudeProviderSessionStore } = await import('./claude-session.store');
    const root = await mkdtemp(join(tmpdir(), 'kiditem-claude-history-'));
    roots.push(root);
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const otherSessionId = '44444444-4444-4444-8444-444444444444';
    const projects = join(root, '.claude', 'projects');
    const project = join(projects, 'gateway-workspace');
    const neighbor = join(projects, 'neighbor-workspace');
    const transcript = join(project, `${sessionId}.jsonl`);
    const sidecars = join(project, sessionId);
    const symlinkedTranscript = join(neighbor, `${sessionId}.jsonl`);
    const outside = join(root, 'outside.jsonl');
    await mkdir(sidecars, { recursive: true });
    await mkdir(join(project, otherSessionId), { recursive: true });
    await mkdir(neighbor, { recursive: true });
    await writeFile(transcript, 'exact transcript');
    await writeFile(join(sidecars, 'sidecar.json'), 'exact sidecar');
    await writeFile(join(project, `${otherSessionId}.jsonl`), 'neighbor session');
    await writeFile(join(project, otherSessionId, 'sidecar.json'), 'neighbor sidecar');
    await writeFile(join(neighbor, `${otherSessionId}.jsonl`), 'other project session');
    await writeFile(outside, 'outside provider artifact');
    await symlink(outside, symlinkedTranscript);

    await expect(new ClaudeProviderSessionStore({ loginRoot: root }).remove(sessionId)).resolves.toBeUndefined();

    await expect(readFile(transcript, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(sidecars, 'sidecar.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(project, `${otherSessionId}.jsonl`), 'utf8')).resolves.toBe('neighbor session');
    await expect(readFile(join(project, otherSessionId, 'sidecar.json'), 'utf8')).resolves.toBe('neighbor sidecar');
    await expect(readFile(join(neighbor, `${otherSessionId}.jsonl`), 'utf8')).resolves.toBe('other project session');
    expect((await lstat(symlinkedTranscript)).isSymbolicLink()).toBe(true);
    await expect(readFile(outside, 'utf8')).resolves.toBe('outside provider artifact');
  });

  it('fails closed before deleting any artifact when multiple exact transcript matches exist', async () => {
    const { ClaudeProviderSessionStore } = await import('./claude-session.store');
    const root = await mkdtemp(join(tmpdir(), 'kiditem-claude-history-'));
    roots.push(root);
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const first = join(root, '.claude', 'projects', 'first');
    const second = join(root, '.claude', 'projects', 'second');
    await mkdir(first, { recursive: true });
    await mkdir(second, { recursive: true });
    await writeFile(join(first, `${sessionId}.jsonl`), 'first exact transcript');
    await writeFile(join(second, `${sessionId}.jsonl`), 'second exact transcript');

    await expect(new ClaudeProviderSessionStore({ loginRoot: root }).remove(sessionId))
      .rejects.toThrow('claude_provider_session_ambiguous');
    await expect(readFile(join(first, `${sessionId}.jsonl`), 'utf8')).resolves.toBe('first exact transcript');
    await expect(readFile(join(second, `${sessionId}.jsonl`), 'utf8')).resolves.toBe('second exact transcript');
  });

  it('treats a missing exact Claude session artifact as an idempotent delete', async () => {
    const { ClaudeProviderSessionStore } = await import('./claude-session.store');
    const root = await mkdtemp(join(tmpdir(), 'kiditem-claude-history-'));
    roots.push(root);
    await mkdir(join(root, '.claude', 'projects'), { recursive: true });

    await expect(new ClaudeProviderSessionStore({ loginRoot: root }).remove('33333333-3333-4333-8333-333333333333'))
      .resolves.toBeUndefined();
  });

  it('rejects a Windows cross-drive canonical transcript before deletion', async () => {
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const loginRoot = 'C:\\kiditem\\login';
    const projects = win32.join(loginRoot, '.claude', 'projects');
    const transcript = win32.join('D:\\outside', `${sessionId}.jsonl`);
    const { ClaudeProviderSessionStore, removeArtifact } = await loadWindowsSessionStore({
      entries: { [projects]: [virtualEntry(`${sessionId}.jsonl`, 'file')] },
      canonicalPaths: {
        [loginRoot]: loginRoot,
        [projects]: projects,
        [win32.join(projects, `${sessionId}.jsonl`)]: transcript,
      },
    });

    await expect(new ClaudeProviderSessionStore({ loginRoot }).remove(sessionId))
      .rejects.toThrow('claude_provider_history_path_invalid');
    expect(removeArtifact).not.toHaveBeenCalled();
  });

  it('rejects a Windows cross-drive canonical sidecar before recursive deletion', async () => {
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const loginRoot = 'C:\\kiditem\\login';
    const projects = win32.join(loginRoot, '.claude', 'projects');
    const workspace = win32.join(projects, 'workspace');
    const sidecars = win32.join('D:\\outside', sessionId);
    const { ClaudeProviderSessionStore, removeArtifact } = await loadWindowsSessionStore({
      entries: {
        [projects]: [virtualEntry('workspace', 'directory')],
        [workspace]: [virtualEntry(sessionId, 'directory')],
      },
      canonicalPaths: {
        [loginRoot]: loginRoot,
        [projects]: projects,
        [win32.join(projects, 'workspace')]: workspace,
        [win32.join(workspace, sessionId)]: sidecars,
      },
    });

    await expect(new ClaudeProviderSessionStore({ loginRoot }).remove(sessionId))
      .rejects.toThrow('claude_provider_history_path_invalid');
    expect(removeArtifact).not.toHaveBeenCalled();
  });
});

type VirtualDirent = Readonly<{
  name: string;
  isSymbolicLink: () => boolean;
  isFile: () => boolean;
  isDirectory: () => boolean;
}>;

function virtualEntry(name: string, kind: 'file' | 'directory'): VirtualDirent {
  return {
    name,
    isSymbolicLink: () => false,
    isFile: () => kind === 'file',
    isDirectory: () => kind === 'directory',
  };
}

async function loadWindowsSessionStore(fixture: Readonly<{
  entries: Readonly<Record<string, readonly VirtualDirent[]>>;
  canonicalPaths: Readonly<Record<string, string>>;
}>) {
  const removeArtifact = vi.fn(async () => undefined);
  vi.resetModules();
  vi.doMock('node:path', () => ({
    dirname: win32.dirname,
    isAbsolute: win32.isAbsolute,
    join: win32.join,
    relative: win32.relative,
  }));
  vi.doMock('node:fs/promises', () => ({
    readdir: async (path: string) => fixture.entries[path] ?? [],
    readFile: async () => { throw new Error('unexpected read'); },
    realpath: async (path: string) => {
      const resolved = fixture.canonicalPaths[path];
      if (resolved) return resolved;
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    },
    rm: removeArtifact,
    stat: async () => { throw new Error('unexpected stat'); },
  }));
  const { ClaudeProviderSessionStore } = await import('./claude-session.store');
  return { ClaudeProviderSessionStore, removeArtifact };
}
