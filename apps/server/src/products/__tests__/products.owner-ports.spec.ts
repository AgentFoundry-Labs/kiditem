import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const SERVER_SRC = 'apps/server/src';
const PRODUCTS_ROOT = 'apps/server/src/products';

function rg(args: string): string[] {
  try {
    return execSync(`rg ${args}`, { cwd: REPO_ROOT, encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 1) return [];
    throw err;
  }
}

describe('products owner-side incoming ports', () => {
  it('ProductsModule binds and exports promotion + bundle-stock owner ports', () => {
    const source = readFileSync(
      path.join(REPO_ROOT, PRODUCTS_ROOT, 'products.module.ts'),
      'utf8',
    );

    expect(source).toContain('PRODUCT_MASTER_PROMOTION_PORT');
    expect(source).toContain('PRODUCT_BUNDLE_STOCK_PORT');
    expect(source).toContain(
      '{ provide: PRODUCT_MASTER_PROMOTION_PORT, useExisting: MasterPromotionService }',
    );
    expect(source).toContain(
      '{ provide: PRODUCT_BUNDLE_STOCK_PORT, useExisting: BundleStockService }',
    );
    expect(source).toMatch(/exports:\s*\[[\s\S]*PRODUCT_MASTER_PROMOTION_PORT/);
    expect(source).toMatch(/exports:\s*\[[\s\S]*PRODUCT_BUNDLE_STOCK_PORT/);
  });

  it('cross-owner consumers do not import products application service classes directly', () => {
    const hits = rg(
      [
        '--type ts -n',
        '"products/application/service/(master-promotion|bundle-stock)\\.service"',
        SERVER_SRC,
        "--glob '!apps/server/src/products/**'",
      ].join(' '),
    );

    expect(
      hits,
      [
        'Cross-owner products consumers must use products application/port/in/*',
        'tokens through their local adapter/out/products seam instead of',
        'injecting products service classes directly.',
      ].join(' '),
    ).toEqual([]);
  });
});
