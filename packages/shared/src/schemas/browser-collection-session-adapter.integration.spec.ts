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
  it.each(adapterPaths)('%s emits a shared-schema-compatible public view', async (adapterPath) => {
    const manager = loadManager(adapterPath);
    const view = await manager.start({
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

    expect(BrowserCollectionSessionViewSchema.parse(view)).toEqual(view);
  });
});
