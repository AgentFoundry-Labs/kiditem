import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { BrowserCollectionSessionViewSchema } from './browser-collection-session';

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';
// Anchor on this spec's own location so the adapter loads from any working
// directory (package dir, repo root, `--root packages/shared`).
const REPOSITORY_ROOT = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  '../../../..',
);
const adapterPaths = [
  // The three former extensions are now one loadable root (`kiditem-os`) with
  // a single generated copy of the shared collection-session adapter.
  'extensions/kiditem-os/background/collection-session.js',
];

function loadManager(relativePath: string) {
  const storage: Record<string, unknown> = {};
  const chrome = {
    storage: {
      local: {
        async get(key: string) {
          return { [key]: structuredClone(storage[key]) };
        },
        async set(values: Record<string, unknown>) {
          Object.assign(storage, structuredClone(values));
        },
      },
    },
    tabs: {
      async query() {
        return [];
      },
      async remove() {},
      async update() {},
    },
    windows: { async update() {} },
    scripting: { async executeScript() {} },
  };
  const context = vm.createContext({ chrome, console, structuredClone });
  const filename = path.resolve(REPOSITORY_ROOT, relativePath);
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  const adapter = context.KidItemCollectionSession as {
    create(options: Record<string, unknown>): {
      start(input: Record<string, unknown>): Promise<unknown>;
      attachTab(attemptId: string, tab: { tabId: number; windowId: number }): Promise<unknown>;
      progress(attemptId: string, progress: Record<string, unknown>): Promise<unknown>;
      requireAttention(attemptId: string, attention: Record<string, unknown>): Promise<unknown>;
      get(attemptId: string): Promise<unknown>;
      list(environmentId?: string): Promise<unknown[]>;
      openAttentionTab(attemptId: string): Promise<unknown>;
      cancel(attemptId: string, options?: Record<string, unknown>): Promise<unknown>;
      remove(attemptId: string): Promise<unknown>;
    };
  };
  return {
    manager: adapter.create({
      chrome,
      storageKey: 'sessions',
      webUrlPatterns: [],
      now: () => 100,
    }),
    storage,
  };
}

describe('extension collection-session public contract', () => {
  it.each(adapterPaths)('%s emits shared-schema-compatible views from every public lifecycle surface', async (adapterPath) => {
    const { manager, storage } = loadManager(adapterPath);
    const started = await manager.start({
      environmentId: 'local',
      attemptId: ATTEMPT_ID,
      producer: 'orders.mall',
      attemptToken: 'owner-secret',
      plan: { from: '2025-08-01', to: '2026-08-31' },
    });

    expect(BrowserCollectionSessionViewSchema.parse(started)).toEqual(started);
    expect(started).toEqual({
      environmentId: 'local',
      attemptId: ATTEMPT_ID,
      producer: 'orders.mall',
      progress: {
        current: 0,
        total: 0,
        completed: 0,
        failed: 0,
        label: null,
      },
      attention: null,
    });
    expect(storage).toHaveProperty(['sessions', ATTEMPT_ID]);
    expect(storage).not.toHaveProperty([
      'sessions',
      ATTEMPT_ID,
      '_ownerAttemptToken',
    ]);
    expect(storage).not.toHaveProperty(['sessions', ATTEMPT_ID, '_ownerPlan']);

    const attached = await manager.attachTab(ATTEMPT_ID, { tabId: 7, windowId: 2 });
    expect(BrowserCollectionSessionViewSchema.parse(attached)).toEqual(attached);
    const progressed = await manager.progress(ATTEMPT_ID, {
      current: 1,
      total: 2,
      completed: 1,
      failed: 0,
      label: 'collecting',
    });
    expect(BrowserCollectionSessionViewSchema.parse(progressed)).toEqual(progressed);
    const attention = await manager.requireAttention(ATTEMPT_ID, {
      reason: 'captcha',
      message: 'Complete the challenge',
    });
    expect(BrowserCollectionSessionViewSchema.parse(attention)).toEqual(attention);
    const controlled = await manager.openAttentionTab(ATTEMPT_ID);
    expect(BrowserCollectionSessionViewSchema.parse(controlled)).toEqual(controlled);
    const fetched = await manager.get(ATTEMPT_ID);
    expect(BrowserCollectionSessionViewSchema.parse(fetched)).toEqual(fetched);
    const listed = await manager.list('local');
    expect(listed.map((view) => BrowserCollectionSessionViewSchema.parse(view))).toEqual(listed);
    const cancelled = await manager.cancel(ATTEMPT_ID, { closeManagedTab: true });
    expect(BrowserCollectionSessionViewSchema.parse(cancelled)).toEqual(cancelled);
    expect(await manager.get(ATTEMPT_ID)).toBeNull();

    await manager.start({
      environmentId: 'local',
      attemptId: ATTEMPT_ID,
      producer: 'orders.mall',
    });
    const removed = await manager.remove(ATTEMPT_ID);
    expect(BrowserCollectionSessionViewSchema.parse(removed)).toEqual(removed);
    expect(await manager.get(ATTEMPT_ID)).toBeNull();
  });

  it.each(adapterPaths)('%s emits the registered Sellpia inventory producer', async (adapterPath) => {
    const { manager } = loadManager(adapterPath);
    const started = await manager.start({
      environmentId: 'local',
      attemptId: OTHER_ATTEMPT_ID,
      producer: 'inventory.sellpia',
    });

    expect(BrowserCollectionSessionViewSchema.parse(started)).toEqual(started);
    expect(started).toMatchObject({
      attemptId: OTHER_ATTEMPT_ID,
      producer: 'inventory.sellpia',
    });
    expect(started).not.toHaveProperty('runId');
    expect(started).not.toHaveProperty('status');
  });
});
