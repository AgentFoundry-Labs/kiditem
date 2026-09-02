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
    await symlink(
      outside,
      join(root, '.claude', 'projects'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

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
    const outside = join(root, process.platform === 'win32' ? 'outside-artifact' : 'outside.jsonl');
    const outsideMarker = process.platform === 'win32' ? join(outside, 'marker.txt') : outside;
    await mkdir(sidecars, { recursive: true });
    await mkdir(join(project, otherSessionId), { recursive: true });
    await mkdir(neighbor, { recursive: true });
    await writeFile(transcript, 'exact transcript');
    await writeFile(join(sidecars, 'sidecar.json'), 'exact sidecar');
    await writeFile(join(project, `${otherSessionId}.jsonl`), 'neighbor session');
    await writeFile(join(project, otherSessionId, 'sidecar.json'), 'neighbor sidecar');
    await writeFile(join(neighbor, `${otherSessionId}.jsonl`), 'other project session');
    if (process.platform === 'win32') {
      await mkdir(outside, { recursive: true });
      await writeFile(outsideMarker, 'outside provider artifact');
      await symlink(outside, symlinkedTranscript, 'junction');
    } else {
      await writeFile(outsideMarker, 'outside provider artifact');
      await symlink(outside, symlinkedTranscript, 'file');
    }

    await expect(new ClaudeProviderSessionStore({ loginRoot: root }).remove(sessionId)).resolves.toBeUndefined();

    await expect(readFile(transcript, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(sidecars, 'sidecar.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(project, `${otherSessionId}.jsonl`), 'utf8')).resolves.toBe('neighbor session');
    await expect(readFile(join(project, otherSessionId, 'sidecar.json'), 'utf8')).resolves.toBe('neighbor sidecar');
    await expect(readFile(join(neighbor, `${otherSessionId}.jsonl`), 'utf8')).resolves.toBe('other project session');
    expect((await lstat(symlinkedTranscript)).isSymbolicLink()).toBe(true);
    await expect(readFile(outsideMarker, 'utf8')).resolves.toBe('outside provider artifact');
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
