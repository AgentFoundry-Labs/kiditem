import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// ADR-0009: a ledger reader under `apps/server/src/**/read/` is an exported
// pure function over the caller's transaction client. It imports no adapter
// or application code and nothing from NestJS, and it takes no lock: the
// calling service owns the transaction and its locks, and an owner exports
// those from `<owner>/transaction/`.

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const SERVER_SRC = 'apps/server/src';
const READER_GLOBS = [
  '--type', 'ts',
  '--glob', '**/read/**',
  '--glob', '!**/__tests__/**',
  '--glob', '!**/*.spec.ts',
];

// `rg` reads stdin when it is given no path and stdin is a pipe, so every
// call names the scan root and closes stdin.
function rg(args: string[]): string[] {
  try {
    return execFileSync('rg', [...args, SERVER_SRC], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split('\n')
      .filter(Boolean)
      .sort();
  } catch (error: unknown) {
    if ((error as { status?: number }).status === 1) return [];
    throw error;
  }
}

function readerLinesMatching(pattern: string): string[] {
  return rg(['--line-number', '--no-heading', '--color', 'never', ...READER_GLOBS, '-e', pattern]);
}

describe('ledger reader purity (ADR-0009)', () => {
  it('scans every reader module and no test', () => {
    const files = rg(['--files', ...READER_GLOBS]);

    expect(files).toEqual(expect.arrayContaining([
      'apps/server/src/advertising/read/ad-target-facts.ts',
      'apps/server/src/analytics/sellpia-sales/read/sellpia-sales-daily-facts.ts',
      'apps/server/src/channels/read/rocket-po-catalog.reader.ts',
      'apps/server/src/inventory/read/inventory-availability.ts',
    ]));
    expect(files.filter((file) => file.includes('__tests__') || file.endsWith('.spec.ts')))
      .toEqual([]);
  });

  it('imports no adapter or application code', () => {
    expect(readerLinesMatching(
      String.raw`(from|import\()\s*['"][^'"]*/(adapter|application)/`,
    )).toEqual([]);
  });

  it('imports nothing from NestJS', () => {
    expect(readerLinesMatching(String.raw`['"]@nestjs/`)).toEqual([]);
  });

  it('calls no lock helper; the caller locks and passes the evidence', () => {
    expect(readerLinesMatching(
      String.raw`\b(lock|locked|withLocked)[A-Z_]\w*\s*\(|\b\w*(advisoryLock|acquire\w*Lock|releaseLock)\s*\(`,
    )).toEqual([]);
  });

  it('issues no advisory or row lock SQL', () => {
    expect(readerLinesMatching(
      String.raw`pg_(try_)?advisory|\bFOR\s+(NO\s+KEY\s+)?UPDATE\b|\bFOR\s+(KEY\s+)?SHARE\b`,
    )).toEqual([]);
  });
});
