import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  analyzePrReleaseContract,
  migrationReleaseFromPath,
  parseAppliedMigrationBaselines,
} from '../check-pr-release-contract.mjs';

const emptyBody = '## Summary\n';

function runGit(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function createAppliedMigrationFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'check-pr-release-contract-'));
  const migrationPath = 'scripts/data-migrations/v0.1.7/002_applied.ts';
  const migrationBytes = Buffer.from('export const applied = true;\n');
  const migrationIndex = [
    'import { applied } from "./v0.1.7/002_applied";',
    'export const dataMigrations = [applied];',
    '',
  ].join('\n');
  mkdirSync(path.join(root, 'scripts/data-migrations/v0.1.7'), { recursive: true });
  writeFileSync(path.join(root, 'VERSION'), '0.1.7\n');
  writeFileSync(
    path.join(root, 'scripts/data-migrations/index.ts'),
    migrationIndex,
  );
  writeFileSync(path.join(root, migrationPath), migrationBytes);
  runGit(root, ['init', '-q']);
  runGit(root, ['config', 'user.email', 'test@example.invalid']);
  runGit(root, ['config', 'user.name', 'Release Contract Test']);
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '-qm', 'applied migration baseline']);
  const baselineCommit = runGit(root, ['rev-parse', 'HEAD']);
  writeFileSync(path.join(root, 'VERSION'), '0.1.6\n');
  runGit(root, ['add', 'VERSION']);
  runGit(root, ['commit', '-qm', 'wrong baseline release']);
  const wrongVersionCommit = runGit(root, ['rev-parse', 'HEAD']);
  writeFileSync(path.join(root, 'scripts/data-migrations/index.ts'), '');
  runGit(root, ['add', 'scripts/data-migrations/index.ts']);
  runGit(root, ['commit', '-qm', 'missing baseline registration']);
  const missingRegistrationCommit = runGit(root, ['rev-parse', 'HEAD']);
  writeFileSync(path.join(root, 'VERSION'), '0.1.7\n');
  writeFileSync(
    path.join(root, 'scripts/data-migrations/index.ts'),
    'import { applied } from "./v0.1.7/002_applied";\n',
  );
  runGit(root, ['add', 'VERSION', 'scripts/data-migrations/index.ts']);
  runGit(root, ['commit', '-qm', 'import without executable registration']);
  const importOnlyCommit = runGit(root, ['rev-parse', 'HEAD']);
  writeFileSync(
    path.join(root, 'scripts/data-migrations/index.ts'),
    migrationIndex,
  );
  writeFileSync(path.join(root, 'VERSION'), '0.1.8\n');
  runGit(root, ['add', 'VERSION', 'scripts/data-migrations/index.ts']);
  runGit(root, ['commit', '-qm', 'start next release train']);
  const unrelatedTree = runGit(root, ['write-tree']);
  const unrelatedCommit = runGit(root, ['commit-tree', unrelatedTree, '-m', 'unrelated root']);
  return {
    root,
    head: runGit(root, ['rev-parse', 'HEAD']),
    migrationPath,
    migrationBytes,
    migrationIndex,
    baselineCommit,
    wrongVersionCommit,
    missingRegistrationCommit,
    importOnlyCommit,
    unrelatedCommit,
  };
}

function createRetiredMigrationFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'check-retired-migration-contract-'));
  const migrationPath = 'scripts/data-migrations/v0.1.7/002_applied.ts';
  const replacementPath = 'scripts/data-migrations/v0.1.8/001_replacement.ts';
  const migrationBytes = Buffer.from([
    'export const applied = {',
    "  id: 'v0.1.7:002_applied',",
    '};',
    '',
  ].join('\n'));
  const replacementBytes = Buffer.from([
    'export const replacement = {',
    "  id: 'v0.1.8:001_replacement',",
    '};',
    '',
  ].join('\n'));
  const baseMigrationIndex = [
    'import { applied } from "./v0.1.7/002_applied";',
    'export const dataMigrations = [applied];',
    '',
  ].join('\n');
  const migrationIndex = [
    'import { replacement } from "./v0.1.8/001_replacement";',
    'export const dataMigrations = [replacement];',
    '',
  ].join('\n');
  mkdirSync(path.join(root, 'scripts/data-migrations/v0.1.7'), { recursive: true });
  mkdirSync(path.join(root, 'scripts/data-migrations/v0.1.8'), { recursive: true });
  writeFileSync(path.join(root, 'VERSION'), '0.1.7\n');
  writeFileSync(path.join(root, 'scripts/data-migrations/index.ts'), baseMigrationIndex);
  writeFileSync(path.join(root, migrationPath), migrationBytes);
  runGit(root, ['init', '-q']);
  runGit(root, ['config', 'user.email', 'test@example.invalid']);
  runGit(root, ['config', 'user.name', 'Release Contract Test']);
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '-qm', 'applied migration baseline']);
  const baselineCommit = runGit(root, ['rev-parse', 'HEAD']);

  writeFileSync(path.join(root, 'VERSION'), '0.1.8\n');
  writeFileSync(path.join(root, 'scripts/data-migrations/index.ts'), migrationIndex);
  writeFileSync(path.join(root, replacementPath), replacementBytes);
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '-qm', 'replace applied migration runtime']);

  const retirement = {
    id: 'v0.1.7:002_applied',
    releaseVersion: '0.1.7',
    name: 'Applied migration',
    sourcePath: migrationPath,
    sourceSha256: createHash('sha256').update(migrationBytes).digest('hex'),
    baselineCommit,
    replacementMigrations: [{
      id: 'v0.1.8:001_replacement',
      path: replacementPath,
    }],
  };
  return {
    root,
    head: runGit(root, ['rev-parse', 'HEAD']),
    migrationPath,
    replacementPath,
    migrationBytes,
    replacementBytes,
    baseMigrationIndex,
    migrationIndex,
    retirement,
  };
}

function destroyFixture(fixture) {
  rmSync(fixture.root, { recursive: true, force: true });
}

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

test('allows deleting an unregistered historical migration', () => {
  const file = 'scripts/data-migrations/v0.1.7/002_legacy_cleanup.ts';
  const result = analyzePrReleaseContract({
    files: [file],
    deletedFiles: [file],
    prBody: 'Release decision: remove an unregistered migration from immutable v0.1.7\n',
    rootVersion: '0.1.25',
    migrationIndex: '',
  });

  assert.match(result.requiredReasons.join('\n'), /durable data migration change/);
  assert.deepEqual(result.errors, []);
});

test('rejects removing a base-registered migration without inactive lineage', () => {
  const fixture = createRetiredMigrationFixture();
  try {
    const result = analyzePrReleaseContract({
      files: ['scripts/data-migrations/index.ts'],
      prBody: 'Release decision: replace the historical migration runtime',
      rootVersion: '0.1.8',
      baseVersion: '0.1.8',
      migrationIndex: fixture.migrationIndex,
      baseMigrationIndex: fixture.baseMigrationIndex,
      promotedVersion: '0.1.7',
      retiredMigrations: [],
      root: fixture.root,
      head: fixture.head,
    });

    assert.match(result.errors.join('\n'), /removed from the executable registry without inactive lineage/);
  } finally {
    destroyFixture(fixture);
  }
});

test('accepts exact inactive lineage to an active replacement without recording application', () => {
  const fixture = createRetiredMigrationFixture();
  try {
    const result = analyzePrReleaseContract({
      files: [
        'scripts/data-migrations/index.ts',
        'scripts/data-migrations/retired.json',
      ],
      prBody: 'Release decision: retain immutable lineage for the replaced migration',
      rootVersion: '0.1.8',
      baseVersion: '0.1.8',
      migrationIndex: fixture.migrationIndex,
      baseMigrationIndex: fixture.baseMigrationIndex,
      promotedVersion: '0.1.7',
      retiredMigrations: [fixture.retirement],
      root: fixture.root,
      head: fixture.head,
      candidateBytesByPath: new Map([
        [fixture.migrationPath, fixture.migrationBytes],
        [fixture.replacementPath, fixture.replacementBytes],
      ]),
    });

    assert.deepEqual(result.errors, []);
  } finally {
    destroyFixture(fixture);
  }
});

test('rejects inactive lineage with changed source bytes or an unregistered replacement', () => {
  const fixture = createRetiredMigrationFixture();
  try {
    const common = {
      files: [
        'scripts/data-migrations/index.ts',
        'scripts/data-migrations/retired.json',
      ],
      prBody: 'Release decision: retain immutable lineage for the replaced migration',
      rootVersion: '0.1.8',
      baseVersion: '0.1.8',
      baseMigrationIndex: fixture.baseMigrationIndex,
      promotedVersion: '0.1.7',
      retiredMigrations: [fixture.retirement],
      root: fixture.root,
      head: fixture.head,
    };
    const changed = analyzePrReleaseContract({
      ...common,
      migrationIndex: fixture.migrationIndex,
      candidateBytesByPath: new Map([
        [fixture.migrationPath, Buffer.concat([fixture.migrationBytes, Buffer.from('changed')])],
        [fixture.replacementPath, fixture.replacementBytes],
      ]),
    });
    assert.match(changed.errors.join('\n'), /candidate bytes differ from the immutable baseline/);
    assert.match(changed.errors.join('\n'), /does not match its inactive lineage SHA-256/);

    const missingReplacement = analyzePrReleaseContract({
      ...common,
      migrationIndex: '',
      candidateBytesByPath: new Map([
        [fixture.migrationPath, fixture.migrationBytes],
        [fixture.replacementPath, fixture.replacementBytes],
      ]),
    });
    assert.match(missingReplacement.errors.join('\n'), /replacement .* is not registered/);
  } finally {
    destroyFixture(fixture);
  }
});

test('allows an open-train migration removal without inactive promoted lineage', () => {
  const fixture = createRetiredMigrationFixture();
  try {
    const result = analyzePrReleaseContract({
      files: ['scripts/data-migrations/index.ts'],
      prBody: 'Release decision: replace an unreleased migration in the open train',
      rootVersion: '0.1.8',
      baseVersion: '0.1.8',
      migrationIndex: fixture.migrationIndex,
      baseMigrationIndex: fixture.baseMigrationIndex,
      promotedVersion: '0.1.6',
      retiredMigrations: [],
      root: fixture.root,
      head: fixture.head,
    });

    assert.deepEqual(result.errors, []);
  } finally {
    destroyFixture(fixture);
  }
});

test('fails closed when promoted lineage cannot be determined for a registry removal', () => {
  const fixture = createRetiredMigrationFixture();
  try {
    const result = analyzePrReleaseContract({
      files: ['scripts/data-migrations/index.ts'],
      prBody: 'Release decision: change the executable migration registry',
      rootVersion: '0.1.8',
      baseVersion: '0.1.8',
      migrationIndex: fixture.migrationIndex,
      baseMigrationIndex: fixture.baseMigrationIndex,
      retiredMigrations: [],
      root: fixture.root,
      head: fixture.head,
    });

    assert.match(result.errors.join('\n'), /cannot verify promoted migration removals/);
  } finally {
    destroyFixture(fixture);
  }
});

test('rejects deleting or altering an existing inactive lineage entry', () => {
  const fixture = createRetiredMigrationFixture();
  const common = {
    files: ['scripts/data-migrations/retired.json'],
    prBody: 'Release decision: retain immutable inactive migration lineage',
    rootVersion: '0.1.8',
    baseVersion: '0.1.8',
    migrationIndex: fixture.migrationIndex,
    baseMigrationIndex: fixture.migrationIndex,
    promotedVersion: '0.1.7',
    baseRetiredMigrations: [fixture.retirement],
    root: fixture.root,
    head: fixture.head,
    candidateBytesByPath: new Map([
      [fixture.migrationPath, fixture.migrationBytes],
      [fixture.replacementPath, fixture.replacementBytes],
    ]),
  };
  try {
    const deleted = analyzePrReleaseContract({
      ...common,
      retiredMigrations: [],
    });
    assert.match(deleted.errors.join('\n'), /inactive lineage entry was removed/);

    const altered = analyzePrReleaseContract({
      ...common,
      retiredMigrations: [{
        ...fixture.retirement,
        sourceSha256: '0'.repeat(64),
      }],
    });
    assert.match(altered.errors.join('\n'), /inactive lineage entry was altered/);
  } finally {
    destroyFixture(fixture);
  }
});

test('accepts a higher VERSION when starting a release train', () => {
  const result = analyzePrReleaseContract({
    files: ['VERSION'],
    prBody: 'Release decision: start VERSION 0.1.2 release train after 0.1.1 promotion\n',
    rootVersion: '0.1.2',
    baseVersion: '0.1.1',
    migrationIndex: '',
  });

  assert.deepEqual(result.errors, []);
});

test('rejects a VERSION change that does not increase the base version', () => {
  for (const rootVersion of ['0.1.1', '0.1.0']) {
    const result = analyzePrReleaseContract({
      files: ['VERSION'],
      prBody: `Release decision: start VERSION ${rootVersion} release train\n`,
      rootVersion,
      baseVersion: '0.1.1',
      migrationIndex: '',
    });

    assert.match(
      result.errors.join('\n'),
      /must be higher than base VERSION 0\.1\.1/,
    );
  }
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

test('parses exact applied migration baseline declarations and rejects malformed duplicates', () => {
  const result = parseAppliedMigrationBaselines([
    'Applied migration baseline: 0123456789abcdef0123456789abcdef01234567 scripts/data-migrations/v0.1.7/002_applied.ts',
    'Applied migration baseline: malformed',
    'Applied migration baseline: 0123456789abcdef0123456789abcdef01234567 scripts/data-migrations/v0.1.7/002_applied.ts',
  ].join('\n'));

  assert.equal(result.declarations.length, 1);
  assert.match(result.errors.join('\n'), /malformed/);
  assert.match(result.errors.join('\n'), /duplicated/);
});

test('requires and verifies an immutable baseline for an ordinary historical migration', () => {
  const fixture = createAppliedMigrationFixture();
  try {
    const result = analyzePrReleaseContract({
      files: [fixture.migrationPath],
      prBody: [
        'Release decision: preserve the applied historical migration',
        `Applied migration baseline: ${fixture.baselineCommit} ${fixture.migrationPath}`,
      ].join('\n'),
      rootVersion: '0.1.8',
      baseVersion: '0.1.8',
      migrationIndex: fixture.migrationIndex,
      root: fixture.root,
      head: fixture.head,
      candidateBytesByPath: new Map([[fixture.migrationPath, fixture.migrationBytes]]),
    });

    assert.deepEqual(result.errors, []);
  } finally {
    destroyFixture(fixture);
  }
});

test('rejects an ordinary historical migration without a baseline declaration', () => {
  const fixture = createAppliedMigrationFixture();
  try {
    const result = analyzePrReleaseContract({
      files: [fixture.migrationPath],
      prBody: 'Release decision: preserve the applied historical migration',
      rootVersion: '0.1.8',
      baseVersion: '0.1.8',
      migrationIndex: fixture.migrationIndex,
      root: fixture.root,
      head: fixture.head,
    });

    assert.match(result.errors.join('\n'), /requires an Applied migration baseline declaration/);
  } finally {
    destroyFixture(fixture);
  }
});

test('rejects abbreviated, non-ancestor, wrong-release, and unregistered baselines', () => {
  const fixture = createAppliedMigrationFixture();
  const bodyFor = (commit) => `Release decision: preserve it\nApplied migration baseline: ${commit} ${fixture.migrationPath}`;
  try {
    const abbreviated = analyzePrReleaseContract({
      files: [fixture.migrationPath],
      prBody: bodyFor(fixture.baselineCommit.slice(0, 12)),
      rootVersion: '0.1.8',
      baseVersion: '0.1.8',
      migrationIndex: fixture.migrationIndex,
      root: fixture.root,
      head: fixture.head,
      candidateBytesByPath: new Map([[fixture.migrationPath, fixture.migrationBytes]]),
    });
    assert.match(abbreviated.errors.join('\n'), /full 40-character commit SHA/);

    const nonAncestor = analyzePrReleaseContract({
      files: [fixture.migrationPath],
      prBody: bodyFor(fixture.unrelatedCommit),
      rootVersion: '0.1.8',
      baseVersion: '0.1.8',
      migrationIndex: fixture.migrationIndex,
      root: fixture.root,
      head: fixture.head,
      candidateBytesByPath: new Map([[fixture.migrationPath, fixture.migrationBytes]]),
    });
    assert.match(nonAncestor.errors.join('\n'), /not an ancestor/);

    const wrongRelease = analyzePrReleaseContract({
      files: [fixture.migrationPath],
      prBody: bodyFor(fixture.wrongVersionCommit),
      rootVersion: '0.1.8',
      baseVersion: '0.1.8',
      migrationIndex: fixture.migrationIndex,
      root: fixture.root,
      head: fixture.head,
      candidateBytesByPath: new Map([[fixture.migrationPath, fixture.migrationBytes]]),
    });
    assert.match(wrongRelease.errors.join('\n'), /has VERSION 0\.1\.6, expected 0\.1\.7/);

    const unregistered = analyzePrReleaseContract({
      files: [fixture.migrationPath],
      prBody: bodyFor(fixture.missingRegistrationCommit),
      rootVersion: '0.1.8',
      baseVersion: '0.1.8',
      migrationIndex: fixture.migrationIndex,
      root: fixture.root,
      head: fixture.head,
      candidateBytesByPath: new Map([[fixture.migrationPath, fixture.migrationBytes]]),
    });
    assert.match(unregistered.errors.join('\n'), /not registered in the baseline migration index/);

    const importOnly = analyzePrReleaseContract({
      files: [fixture.migrationPath],
      prBody: bodyFor(fixture.importOnlyCommit),
      rootVersion: '0.1.8',
      baseVersion: '0.1.8',
      migrationIndex: fixture.migrationIndex,
      root: fixture.root,
      head: fixture.head,
      candidateBytesByPath: new Map([[fixture.migrationPath, fixture.migrationBytes]]),
    });
    assert.match(importOnly.errors.join('\n'), /not registered in the baseline migration index/);
  } finally {
    destroyFixture(fixture);
  }
});

test('rejects altered candidate bytes even when the historical baseline is valid', () => {
  const fixture = createAppliedMigrationFixture();
  try {
    const result = analyzePrReleaseContract({
      files: [fixture.migrationPath],
      prBody: `Release decision: preserve it\nApplied migration baseline: ${fixture.baselineCommit} ${fixture.migrationPath}`,
      rootVersion: '0.1.8',
      baseVersion: '0.1.8',
      migrationIndex: fixture.migrationIndex,
      root: fixture.root,
      head: fixture.head,
      candidateBytesByPath: new Map([
        [fixture.migrationPath, Buffer.concat([fixture.migrationBytes, Buffer.from('changed')])],
      ]),
    });

    assert.match(result.errors.join('\n'), /candidate bytes differ/);
  } finally {
    destroyFixture(fixture);
  }
});

test('requires exact candidate registration when an applied baseline is declared', () => {
  const fixture = createAppliedMigrationFixture();
  try {
    const result = analyzePrReleaseContract({
      files: [fixture.migrationPath],
      prBody: `Release decision: preserve it\nApplied migration baseline: ${fixture.baselineCommit} ${fixture.migrationPath}`,
      rootVersion: '0.1.8',
      baseVersion: '0.1.8',
      migrationIndex: 'import { applied } from "./v0.1.7/002_applied_suffix";\n',
      root: fixture.root,
      head: fixture.head,
      candidateBytesByPath: new Map([[fixture.migrationPath, fixture.migrationBytes]]),
    });

    assert.match(result.errors.join('\n'), /not exactly registered in the candidate migration index/);
  } finally {
    destroyFixture(fixture);
  }
});

test('rejects a declaration for a deleted or renamed applied migration', () => {
  const fixture = createAppliedMigrationFixture();
  try {
    const result = analyzePrReleaseContract({
      files: [fixture.migrationPath],
      deletedFiles: [fixture.migrationPath],
      prBody: `Release decision: remove it\nApplied migration baseline: ${fixture.baselineCommit} ${fixture.migrationPath}`,
      rootVersion: '0.1.8',
      baseVersion: '0.1.8',
      migrationIndex: fixture.migrationIndex,
      root: fixture.root,
      head: fixture.head,
      candidateBytesByPath: new Map(),
    });

    assert.match(result.errors.join('\n'), /deleted or renamed/);
  } finally {
    destroyFixture(fixture);
  }
});

test('verifies an optional applied baseline declaration during promotion', () => {
  const fixture = createAppliedMigrationFixture();
  try {
    const result = analyzePrReleaseContract({
      files: [fixture.migrationPath],
      prBody: `Release decision: promote the assembled train\nApplied migration baseline: ${fixture.baselineCommit} ${fixture.migrationPath}`,
      rootVersion: '0.1.8',
      baseVersion: '0.1.6',
      migrationIndex: fixture.migrationIndex,
      allowHistoricalMigrationVersions: true,
      root: fixture.root,
      head: fixture.head,
      candidateBytesByPath: new Map([[fixture.migrationPath, fixture.migrationBytes]]),
    });

    assert.deepEqual(result.errors, []);
  } finally {
    destroyFixture(fixture);
  }
});

test('still allows an undeclared historical migration in a promotion PR', () => {
  const fixture = createAppliedMigrationFixture();
  try {
    const result = analyzePrReleaseContract({
      files: [fixture.migrationPath],
      prBody: 'Release decision: promote the assembled train',
      rootVersion: '0.1.8',
      baseVersion: '0.1.6',
      migrationIndex: fixture.migrationIndex,
      allowHistoricalMigrationVersions: true,
      root: fixture.root,
      head: fixture.head,
      candidateBytesByPath: new Map(),
    });

    assert.deepEqual(result.errors, []);
  } finally {
    destroyFixture(fixture);
  }
});
