import test from 'node:test';
import assert from 'node:assert/strict';
import { planDataMigrationTypeCheck } from '../check-data-migration-types.mjs';

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

