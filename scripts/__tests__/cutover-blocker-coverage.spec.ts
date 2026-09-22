import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { validateCoverage } from '../check-cutover-blocker-coverage.mjs';
import { dataMigrations } from '../data-migrations';
import { KEPT_TABLES } from '../data-migrations/helpers/dependent-row-removal';
import type { DataMigration } from '../data-migrations/types';
import { resetAbsoluteProductAbc } from '../data-migrations/v0.1.31/001_reset_absolute_product_abc';
import {
  removeRowsBlockingRequiredColumnsMigration,
  REQUIRED_COLUMN_CLEANUPS,
  UNIQUE_KEY_CLEANUPS,
  UNIQUE_KEYS_WITHOUT_CLEANUP,
} from '../data-migrations/v0.1.31/014_remove_rows_blocking_required_columns';

// `npm run check:cutover-blocker-coverage` proves in CI that every change the
// schema diff could be stopped by has an entry. This spec proves each entry's
// answer against the migrations it names, so the file and v0.1.31:014's lists
// cannot drift apart in either direction.

type CoverageEntry = {
  train: string;
  table?: string;
  keys?: string[];
  coveredBy?: string;
  acceptedRisk?: string;
  note?: string;
};

const repoRoot = join(__dirname, '..', '..');
const document = JSON.parse(readFileSync(join(repoRoot, 'scripts', 'cutover-blocker-coverage.json'), 'utf8')) as {
  entries: CoverageEntry[];
};
const entries = document.entries;
const REMOVE_ROWS = removeRowsBlockingRequiredColumnsMigration.id;
const sorted = (values: readonly string[]) => [...values].sort();
const uniqueKey = (index: string) => `unique:${index}`;

/** Table names by Prisma client delegate, read from the model files. */
function tablesByDelegate(): Map<string, string> {
  const tables = new Map<string, string>();
  const models = join(repoRoot, 'prisma', 'models');
  for (const file of readdirSync(models).filter((name) => name.endsWith('.prisma'))) {
    const source = readFileSync(join(models, file), 'utf8');
    for (const match of source.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
      const [, model, body] = match;
      tables.set(`${model![0]!.toLowerCase()}${model!.slice(1)}`, body!.match(/@@map\("([^"]+)"\)/)?.[1] ?? model!);
    }
  }
  return tables;
}

/** The tables a migration deletes every row from with an unfiltered `deleteMany`. */
async function tablesEmptiedBy(migration: DataMigration): Promise<string[]> {
  const delegates: string[] = [];
  const tx = new Proxy({}, {
    get(_target, property) {
      if (typeof property !== 'string' || property === 'then') return undefined;
      if (property === '$queryRaw') return async () => [{ present: false }];
      if (property === '$executeRaw') return async () => 0;
      return {
        deleteMany: async (args?: unknown) => {
          if (args === undefined) delegates.push(property);
          return { count: 0 };
        },
      };
    },
  });
  await migration.run(tx as unknown as Prisma.TransactionClient, { target: 'local' });
  const tables = tablesByDelegate();
  return delegates.map((delegate) => {
    const table = tables.get(delegate);
    if (!table) throw new Error(`No Prisma model for delegate ${delegate}`);
    return table;
  });
}

describe('scripts/cutover-blocker-coverage.json', () => {
  it('matches the coverage file schema for this checkout', () => {
    const version = readFileSync(join(repoRoot, 'VERSION'), 'utf8').trim();
    expect(validateCoverage(document, { headVersion: version }).errors).toEqual([]);
  });

  it('names a registered pre-schema migration of the same train in every coveredBy', () => {
    const covered = entries.filter((entry) => entry.coveredBy !== undefined);
    expect(covered.length).toBeGreaterThan(0);
    for (const entry of covered) {
      const migration = dataMigrations.find((candidate) => candidate.id === entry.coveredBy);
      expect(migration, entry.coveredBy).toBeDefined();
      expect(migration!.phase, entry.coveredBy).toBe('pre-schema');
      expect(migration!.releaseVersion, entry.coveredBy).toBe(entry.train);
    }
  });

  it('never names a table ADR-0010 carries through every cutover', () => {
    for (const entry of entries.filter((candidate) => candidate.table !== undefined)) {
      expect(KEPT_TABLES, entry.table).not.toContain(entry.table);
    }
  });

  it("points a table at 014 exactly when 014's required-column list empties it", () => {
    const tables = entries
      .filter((entry) => entry.coveredBy === REMOVE_ROWS && entry.table !== undefined)
      .map((entry) => entry.table!);
    expect(sorted(tables)).toEqual(sorted(REQUIRED_COLUMN_CLEANUPS.map((cleanup) => cleanup.table)));
  });

  it("points a key at 014 exactly when 014's unique-key list reduces it to one row", () => {
    const keys = entries
      .filter((entry) => entry.coveredBy === REMOVE_ROWS)
      .flatMap((entry) => entry.keys ?? []);
    expect(sorted(keys)).toEqual(sorted(UNIQUE_KEY_CLEANUPS.map((cleanup) => uniqueKey(cleanup.index))));
  });

  it("accepts a key 014's train adds only as 014 leaves it, with 014's reason", () => {
    const train = removeRowsBlockingRequiredColumnsMigration.releaseVersion;
    const accepted = entries.filter((entry) => entry.train === train && entry.acceptedRisk !== undefined);
    for (const entry of accepted) {
      for (const key of (entry.keys ?? []).filter((candidate) => candidate.startsWith('unique:'))) {
        const reason = UNIQUE_KEYS_WITHOUT_CLEANUP[key.slice('unique:'.length)];
        expect(reason, `${key} must be in UNIQUE_KEYS_WITHOUT_CLEANUP`).toBeDefined();
        expect(entry.acceptedRisk, key).toContain(reason);
      }
    }
    // The other way: a key 014 leaves alone is never claimed as covered by it,
    // and needs no entry when the check clears it or a table entry covers its
    // table. The check fails on any other one that has no entry.
    const claimedBy014 = new Set(entries.filter((entry) => entry.coveredBy === REMOVE_ROWS).flatMap((entry) => entry.keys ?? []));
    for (const index of Object.keys(UNIQUE_KEYS_WITHOUT_CLEANUP)) {
      expect(claimedBy014.has(uniqueKey(index)), index).toBe(false);
    }
  });

  it('points a table at 001 only when 001 deletes every one of its rows', async () => {
    const emptied = await tablesEmptiedBy(resetAbsoluteProductAbc);
    expect(emptied).toEqual(expect.arrayContaining([
      'master_product_abc_evaluations',
      'master_product_abc_grade_histories',
    ]));
    const tables = entries
      .filter((entry) => entry.coveredBy === resetAbsoluteProductAbc.id && entry.table !== undefined)
      .map((entry) => entry.table!);
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) expect(emptied, table).toContain(table);
  });
});
