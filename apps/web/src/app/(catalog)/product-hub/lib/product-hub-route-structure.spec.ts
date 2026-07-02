import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const catalogRoot = resolve(currentDir, '..', '..');

const sourceExtensions = new Set(['.ts', '.tsx', '.md']);

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      return walkFiles(fullPath);
    }

    const extension = fullPath.slice(fullPath.lastIndexOf('.'));
    return sourceExtensions.has(extension) ? [fullPath] : [];
  });
}

describe('product hub route structure', () => {
  it('keeps product-hub implementation out of the legacy products route scope', () => {
    expect(existsSync(join(catalogRoot, 'products'))).toBe(false);

    const legacyAbsoluteImport = ['@/app/(catalog)', 'products'].join('/');
    const legacyParentImport = ['..', 'products'].join('/');
    const legacyGrandparentImport = ['..', '..', 'products'].join('/');

    const legacyImportReferences = walkFiles(catalogRoot)
      .map((file) => ({
        file,
        source: readFileSync(file, 'utf8'),
      }))
      .filter(({ source }) => (
        source.includes(legacyAbsoluteImport)
        || source.includes(legacyParentImport)
        || source.includes(legacyGrandparentImport)
      ))
      .map(({ file }) => file.replace(`${catalogRoot}/`, ''));

    expect(legacyImportReferences).toEqual([]);
  });
});
