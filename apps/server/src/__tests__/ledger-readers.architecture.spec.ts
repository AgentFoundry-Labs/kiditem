import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// ADR-0009: a ledger reader under `apps/server/src/**/read/` (including
// Products' `adapter/out/persistence/read/` lane) is an exported
// pure function over the caller's transaction client. It imports no adapter,
// application, service or HTTP-bound code, throws no HTTP exception, and takes
// no lock: the calling service owns the transaction and its locks, and an
// owner exports those from `<owner>/transaction/`.

const SERVER_SRC = path.resolve(__dirname, '..');
const READER_GLOBS = [
  '--type', 'ts',
  '--glob', '**/read/**',
  '--glob', '!**/__tests__/**',
  '--glob', '!**/*.spec.ts',
];

/** A module specifier: static, re-export, side-effect, dynamic or require. */
const SPECIFIER = String.raw`\b(from|import|require)\s*\(?\s*['"]`;

type Rule = Readonly<{
  name: string;
  pattern: string;
  /** Reader files that break the rule, one per form it must catch. */
  planted: Readonly<Record<string, string>>;
}>;

const RULES: readonly Rule[] = [
  {
    name: 'imports no adapter or application code',
    pattern: String.raw`${SPECIFIER}[^'"]*/(adapter|application)/`,
    planted: {
      'static-import.ts': "import type { Row } from '../application/port/out/row.port';\n",
      'multi-line-import.ts': "import {\n  readRow,\n} from '../adapter/out/repository/row';\n",
      're-export.ts': "export * from '../application/port/in/row.port';\n",
      'side-effect-import.ts': "import '../adapter/out/repository/register';\n",
      'dynamic-import.ts': "export const load = () => import('../application/service/row-reader');\n",
      'require.ts': "export const legacy = require('../adapter/out/legacy');\n",
    },
  },
  {
    name: 'imports no NestJS or HTTP error module',
    pattern: String.raw`${SPECIFIER}(@nestjs/|@kiditem/shared/server-errors['"])`,
    planted: {
      'nest-import.ts': "import { Injectable } from '@nestjs/common';\n",
      'nest-dynamic-import.ts': "export const nest = () => import('@nestjs/core');\n",
      'app-exception-import.ts': "import { AppException } from '@kiditem/shared/server-errors';\n",
    },
  },
  {
    name: 'imports no service',
    pattern: String.raw`${SPECIFIER}[^'"]*\.service['"]|\bPrismaService\b`,
    planted: {
      'prisma-service-import.ts': "import { PrismaService } from '../../prisma/prisma.service';\n",
      'owner-service-import.ts': "import { RowService } from '../row/row.service';\n",
      'prisma-service-type.ts': 'export type Store = PrismaService;\n',
    },
  },
  {
    name: 'throws no HTTP exception',
    pattern: String.raw`\bnew\s+\w*Exception\s*\(`,
    planted: {
      'nest-exception.ts': "throw new ConflictException('Row changed');\n",
      'app-exception.ts': "throw new AppException(409, 'ROW_CHANGED', 'Row changed');\n",
    },
  },
  {
    name: 'calls no lock helper; the caller locks and passes the evidence',
    pattern: String.raw`\b(lock|locked|withLocked)[A-Z_]\w*\s*\(|\b\w*(advisoryLock|acquire\w*Lock|releaseLock)\s*\(`,
    planted: {
      'owner-lock.ts': 'await lockSellpiaInventory(tx, organizationId);\n',
      'locked-scope.ts': 'await withLockedState(input, (state) => state);\n',
      'advisory-helper.ts': 'await advisoryLock(tx, key);\n',
    },
  },
  {
    name: 'issues no advisory, row or table lock SQL',
    pattern: String.raw`(?i)pg_(try_)?advisory|\bfor\s+(no\s+key\s+)?update\b|\bfor\s+(key\s+)?share\b|\block\s+table\b`,
    planted: {
      'advisory-sql.ts': 'await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(1)`;\n',
      'row-lock-sql.ts': 'await tx.$queryRaw`SELECT id FROM rows WHERE id = ${id} for update`;\n',
      'share-lock-sql.ts': 'await tx.$queryRaw`SELECT id FROM rows FOR KEY SHARE`;\n',
      'table-lock-sql.ts': 'await tx.$executeRaw`LOCK TABLE rows IN SHARE MODE`;\n',
    },
  },
];

/** What every rule must accept: a reader that verifies evidence and throws fact errors. */
const CLEAN_READER = [
  "import { Prisma } from '@prisma/client';",
  "import { FactConflictError } from '../../common/errors/fact-errors';",
  "import { assertSellpiaInventoryLockCovers, type SellpiaInventoryLock } from '../transaction/sellpia-inventory-lock';",
  'export async function readRows(tx: Prisma.TransactionClient, lock: SellpiaInventoryLock, organizationId: string) {',
  '  assertSellpiaInventoryLockCovers(lock, tx, organizationId);',
  "  const rows = await tx.$queryRaw`SELECT id AS \"from\" FROM rows WHERE organization_id = ${organizationId}::uuid`;",
  "  if (!Array.isArray(rows)) throw new FactConflictError('Rows changed');",
  "  if (rows.length > 1_000) throw new Error('Too many rows for an update');",
  '  return rows;',
  '}',
  '',
].join('\n');

// `rg` reads stdin when it is given no path and stdin is a pipe, so every call
// names its root and closes stdin (KID-258).
function rg(root: string, args: readonly string[]): string[] {
  const prefix = `${root}${path.sep}`;
  try {
    return execFileSync('rg', [...args, root], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split('\n')
      .filter(Boolean)
      .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line))
      .sort();
  } catch (error: unknown) {
    if ((error as { status?: number }).status === 1) return [];
    throw error;
  }
}

function readerFiles(root: string): string[] {
  return rg(root, ['--files', ...READER_GLOBS]);
}

/** `file:line:text` for every reader line that breaks the rule. */
function violations(root: string, rule: Rule): string[] {
  return rg(root, [
    '--line-number', '--no-heading', '--color', 'never', '--with-filename',
    ...READER_GLOBS,
    '-e', rule.pattern,
  ]);
}

function violatingFiles(root: string, rule: Rule): string[] {
  return [...new Set(violations(root, rule).map((line) => line.split(':')[0]!))].sort();
}

describe('ledger reader purity (ADR-0009)', () => {
  it('scans every reader module and no test', () => {
    const files = readerFiles(SERVER_SRC);

    expect(files).toEqual(expect.arrayContaining([
      'advertising/read/ad-target-facts.ts',
      'analytics/sellpia-sales/read/sellpia-sales-daily-facts.ts',
      'channels/read/rocket-po-catalog.reader.ts',
      'products/adapter/out/persistence/read/product-source-availability.ts',
    ]));
    expect(files.filter((file) => file.includes('__tests__') || file.endsWith('.spec.ts')))
      .toEqual([]);
  });

  it.each(RULES.map((rule) => [rule.name, rule] as const))('%s', (_name, rule) => {
    expect(violations(SERVER_SRC, rule)).toEqual([]);
  });

  it('reports each planted violation under read/ and nothing else', () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'kiditem-ledger-reader-purity-'));
    const place = (relative: string, content: string) => {
      const file = path.join(fixtureRoot, relative);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content);
    };
    const plantedFiles = (index: number) => Object.keys(RULES[index]!.planted)
      .map((file) => path.join('owner', 'read', `rule-${index}`, file));
    try {
      const everyViolation = RULES.flatMap((rule) => Object.values(rule.planted)).join('');
      RULES.forEach((rule, index) => {
        for (const [file, content] of Object.entries(rule.planted)) {
          place(path.join('owner', 'read', `rule-${index}`, file), content);
        }
      });
      place('owner/read/clean-reader.ts', CLEAN_READER);
      place('owner/read/__tests__/fixture.ts', everyViolation);
      place('owner/read/reader.spec.ts', everyViolation);
      place('owner/adapter/out/repository/not-a-reader.ts', everyViolation);

      expect(readerFiles(fixtureRoot)).toEqual([
        path.join('owner', 'read', 'clean-reader.ts'),
        ...RULES.flatMap((_rule, index) => plantedFiles(index)),
      ].sort());
      RULES.forEach((rule, index) => {
        expect(violatingFiles(fixtureRoot, rule), rule.name)
          .toEqual(plantedFiles(index).sort());
      });
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
