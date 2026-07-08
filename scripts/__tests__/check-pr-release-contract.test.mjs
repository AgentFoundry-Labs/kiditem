import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzePrReleaseContract,
  migrationReleaseFromPath,
} from '../check-pr-release-contract.mjs';

const emptyBody = '## Summary\n';

test('does not require a release decision for code-only changes', () => {
  const result = analyzePrReleaseContract({
    files: ['apps/web/src/app/page.tsx'],
    prBody: emptyBody,
    rootVersion: '0.1.1',
    migrationIndex: '',
  });

  assert.deepEqual(result.requiredReasons, []);
  assert.deepEqual(result.errors, []);
});

test('requires explicit release decision for Prisma model changes', () => {
  const result = analyzePrReleaseContract({
    files: ['prisma/models/ai.prisma'],
    prBody: emptyBody,
    rootVersion: '0.1.1',
    migrationIndex: '',
  });

  assert.match(result.requiredReasons.join('\n'), /Prisma schema/);
  assert.match(result.errors.join('\n'), /Release decision/);
});

test('accepts a release decision for persisted schema changes without version bump', () => {
  const result = analyzePrReleaseContract({
    files: ['prisma/models/ai.prisma'],
    prBody: 'Release decision: keep VERSION 0.1.1; db:push only, no data backfill\n',
    rootVersion: '0.1.1',
    migrationIndex: '',
  });

  assert.deepEqual(result.errors, []);
});

test('validates data migration release folder and registry inclusion', () => {
  assert.equal(
    migrationReleaseFromPath('scripts/data-migrations/v0.1.1/003_backfill.ts'),
    '0.1.1',
  );

  const result = analyzePrReleaseContract({
    files: ['scripts/data-migrations/v0.1.2/004_missing.ts'],
    prBody: 'Release decision: bump VERSION to 0.1.2 for data migration\n',
    rootVersion: '0.1.1',
    migrationIndex: '',
  });

  assert.match(result.errors.join('\n'), /does not match root VERSION 0.1.1/);
  assert.match(result.errors.join('\n'), /is not registered/);
});

test('allows historical migration releases in develop to main promotion PRs', () => {
  const result = analyzePrReleaseContract({
    files: [
      'scripts/data-migrations/v0.1.3/001_release_note.ts',
      'scripts/data-migrations/v0.1.4/001_release_note.ts',
      'scripts/data-migrations/v0.1.7/001_release_note.ts',
    ],
    prBody: 'Release decision: promote develop 0.1.7 to main\n',
    rootVersion: '0.1.7',
    baseVersion: '0.1.2',
    migrationIndex: [
      './v0.1.3/001_release_note',
      './v0.1.4/001_release_note',
      './v0.1.7/001_release_note',
    ].join('\n'),
    allowHistoricalMigrationVersions: true,
  });

  assert.deepEqual(result.errors, []);
});
