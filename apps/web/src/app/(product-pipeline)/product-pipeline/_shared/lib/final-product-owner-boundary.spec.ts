import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webSourceRoot = resolve(
  process.cwd().endsWith('/apps/web') ? process.cwd() : resolve(process.cwd(), 'apps/web'),
  'src',
);

function productionFiles(dir = webSourceRoot): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return productionFiles(path);
    if (!/\.(ts|tsx)$/.test(entry) || /\.(spec|test)\./.test(entry)) return [];
    return [path];
  });
}

function violations(pattern: RegExp): string[] {
  return productionFiles()
    .filter((path) => pattern.test(readFileSync(path, 'utf8')))
    .map((path) => path.slice(webSourceRoot.length + 1));
}

describe('final product owner boundary', () => {
  it('has no production calls to the removed products API', () => {
    expect(violations(/\/api\/products(?:[?'"`]|\/\$\{)/)).toEqual([]);
  });

  it('has no ContentWorkspace targetMaster compatibility alias', () => {
    expect(violations(/targetMasterId/)).toEqual([]);
  });
});
