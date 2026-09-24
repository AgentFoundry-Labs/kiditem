import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareToAllowlist,
  parseAllowlist,
  planDataMigrationTypeCheck,
} from '../check-data-migration-types.mjs';

const INDEX = `
import { a } from "./v0.1.30/001_active";
import { b } from './v0.1.31/002_active';
import retired from "./retired.json";
export { helper } from "./v0.1.0/002_exempt_but_reexported";
`;

test('excludes retired sources and unregistered pre-retirement files, keeps registered ones', () => {
  const plan = planDataMigrationTypeCheck({
    versionFiles: [
      'scripts/data-migrations/v0.1.0/001_exempt.ts',
      'scripts/data-migrations/v0.1.0/002_exempt_but_reexported.ts',
      'scripts/data-migrations/v0.1.26/001_retired.ts',
      'scripts/data-migrations/v0.1.30/001_active.ts',
      'scripts/data-migrations/v0.1.31/002_active.ts',
    ],
    indexSource: INDEX,
    retired: [{ sourcePath: 'scripts/data-migrations/v0.1.26/001_retired.ts' }],
  });

  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.retired, ['scripts/data-migrations/v0.1.26/001_retired.ts']);
  assert.deepEqual(plan.unregistered, ['scripts/data-migrations/v0.1.0/001_exempt.ts']);
  assert.deepEqual(plan.exclude, [
    'scripts/data-migrations/v0.1.0/001_exempt.ts',
    'scripts/data-migrations/v0.1.26/001_retired.ts',
  ]);
});

test('fails when a retired entry is still registered or its source is missing', () => {
  const plan = planDataMigrationTypeCheck({
    versionFiles: ['scripts/data-migrations/v0.1.30/001_active.ts'],
    indexSource: INDEX,
    retired: [
      { sourcePath: 'scripts/data-migrations/v0.1.30/001_active.ts' },
      { sourcePath: 'scripts/data-migrations/v0.1.19/001_gone.ts' },
    ],
  });

  assert.deepEqual(plan.errors, [
    'scripts/data-migrations/v0.1.30/001_active.ts is retired but still registered in index.ts',
    'scripts/data-migrations/v0.1.19/001_gone.ts is retired but its source file is missing',
  ]);
});

const ALLOWLIST = parseAllowlist(`
# comment
scripts/data-migrations/v0.1.25/004_old.ts 1 promoted in 0.1.25; never executes on a fresh DB
`);

test('parses allowlist lines as path, error count, and reason', () => {
  assert.deepEqual([...ALLOWLIST.entries()], [
    ['scripts/data-migrations/v0.1.25/004_old.ts', { count: 1, reason: 'promoted in 0.1.25; never executes on a fresh DB' }],
  ]);
  assert.throws(() => parseAllowlist('scripts/x.ts 1'), /reason/);
  assert.throws(() => parseAllowlist('scripts/x.ts one because'), /count/);
});

test('an error in a file that is not allowlisted fails', () => {
  const counts = new Map([
    ['scripts/data-migrations/v0.1.25/004_old.ts', 1],
    ['scripts/data-migrations/v0.1.31/030_new.ts', 2],
  ]);
  assert.deepEqual(compareToAllowlist({ counts, allowlist: ALLOWLIST }), [
    'scripts/data-migrations/v0.1.31/030_new.ts: 2 type error(s) and no allowlist entry',
  ]);
});

test('an allowlisted file passes at its recorded count and fails above it', () => {
  assert.deepEqual(
    compareToAllowlist({ counts: new Map([['scripts/data-migrations/v0.1.25/004_old.ts', 1]]), allowlist: ALLOWLIST }),
    [],
  );
  assert.deepEqual(
    compareToAllowlist({ counts: new Map([['scripts/data-migrations/v0.1.25/004_old.ts', 2]]), allowlist: ALLOWLIST }),
    ['scripts/data-migrations/v0.1.25/004_old.ts: 2 type error(s), allowlist records 1'],
  );
});

test('an allowlisted file with no errors fails so the list cannot go stale', () => {
  assert.deepEqual(compareToAllowlist({ counts: new Map(), allowlist: ALLOWLIST }), [
    'scripts/data-migrations/v0.1.25/004_old.ts: allowlisted with 1 error(s) but now has 0; remove or lower the entry',
  ]);
});
