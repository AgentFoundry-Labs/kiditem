import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { CoupangInventoryScrapeAdapter } from './coupang-inventory-scrape.adapter';
import type { CoupangInventoryRow } from '../../../application/port/out/coupang-inventory-scrape.port';

describe('CoupangInventoryScrapeAdapter scrape script', () => {
  it('stops pagination when Wing returns the same inventory page again', async () => {
    const adapter = new CoupangInventoryScrapeAdapter();
    const script = (
      adapter as unknown as { buildScrapeScript(outputPath: string): string }
    ).buildScrapeScript('/tmp/coupang-inventory-test.json');

    const pageRows: CoupangInventoryRow[] = Array.from({ length: 50 }, (_, index) => ({
      inventoryId: `INV-${index + 1}`,
      legacyCode: `LC-${index + 1}`,
      name: `Product ${index + 1}`,
      url: `https://cdn.example.test/${index + 1}.jpg`,
    }));
    let written = '';
    let gotoCount = 0;
    const logs: string[] = [];
    const page = {
      url: () => 'https://wing.coupang.com/vendor-inventory/list?page=1',
      goto: async () => {
        gotoCount += 1;
      },
      waitForSelector: async () => undefined,
      locator: () => ({
        innerText: async () => '',
      }),
      evaluate: async () => pageRows,
    };

    await runInNewContext(script, {
      require: (name: string) => {
        if (name !== 'fs') throw new Error(`unexpected require: ${name}`);
        return {
          writeFileSync: (_path: string, data: string) => {
            written = data;
          },
        };
      },
      context: {
        pages: () => [page],
        newPage: async () => page,
      },
      console: {
        log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
      },
      setTimeout: (callback: () => void) => {
        callback();
        return 0;
      },
    });

    expect(gotoCount).toBe(2);
    expect(JSON.parse(written)).toHaveLength(50);
    expect(logs.some((line) => line.includes('DUPLICATE PAGE 2'))).toBe(true);
  });
});
