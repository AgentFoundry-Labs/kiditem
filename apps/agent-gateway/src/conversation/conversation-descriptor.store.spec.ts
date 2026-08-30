import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OrganizationIdSchema } from '@kiditem/shared/identifiers';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('ConversationDescriptorStore', () => {
  it('persists only the bounded descriptor fields in a private atomic JSON file', async () => {
    const { ConversationDescriptorStore } = await import('./conversation-descriptor.store');
    const root = await fixtureRoot();
    const store = new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' });
    const descriptor = fixtureDescriptor();

    await store.create(descriptor);

    expect(await store.list()).toEqual([descriptor]);
    const file = join(root, 'conversations.json');
    if (process.platform !== 'win32') {
      expect((await stat(root)).mode & 0o777).toBe(0o700);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
    }
    const raw = await readFile(file, 'utf8');
    expect(JSON.parse(raw)).toEqual([descriptor]);
    for (const forbidden of [
      'user message must never persist',
      'transcript',
      'mcpResult',
      'invocationInput',
      'operationData',
      'mcpTransportToken',
      'bearerToken',
      'providerCredential',
      'authState',
      'workspaceContents',
      'nativeSubagent',
    ]) expect(raw).not.toContain(forbidden);
  });

  it('rejects unknown descriptor fields, duplicate IDs, and invalid provider refs without replacing readable state', async () => {
    const { ConversationDescriptorStore } = await import('./conversation-descriptor.store');
    const root = await fixtureRoot();
    const store = new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' });
    const descriptor = fixtureDescriptor();
    await store.create(descriptor);

    await expect(store.create({ ...descriptor, id: 'conversation-2', message: 'user message must never persist' } as never))
      .rejects.toThrow('gateway_descriptor_invalid');
    await expect(store.create(descriptor)).rejects.toThrow('gateway_descriptor_duplicate');
    await expect(store.create({ ...descriptor, id: 'conversation-3', providerConversationRef: '' }))
      .rejects.toThrow('gateway_descriptor_invalid');
    expect(await store.list()).toEqual([descriptor]);
  });

  it('rejects the 1,001st create before writing and keeps the catalog and mutation tail usable', async () => {
    const { ConversationDescriptorStore } = await import('./conversation-descriptor.store');
    const root = await fixtureRoot();
    const storage = inMemoryFilesystem();
    const store = new ConversationDescriptorStore({ stateRoot: root, platform: 'macos', filesystem: storage.filesystem as never });
    const descriptors = Array.from({ length: 1_000 }, (_, index) => ({
      ...fixtureDescriptor(),
      id: `conversation-${index + 1}`,
      providerConversationRef: `provider-thread-${index + 1}`,
    }));
    for (const descriptor of descriptors) await store.create(descriptor);

    expect(await store.list()).toEqual(descriptors);
    const writeFileCalls = storage.writeFileCalls;
    await expect(store.create({
      ...fixtureDescriptor(),
      id: 'conversation-1001',
      providerConversationRef: 'provider-thread-1001',
    })).rejects.toThrow('gateway_descriptor_limit');
    expect(storage.writeFileCalls).toBe(writeFileCalls);
    expect(await store.list()).toEqual(descriptors);

    const last = descriptors[descriptors.length - 1]!;
    const updated = { ...last, title: 'Updated supplier research', updatedAt: '2026-08-23T00:03:00.000Z' };
    await expect(store.update(last.id, () => updated)).resolves.toEqual(updated);
    expect(await store.list()).toEqual([...descriptors.slice(0, -1), updated]);
  });

  it('serializes concurrent updates so a later mutation retains fields written by an earlier mutation', async () => {
    const { ConversationDescriptorStore } = await import('./conversation-descriptor.store');
    const root = await fixtureRoot();
    const store = new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' });
    const descriptor = fixtureDescriptor();
    await store.create(descriptor);

    const renamed = store.update(descriptor.id, (current) => ({
      ...current,
      title: 'Renamed research',
      updatedAt: '2026-08-23T00:01:00.000Z',
    }));
    const metadata = store.update(descriptor.id, (current) => ({
      ...current,
      lastModel: 'gpt-5.6',
      lastReasoningEffort: 'high',
      updatedAt: '2026-08-23T00:02:00.000Z',
    }));

    await expect(renamed).resolves.toMatchObject({ title: 'Renamed research' });
    await expect(metadata).resolves.toEqual({
      ...descriptor,
      title: 'Renamed research',
      lastReasoningEffort: 'high',
      updatedAt: '2026-08-23T00:02:00.000Z',
    });
    expect(await store.list()).toEqual([{
      ...descriptor,
      title: 'Renamed research',
      lastReasoningEffort: 'high',
      updatedAt: '2026-08-23T00:02:00.000Z',
    }]);
  });

  it('removes only a present descriptor and never re-inserts it through a stale update', async () => {
    const { ConversationDescriptorStore } = await import('./conversation-descriptor.store');
    const root = await fixtureRoot();
    const store = new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' });
    const descriptor = fixtureDescriptor();
    await store.create(descriptor);

    await expect(store.removeIfPresent(descriptor.id)).resolves.toBe(true);
    await expect(store.removeIfPresent(descriptor.id)).resolves.toBe(false);
    await expect(store.update(descriptor.id, (current) => ({ ...current, title: 'Must not return' })))
      .rejects.toThrow('gateway_descriptor_not_found');
    expect(await store.list()).toEqual([]);
  });

  it('keeps the prior JSON readable when the final atomic rename fails', async () => {
    const { ConversationDescriptorStore } = await import('./conversation-descriptor.store');
    const root = await fixtureRoot();
    const storage = inMemoryFilesystem();
    const store = new ConversationDescriptorStore({ stateRoot: root, platform: 'macos', filesystem: storage.filesystem });
    const before = fixtureDescriptor();
    await store.create(before);
    storage.failRename = true;

    await expect(store.create({ ...before, id: 'conversation-2', providerConversationRef: 'provider-thread-2' }))
      .rejects.toThrow('gateway_descriptor_write_failed');

    expect(await store.list()).toEqual([before]);
  });

  it('discards a pre-organization catalog wholesale instead of assigning it to a later caller', async () => {
    const { ConversationDescriptorStore } = await import('./conversation-descriptor.store');
    const root = await fixtureRoot();
    const file = join(root, 'conversations.json');
    const { organizationId: _organizationId, ...formerDescriptor } = fixtureDescriptor();
    await writeFile(file, JSON.stringify([formerDescriptor]));

    const store = new ConversationDescriptorStore({ stateRoot: root, platform: 'macos' });

    await expect(store.list()).resolves.toEqual([]);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual([]);
  });

  it('keeps the prior JSON readable when writing the temporary replacement fails', async () => {
    const { ConversationDescriptorStore } = await import('./conversation-descriptor.store');
    const root = await fixtureRoot();
    const storage = inMemoryFilesystem();
    const store = new ConversationDescriptorStore({ stateRoot: root, platform: 'macos', filesystem: storage.filesystem as never });
    const before = fixtureDescriptor();
    await store.create(before);
    storage.failWrite = true;

    await expect(store.create({ ...before, id: 'conversation-2', providerConversationRef: 'provider-thread-2' }))
      .rejects.toThrow('gateway_descriptor_write_failed');

    expect(await store.list()).toEqual([before]);
  });

  it('never reports an already-renamed macOS catalog as failed because a portable fake rejects an obsolete final chmod', async () => {
    const { ConversationDescriptorStore } = await import('./conversation-descriptor.store');
    const root = await fixtureRoot();
    const storage = inMemoryFilesystem();
    const store = new ConversationDescriptorStore({ stateRoot: root, platform: 'macos', filesystem: storage.filesystem as never });
    const before = fixtureDescriptor();
    const after = { ...before, title: 'Committed rename', updatedAt: '2026-08-23T00:01:00.000Z' };
    await store.create(before);
    storage.failFinalChmod = true;

    await expect(store.update(before.id, () => after)).resolves.toEqual(after);
    expect(await store.list()).toEqual([after]);
    expect(storage.chmodPaths).not.toContain(join(root, 'conversations.json'));
  });
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kiditem-gateway-descriptors-'));
  roots.push(root);
  return root;
}

function fixtureDescriptor() {
  return {
    id: 'conversation-1',
    organizationId: OrganizationIdSchema.parse('organization-1'),
    runtime: 'codex_cli' as const,
    providerConversationRef: 'provider-thread-1',
    agentKey: 'sourcing' as const,
    createTitle: 'Supplier research',
    title: 'Supplier research',
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
    lastModel: 'gpt-5.6',
    lastReasoningEffort: 'medium',
  };
}

function inMemoryFilesystem(): {
  filesystem: { [key: string]: unknown };
  failRename: boolean;
  failWrite: boolean;
  failFinalChmod: boolean;
  chmodPaths: string[];
  writeFileCalls: number;
} {
  const files = new Map<string, string>();
  const result = {
    failRename: false,
    failWrite: false,
    failFinalChmod: false,
    chmodPaths: [] as string[],
    writeFileCalls: 0,
    filesystem: {
      mkdir: async () => undefined,
      chmod: async (path: string) => {
        result.chmodPaths.push(path);
        if (result.failFinalChmod && path.endsWith('conversations.json')) throw new Error('final chmod denied');
      },
      readFile: async (path: string) => {
        const value = files.get(path);
        if (value === undefined) {
          const error = Object.assign(new Error('missing'), { code: 'ENOENT' });
          throw error;
        }
        return value;
      },
      writeFile: async (path: string, value: string) => {
        result.writeFileCalls += 1;
        if (result.failWrite) throw new Error('temporary write failed');
        files.set(path, value);
      },
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
