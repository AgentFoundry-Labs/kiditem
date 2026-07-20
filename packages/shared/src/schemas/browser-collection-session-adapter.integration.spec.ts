import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { BrowserCollectionSessionViewSchema } from './browser-collection-session';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const adapterPaths = [
  'extensions/coupang-ads-scraper/background/collection-session.js',
  'extensions/product-scraper/collection-session.js',
  'extensions/order-collector/background/collection-session.js',
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
      async update() {},
    },
    windows: { async update() {} },
    scripting: { async executeScript() {} },
  };
  const context = vm.createContext({ chrome, console, structuredClone });
  const filename = path.resolve(process.cwd(), '../..', relativePath);
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  const adapter = context.KidItemCollectionSession as {
    create(options: Record<string, unknown>): {
      start(input: Record<string, unknown>): Promise<unknown>;
      attachTab(runId: string, tab: { tabId: number; windowId: number }): Promise<unknown>;
      progress(runId: string, progress: Record<string, unknown>): Promise<unknown>;
      requireAttention(runId: string, attention: Record<string, unknown>): Promise<unknown>;
      succeed(runId: string): Promise<unknown>;
      restart(runId: string): Promise<unknown>;
      get(runId: string): Promise<unknown>;
      list(): Promise<unknown[]>;
      openAttentionTab(runId: string): Promise<unknown>;
      cancel(runId: string): Promise<unknown>;
    };
  };
  return adapter.create({
    chrome,
    storageKey: 'sessions',
    webUrlPatterns: [],
    now: () => 100,
  });
}

describe('extension collection-session public contract', () => {
  it.each(adapterPaths)('%s emits shared-schema-compatible views from every public lifecycle surface', async (adapterPath) => {
    const manager = loadManager(adapterPath);
    const started = await manager.start({
      runId: RUN_ID,
      producer: 'sourcing.1688_trend',
      classification: 'background_preferred',
      restartStrategy: 'extension',
      inputIdentity: {
        keywordCount: 2,
        responseBody: 'raw response',
        nested: { raw: true },
        tooLong: 'x'.repeat(501),
      },
    });

    expect(BrowserCollectionSessionViewSchema.parse(started)).toEqual(started);
    const attached = await manager.attachTab(RUN_ID, { tabId: 7, windowId: 2 });
    expect(BrowserCollectionSessionViewSchema.parse(attached)).toEqual(attached);
    const progressed = await manager.progress(RUN_ID, {
      current: 1,
      total: 2,
      completed: 1,
      failed: 0,
      label: 'collecting',
    });
    expect(BrowserCollectionSessionViewSchema.parse(progressed)).toEqual(progressed);
    const attention = await manager.requireAttention(RUN_ID, {
      reason: 'captcha',
      message: 'Complete the challenge',
    });
    expect(BrowserCollectionSessionViewSchema.parse(attention)).toEqual(attention);
    const controlled = await manager.openAttentionTab(RUN_ID);
    expect(BrowserCollectionSessionViewSchema.parse(controlled)).toEqual(controlled);
    const terminal = await manager.succeed(RUN_ID);
    expect(BrowserCollectionSessionViewSchema.parse(terminal)).toEqual(terminal);
    const restarted = await manager.restart(RUN_ID);
    expect(BrowserCollectionSessionViewSchema.parse(restarted)).toEqual(restarted);
    const fetched = await manager.get(RUN_ID);
    expect(BrowserCollectionSessionViewSchema.parse(fetched)).toEqual(fetched);
    const listed = await manager.list();
    expect(listed.map((view) => BrowserCollectionSessionViewSchema.parse(view))).toEqual(listed);
    const cancelled = await manager.cancel(RUN_ID);
    expect(BrowserCollectionSessionViewSchema.parse(cancelled)).toEqual(cancelled);
  });

  it.each(adapterPaths)('%s emits the registered Sellpia inventory producer', async (adapterPath) => {
    const manager = loadManager(adapterPath);
    const started = await manager.start({
      runId: RUN_ID,
      producer: 'inventory.sellpia',
      classification: 'background_preferred',
      restartStrategy: 'extension',
      inputIdentity: {
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourceAccountKey: 'kiditem',
      },
    });

    expect(BrowserCollectionSessionViewSchema.parse(started)).toEqual(started);
    expect(started).toMatchObject({
      runId: RUN_ID,
      producer: 'inventory.sellpia',
      restartStrategy: 'extension',
    });
  });
});
