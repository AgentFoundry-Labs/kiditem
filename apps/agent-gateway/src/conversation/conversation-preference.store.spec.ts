import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('ConversationPreferenceStore', () => {
  it('returns the exact empty installation-local document when no file exists', async () => {
    const { ConversationPreferenceStore } = await import('./conversation-preference.store');
    const store = new ConversationPreferenceStore({ stateRoot: await fixtureRoot(), platform: 'macos' });

    await expect(store.read()).resolves.toEqual({ schemaVersion: 1, contexts: {} });
  });

  it('sets only the exact context and provider entry without deriving fallback preferences', async () => {
    const { ConversationPreferenceStore } = await import('./conversation-preference.store');
    const store = new ConversationPreferenceStore({ stateRoot: await fixtureRoot(), platform: 'macos' });

    await store.set({ context: 'general', runtime: 'codex_cli', model: 'gpt-5.6', reasoningEffort: 'medium' });
    await store.set({ context: 'sourcing', runtime: 'claude_cli', model: 'claude-opus-4-6', reasoningEffort: 'high' });

    await expect(store.read()).resolves.toEqual({
      schemaVersion: 1,
      contexts: {
        general: { codex_cli: { model: 'gpt-5.6', reasoningEffort: 'medium' } },
        sourcing: { claude_cli: { model: 'claude-opus-4-6', reasoningEffort: 'high' } },
      },
    });
  });

  it('serializes concurrent different-entry and same-entry writes without dropping either prior state or call order', async () => {
    const { ConversationPreferenceStore } = await import('./conversation-preference.store');
    const store = new ConversationPreferenceStore({ stateRoot: await fixtureRoot(), platform: 'macos' });

    await Promise.all([
      store.set({ context: 'general', runtime: 'codex_cli', model: 'gpt-5.6', reasoningEffort: 'medium' }),
      store.set({ context: 'sourcing', runtime: 'claude_cli', model: 'claude-opus-4-6', reasoningEffort: 'high' }),
    ]);
    const first = store.set({ context: 'general', runtime: 'codex_cli', model: 'gpt-5.6', reasoningEffort: 'low' });
    const second = store.set({ context: 'general', runtime: 'codex_cli', model: 'gpt-5.7', reasoningEffort: 'xhigh' });

    await expect(first).resolves.toMatchObject({
      contexts: { general: { codex_cli: { model: 'gpt-5.6', reasoningEffort: 'low' } } },
    });
    await expect(second).resolves.toEqual({
      schemaVersion: 1,
      contexts: {
        general: { codex_cli: { model: 'gpt-5.7', reasoningEffort: 'xhigh' } },
        sourcing: { claude_cli: { model: 'claude-opus-4-6', reasoningEffort: 'high' } },
      },
    });
    await expect(store.read()).resolves.toEqual({
      schemaVersion: 1,
      contexts: {
        general: { codex_cli: { model: 'gpt-5.7', reasoningEffort: 'xhigh' } },
        sourcing: { claude_cli: { model: 'claude-opus-4-6', reasoningEffort: 'high' } },
      },
    });
  });

  it('fails closed for invalid JSON, unknown fields, and unsupported schema versions', async () => {
    const { ConversationPreferenceStore } = await import('./conversation-preference.store');
    const root = await fixtureRoot();
    const file = join(root, 'conversation-preferences.json');
    const store = new ConversationPreferenceStore({ stateRoot: root, platform: 'macos' });

    await writeFile(file, '{not-json', 'utf8');
    await expect(store.read()).rejects.toThrow('gateway_conversation_preferences_invalid');

    await writeFile(file, JSON.stringify({ schemaVersion: 1, contexts: {}, unknown: true }), 'utf8');
    await expect(store.read()).rejects.toThrow('gateway_conversation_preferences_invalid');

    await writeFile(file, JSON.stringify({ schemaVersion: 2, contexts: {} }), 'utf8');
    await expect(store.read()).rejects.toThrow('gateway_conversation_preferences_invalid');
  });

  it('keeps the prior preference document readable when the atomic rename fails', async () => {
    const { ConversationPreferenceStore } = await import('./conversation-preference.store');
    const storage = inMemoryFilesystem();
    const store = new ConversationPreferenceStore({
      stateRoot: await fixtureRoot(), platform: 'macos', filesystem: storage.filesystem as never,
    });
    const before = { context: 'general' as const, runtime: 'codex_cli' as const, model: 'gpt-5.6', reasoningEffort: 'medium' };
    await store.set(before);
    storage.failRename = true;

    await expect(store.set({ ...before, model: 'gpt-5.7', reasoningEffort: 'high' }))
      .rejects.toThrow('gateway_conversation_preferences_write_failed');
    await expect(store.read()).resolves.toEqual({
      schemaVersion: 1,
      contexts: { general: { codex_cli: { model: 'gpt-5.6', reasoningEffort: 'medium' } } },
    });
  });

  it('writes a private macOS document containing only preference fields', async () => {
    const { ConversationPreferenceStore } = await import('./conversation-preference.store');
    const root = await fixtureRoot();
    const store = new ConversationPreferenceStore({ stateRoot: root, platform: 'macos' });
    await store.set({ context: 'general', runtime: 'codex_cli', model: 'gpt-5.6', reasoningEffort: 'medium' });
    const file = join(root, 'conversation-preferences.json');
    const raw = await readFile(file, 'utf8');

    if (process.platform !== 'win32') {
      expect((await stat(root)).mode & 0o777).toBe(0o700);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
    }
    expect(JSON.parse(raw)).toEqual({
      schemaVersion: 1,
      contexts: { general: { codex_cli: { model: 'gpt-5.6', reasoningEffort: 'medium' } } },
    });
    for (const forbidden of [
      'credential',
      'providerConversationRef',
      'transcript',
      'mcpTransportToken',
      'capabilityInput',
      'approval',
      'operationId',
      'operationInput',
      'Operation',
    ]) expect(raw).not.toContain(forbidden);
  });

  it('never reports an already-renamed macOS preference document as failed because a portable fake rejects an obsolete final chmod', async () => {
    const { ConversationPreferenceStore } = await import('./conversation-preference.store');
    const root = await fixtureRoot();
    const storage = inMemoryFilesystem();
    const store = new ConversationPreferenceStore({ stateRoot: root, platform: 'macos', filesystem: storage.filesystem as never });
    await store.set({ context: 'general', runtime: 'codex_cli', model: 'gpt-5.6', reasoningEffort: 'medium' });
    storage.failFinalChmod = true;

    await expect(store.set({ context: 'general', runtime: 'codex_cli', model: 'gpt-5.7', reasoningEffort: 'high' }))
      .resolves.toEqual({
        schemaVersion: 1,
        contexts: { general: { codex_cli: { model: 'gpt-5.7', reasoningEffort: 'high' } } },
      });
    expect(storage.chmodPaths).not.toContain(join(root, 'conversation-preferences.json'));
  });
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kiditem-gateway-preferences-'));
  roots.push(root);
  return root;
}

function inMemoryFilesystem(): {
  filesystem: { [key: string]: unknown };
  failRename: boolean;
  failFinalChmod: boolean;
  chmodPaths: string[];
} {
  const files = new Map<string, string>();
  const result = {
    failRename: false,
    failFinalChmod: false,
    chmodPaths: [] as string[],
    filesystem: {
      mkdir: async () => undefined,
      chmod: async (path: string) => {
        result.chmodPaths.push(path);
        if (result.failFinalChmod && path.endsWith('conversation-preferences.json')) throw new Error('final chmod denied');
      },
      readFile: async (path: string) => {
        const value = files.get(path);
        if (value === undefined) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        return value;
      },
      writeFile: async (path: string, value: string) => { files.set(path, value); },
      rename: async (from: string, to: string) => {
        if (result.failRename) throw new Error('rename failed');
        const value = files.get(from);
        if (value === undefined) throw new Error('temp missing');
        files.set(to, value);
        files.delete(from);
      },
      unlink: async (path: string) => { files.delete(path); },
    },
  };
  return result;
}
