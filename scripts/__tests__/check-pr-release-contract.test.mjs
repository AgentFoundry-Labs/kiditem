import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdtempSync,
  realpathSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzePrReleaseContract,
  isDevelopPromotion,
  migrationReleaseFromPath,
  parseAppliedMigrationBaselines,
  resolvePromotedBoundary,
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

const guardSource = fileURLToPath(
  new URL('../check-pr-release-contract.mjs', import.meta.url),
);

/**
 * A disposable repository the guard can run against.
 *
 * The guard resolves its repository root from its own path and reads the
 * release train (VERSION, the migration index, the inactive-lineage catalog)
 * plus `origin/release/office` and `origin/main` from git. Running the
 * checked-in copy against this repository would need its full history, which
 * a CI checkout does not have, so the guard is copied into a fixture whose
 * history is one commit.
 *
 * `gh pr view` is the guard's last-resort body source. A failing `gh` early on
 * PATH keeps a `--body-file` regression from being masked by whatever body the
 * current branch's pull request happens to carry.
 */
function createBodyFileFixture() {
  // The guard only runs as a CLI when its own resolved path equals argv[1], and
  // macOS hands out temporary directories below a symlink (/var -> /private/var).
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'pr-release-guard-')));
  mkdirSync(path.join(root, 'scripts/data-migrations'), { recursive: true });
  copyFileSync(guardSource, path.join(root, 'scripts/check-pr-release-contract.mjs'));
  writeFileSync(path.join(root, 'VERSION'), '0.1.7\n');
  writeFileSync(
    path.join(root, 'scripts/data-migrations/index.ts'),
    'export const dataMigrations = [];\n',
  );
  writeFileSync(path.join(root, 'scripts/data-migrations/retired.json'), '[]\n');
  writeFileSync(path.join(root, 'gh'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  runGit(root, ['init', '-q']);
  runGit(root, ['config', 'user.email', 'test@example.invalid']);
  runGit(root, ['config', 'user.name', 'Release Contract Test']);
  runGit(root, ['add', 'VERSION', 'scripts']);
  runGit(root, ['commit', '-qm', 'release train fixture']);
  runGit(root, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  runGit(root, ['update-ref', 'refs/remotes/origin/release/office', 'HEAD']);
  return root;
}

function runGuard(root, body) {
  const bodyPath = path.join(root, 'body.md');
  writeFileSync(bodyPath, body);
  return execFileSync(
    'node',
    [
      path.join(root, 'scripts/check-pr-release-contract.mjs'),
      '--base',
      'HEAD',
      '--files',
      'prisma/models/thing.prisma',
      '--body-file',
      bodyPath,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${root}${path.delimiter}${process.env.PATH ?? ''}`,
        GITHUB_ACTIONS: '',
        GITHUB_EVENT_PATH: '',
        GITHUB_BASE_REF: '',
        GITHUB_HEAD_REF: '',
      },
    },
  );
}

test('--body-file with a release decision passes', () => {
  const root = createBodyFileFixture();

  try {
    assert.match(
      runGuard(
        root,
        '## DB\nRelease decision: no version bump, schema-only change on the current release\n',
      ),
      /check:pr-release-contract PASS/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('--body-file without a release decision fails', () => {
  const root = createBodyFileFixture();

  try {
    assert.throws(
      () => runGuard(root, emptyBody),
      (error) => {
        assert.equal(error.status, 1);
        assert.match(error.stderr, /Release decision: field is required/);
        return true;
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Promoted boundary and late inactive lineage.
//
// Office deploys through release/office, so a train can reach the Office
// ledger while main still carries an older train. The lineage fixture mirrors
// the 0.1.30 history:
// - main carries 0.1.29;
// - the develop/release-office merge-base carries 0.1.30 and registers 001;
// - a hotfix only release/office contains registers 006;
// - develop opens 0.1.31, replaces both, and carries 006's bytes unregistered;
// - the PR head records inactive lineage for both.

const LINEAGE_PATHS = Object.freeze({
  applied: 'scripts/data-migrations/v0.1.30/001_applied.ts',
  kept: 'scripts/data-migrations/v0.1.30/003_kept.ts',
  hotfix: 'scripts/data-migrations/v0.1.30/006_hotfix.ts',
  replacement: 'scripts/data-migrations/v0.1.31/001_replacement.ts',
});

const REGISTRATIONS = Object.freeze({
  applied: ['applied', './v0.1.30/001_applied'],
  kept: ['kept', './v0.1.30/003_kept'],
  hotfix: ['hotfix', './v0.1.30/006_hotfix'],
  replacement: ['replacement', './v0.1.31/001_replacement'],
});

function migrationModule(binding, id) {
  return Buffer.from(`export const ${binding} = {\n  id: '${id}',\n};\n`);
}

const LINEAGE_BYTES = Object.freeze({
  applied: migrationModule('applied', 'v0.1.30:001_applied'),
  kept: migrationModule('kept', 'v0.1.30:003_kept'),
  hotfix: migrationModule('hotfix', 'v0.1.30:006_hotfix'),
  replacement: migrationModule('replacement', 'v0.1.31:001_replacement'),
});

function registryModule(...registrations) {
  return [
    ...registrations.map(([binding, importPath]) => `import { ${binding} } from "${importPath}";`),
    `export const dataMigrations = [${registrations.map(([binding]) => binding).join(', ')}];`,
    '',
  ].join('\n');
}

function writeRepoFile(root, file, contents) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), contents);
}

function commitAll(root, message) {
  runGit(root, ['add', '-A']);
  runGit(root, ['commit', '-qm', message]);
  return runGit(root, ['rev-parse', 'HEAD']);
}

function readVersionIn(root) {
  return (ref) => {
    try {
      return execFileSync('git', ['show', `${ref}:VERSION`], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return '';
    }
  };
}

function isAncestor(root, commit, ref) {
  return spawnSync('git', ['merge-base', '--is-ancestor', commit, ref], { cwd: root }).status === 0;
}

/** A disposable repository on `develop` that carries a copy of the guard. */
function createGuardRepository(prefix) {
  // The guard runs as a CLI only when its resolved path equals argv[1], and
  // macOS hands out temporary directories below a symlink.
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), prefix)));
  const root = path.join(dir, 'repo');
  const bin = path.join(dir, 'bin');
  mkdirSync(path.join(root, 'scripts'), { recursive: true });
  mkdirSync(bin);
  // A failing `gh` keeps the current branch's live PR body out of CLI runs.
  writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  runGit(root, ['init', '-q']);
  runGit(root, ['symbolic-ref', 'HEAD', 'refs/heads/develop']);
  runGit(root, ['config', 'user.email', 'test@example.invalid']);
  runGit(root, ['config', 'user.name', 'Release Contract Test']);
  runGit(root, ['config', 'commit.gpgsign', 'false']);
  copyFileSync(guardSource, path.join(root, 'scripts/check-pr-release-contract.mjs'));
  return { dir, root, bin };
}

function destroyRepository(repo) {
  rmSync(repo.dir, { recursive: true, force: true });
}

function lineageEntry({ id, sourcePath, bytes, baselineCommit }) {
  return {
    id,
    releaseVersion: '0.1.30',
    name: `Inactive ${id}`,
    sourcePath,
    sourceSha256: createHash('sha256').update(bytes).digest('hex'),
    baselineCommit,
    replacementMigrations: [{
      id: 'v0.1.31:001_replacement',
      path: LINEAGE_PATHS.replacement,
    }],
  };
}

function createPromotedLineageFixture() {
  const repo = createGuardRepository('pr-release-lineage-');
  const { root } = repo;

  writeRepoFile(root, 'VERSION', '0.1.29\n');
  writeRepoFile(root, 'scripts/data-migrations/index.ts', registryModule());
  writeRepoFile(root, 'scripts/data-migrations/retired.json', '[]\n');
  const mainCommit = commitAll(root, 'main carries train 0.1.29');

  writeRepoFile(root, 'VERSION', '0.1.30\n');
  writeRepoFile(root, LINEAGE_PATHS.applied, LINEAGE_BYTES.applied);
  writeRepoFile(root, 'scripts/data-migrations/index.ts', registryModule(REGISTRATIONS.applied));
  const mergeBaseCommit = commitAll(root, 'train 0.1.30 registers 001');

  runGit(root, ['checkout', '-q', '-b', 'office-hotfix']);
  const officeIndex = registryModule(REGISTRATIONS.applied, REGISTRATIONS.hotfix);
  writeRepoFile(root, LINEAGE_PATHS.hotfix, LINEAGE_BYTES.hotfix);
  writeRepoFile(root, 'scripts/data-migrations/index.ts', officeIndex);
  const officeCommit = commitAll(root, 'release/office hotfix registers 006');

  runGit(root, ['checkout', '-q', 'develop']);
  const developIndex = registryModule(REGISTRATIONS.replacement);
  writeRepoFile(root, 'VERSION', '0.1.31\n');
  writeRepoFile(root, LINEAGE_PATHS.hotfix, LINEAGE_BYTES.hotfix);
  writeRepoFile(root, LINEAGE_PATHS.replacement, LINEAGE_BYTES.replacement);
  writeRepoFile(root, 'scripts/data-migrations/index.ts', developIndex);
  const developCommit = commitAll(root, 'train 0.1.31 replaces 001 and 006');

  const lineage = {
    applied: lineageEntry({
      id: 'v0.1.30:001_applied',
      sourcePath: LINEAGE_PATHS.applied,
      bytes: LINEAGE_BYTES.applied,
      baselineCommit: mergeBaseCommit,
    }),
    hotfix: lineageEntry({
      id: 'v0.1.30:006_hotfix',
      sourcePath: LINEAGE_PATHS.hotfix,
      bytes: LINEAGE_BYTES.hotfix,
      baselineCommit: officeCommit,
    }),
  };
  writeRepoFile(
    root,
    'scripts/data-migrations/retired.json',
    `${JSON.stringify([lineage.applied, lineage.hotfix], null, 2)}\n`,
  );
  const head = commitAll(root, 'record late inactive lineage');

  runGit(root, ['update-ref', 'refs/remotes/origin/main', mainCommit]);
  runGit(root, ['update-ref', 'refs/remotes/origin/release/office', officeCommit]);
  runGit(root, ['update-ref', 'refs/remotes/origin/develop', developCommit]);
  const unrelatedCommit = runGit(root, [
    'commit-tree',
    runGit(root, ['write-tree']),
    '-m',
    'unrelated root',
  ]);
  return {
    ...repo,
    head,
    officeCommit,
    unrelatedCommit,
    developIndex,
    officeIndex,
    lineage,
  };
}

function lineageCandidateBytes(overrides = {}) {
  return new Map([
    [LINEAGE_PATHS.applied, LINEAGE_BYTES.applied],
    [LINEAGE_PATHS.hotfix, LINEAGE_BYTES.hotfix],
    [LINEAGE_PATHS.replacement, LINEAGE_BYTES.replacement],
    ...Object.entries(overrides),
  ]);
}

/** An ordinary develop PR that only adds lineage to the catalog. */
function analyzeLateLineage(fixture, overrides = {}) {
  return analyzePrReleaseContract({
    files: ['scripts/data-migrations/retired.json'],
    prBody: 'Release decision: keep VERSION 0.1.31; record inactive lineage for promoted 0.1.30 migrations',
    rootVersion: '0.1.31',
    baseVersion: '0.1.31',
    migrationIndex: fixture.developIndex,
    baseMigrationIndex: fixture.developIndex,
    promotedVersion: '0.1.30',
    promotedRefs: ['origin/release/office', 'origin/main'],
    retiredMigrations: [fixture.lineage.applied, fixture.lineage.hotfix],
    baseRetiredMigrations: [],
    root: fixture.root,
    head: fixture.head,
    candidateBytesByPath: lineageCandidateBytes(),
    ...overrides,
  });
}

function runGuardCli(repo, { args = [], env = {}, body }) {
  const bodyPath = path.join(repo.dir, 'body.md');
  writeFileSync(bodyPath, body);
  return spawnSync(
    process.execPath,
    [
      path.join(repo.root, 'scripts/check-pr-release-contract.mjs'),
      ...args,
      '--body-file',
      bodyPath,
    ],
    {
      cwd: repo.root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${repo.bin}${path.delimiter}${process.env.PATH ?? ''}`,
        GITHUB_ACTIONS: '',
        GITHUB_EVENT_PATH: '',
        GITHUB_BASE_REF: '',
        GITHUB_HEAD_REF: '',
        ...env,
      },
    },
  );
}

test('treats develop into release/office or main as a promotion PR', () => {
  assert.equal(isDevelopPromotion({ baseRef: 'release/office', headRef: 'develop' }), true);
  assert.equal(isDevelopPromotion({ baseRef: 'main', headRef: 'develop' }), true);
  assert.equal(isDevelopPromotion({ baseRef: 'release/office', headRef: 'kid-1-hotfix' }), false);
  assert.equal(isDevelopPromotion({ baseRef: 'develop', headRef: 'kid-1-feature' }), false);
  assert.equal(isDevelopPromotion({ baseRef: 'develop', headRef: 'develop' }), false);
  assert.equal(isDevelopPromotion({ baseRef: '', headRef: '' }), false);
});

test('allows historical migration releases in develop to release/office promotion PRs', () => {
  const result = analyzePrReleaseContract({
    files: ['scripts/data-migrations/v0.1.30/003_release_note.ts'],
    prBody: 'Release decision: promote develop VERSION 0.1.31 to release/office\n',
    rootVersion: '0.1.31',
    baseVersion: '0.1.29',
    migrationIndex: './v0.1.30/003_release_note\n',
    allowHistoricalMigrationVersions: isDevelopPromotion({
      baseRef: 'release/office',
      headRef: 'develop',
    }),
  });

  assert.deepEqual(result.errors, []);
});

test('resolvePromotedBoundary takes the higher VERSION of release/office and main', () => {
  const versions = new Map([
    ['origin/release/office', '0.1.30'],
    ['origin/main', '0.1.29'],
  ]);
  const readVersionAtRef = (ref) => versions.get(ref) ?? '';

  assert.deepEqual(
    resolvePromotedBoundary({ baseRef: 'develop', base: 'origin/develop', readVersionAtRef }),
    {
      promotedVersion: '0.1.30',
      promotedRefs: ['origin/release/office', 'origin/main'],
      unreadableRefs: [],
    },
  );

  versions.set('origin/main', '0.1.31');
  assert.equal(
    resolvePromotedBoundary({ baseRef: 'develop', base: 'origin/develop', readVersionAtRef })
      .promotedVersion,
    '0.1.31',
  );
});

test('resolvePromotedBoundary reads a promotion PR base in place of its remote branch', () => {
  const versions = new Map([
    ['pr-base', '0.1.30'],
    ['origin/release/office', '0.1.20'],
    ['origin/main', '0.1.29'],
  ]);
  const readVersionAtRef = (ref) => versions.get(ref) ?? '';

  assert.deepEqual(
    resolvePromotedBoundary({ baseRef: 'release/office', base: 'pr-base', readVersionAtRef }),
    {
      promotedVersion: '0.1.30',
      promotedRefs: ['pr-base', 'origin/main'],
      unreadableRefs: [],
    },
  );
  assert.deepEqual(
    resolvePromotedBoundary({ baseRef: 'main', base: 'pr-base', readVersionAtRef }),
    {
      promotedVersion: '0.1.30',
      promotedRefs: ['origin/release/office', 'pr-base'],
      unreadableRefs: [],
    },
  );
});

test('resolvePromotedBoundary skips unreadable refs and yields no boundary when none is readable', () => {
  assert.deepEqual(
    resolvePromotedBoundary({
      base: 'origin/develop',
      readVersionAtRef: (ref) => (ref === 'origin/main' ? '0.1.29\n' : 'not a version'),
    }),
    {
      promotedVersion: '0.1.29',
      promotedRefs: ['origin/main'],
      unreadableRefs: ['origin/release/office'],
    },
  );
  assert.deepEqual(
    resolvePromotedBoundary({ base: 'origin/develop', readVersionAtRef: () => '' }),
    {
      promotedVersion: '',
      promotedRefs: [],
      unreadableRefs: ['origin/release/office', 'origin/main'],
    },
  );
});

test('requires lineage for removed 0.1.30 registrations once release/office carries 0.1.30 and main 0.1.29', () => {
  const fixture = createPromotedLineageFixture();
  try {
    const boundary = resolvePromotedBoundary({
      baseRef: 'develop',
      base: 'origin/develop',
      readVersionAtRef: readVersionIn(fixture.root),
    });
    assert.deepEqual(boundary, {
      promotedVersion: '0.1.30',
      promotedRefs: ['origin/release/office', 'origin/main'],
      unreadableRefs: [],
    });
    const removal = {
      files: ['scripts/data-migrations/index.ts'],
      prBody: 'Release decision: keep VERSION 0.1.31; replace 0.1.30 migrations',
      rootVersion: '0.1.31',
      baseVersion: '0.1.31',
      migrationIndex: fixture.developIndex,
      baseMigrationIndex: fixture.officeIndex,
      retiredMigrations: [],
      root: fixture.root,
      head: fixture.head,
    };

    const errors = analyzePrReleaseContract({
      ...removal,
      promotedVersion: boundary.promotedVersion,
      promotedRefs: boundary.promotedRefs,
    }).errors.join('\n');
    assert.match(errors, /v0\.1\.30\/001_applied\.ts was removed from the executable registry without inactive lineage/);
    assert.match(errors, /v0\.1\.30\/006_hotfix\.ts was removed from the executable registry without inactive lineage/);

    // Measured against main alone, the same removals needed no lineage.
    assert.deepEqual(
      analyzePrReleaseContract({
        ...removal,
        promotedVersion: '0.1.29',
        promotedRefs: ['origin/main'],
      }).errors,
      [],
    );
  } finally {
    destroyRepository(fixture);
  }
});

test('accepts late lineage whose baseline only a promoted ref contains', () => {
  const fixture = createPromotedLineageFixture();
  try {
    assert.equal(isAncestor(fixture.root, fixture.officeCommit, fixture.head), false);
    assert.equal(isAncestor(fixture.root, fixture.officeCommit, 'origin/release/office'), true);

    assert.deepEqual(analyzeLateLineage(fixture).errors, []);
  } finally {
    destroyRepository(fixture);
  }
});

test('rejects late lineage above the promoted VERSION or without a readable one', () => {
  const fixture = createPromotedLineageFixture();
  try {
    const mainOnly = analyzeLateLineage(fixture, {
      promotedVersion: '0.1.29',
      promotedRefs: ['origin/main'],
    }).errors.join('\n');
    assert.match(mainOnly, /001_applied\.ts inactive lineage release v0\.1\.30 is above promoted VERSION 0\.1\.29/);
    assert.match(mainOnly, /006_hotfix\.ts inactive lineage release v0\.1\.30 is above promoted VERSION 0\.1\.29/);

    const unreadable = analyzeLateLineage(fixture, {
      promotedVersion: '',
      promotedRefs: [],
    }).errors.join('\n');
    assert.match(unreadable, /006_hotfix\.ts cannot gain late inactive lineage because no promoted VERSION/);
  } finally {
    destroyRepository(fixture);
  }
});

test('rejects late lineage for a migration that a registry still runs', () => {
  const fixture = createPromotedLineageFixture();
  try {
    const stillRegistered = registryModule(REGISTRATIONS.replacement, REGISTRATIONS.hotfix);
    const candidate = analyzeLateLineage(fixture, {
      migrationIndex: stillRegistered,
    }).errors.join('\n');
    assert.match(candidate, /006_hotfix\.ts is still registered in the base or candidate executable migration index/);
    assert.doesNotMatch(candidate, /001_applied\.ts/);

    const baseAndCandidate = analyzeLateLineage(fixture, {
      migrationIndex: stillRegistered,
      baseMigrationIndex: stillRegistered,
    }).errors.join('\n');
    assert.match(baseAndCandidate, /006_hotfix\.ts is still registered in the base or candidate executable migration index/);
  } finally {
    destroyRepository(fixture);
  }
});

test('rejects late lineage whose source bytes differ from the baseline', () => {
  const fixture = createPromotedLineageFixture();
  try {
    const errors = analyzeLateLineage(fixture, {
      candidateBytesByPath: lineageCandidateBytes({
        [LINEAGE_PATHS.hotfix]: Buffer.concat([LINEAGE_BYTES.hotfix, Buffer.from('// edited\n')]),
      }),
    }).errors.join('\n');
    assert.match(errors, /006_hotfix\.ts candidate bytes differ from the immutable baseline/);
    assert.match(errors, /006_hotfix\.ts does not match its inactive lineage SHA-256/);
    assert.doesNotMatch(errors, /001_applied\.ts/);
  } finally {
    destroyRepository(fixture);
  }
});

test('rejects late lineage whose baseline neither the head nor a promoted ref contains', () => {
  const fixture = createPromotedLineageFixture();
  try {
    const withoutOffice = analyzeLateLineage(fixture, {
      promotedRefs: ['origin/main'],
    }).errors.join('\n');
    assert.match(
      withoutOffice,
      new RegExp(
        `006_hotfix\\.ts baseline commit ${fixture.officeCommit} is not an ancestor of checked head ${fixture.head} or of promoted refs origin/main\\.`,
      ),
    );
    assert.doesNotMatch(withoutOffice, /001_applied\.ts/);

    const unrelated = analyzeLateLineage(fixture, {
      retiredMigrations: [
        fixture.lineage.applied,
        { ...fixture.lineage.hotfix, baselineCommit: fixture.unrelatedCommit },
      ],
    }).errors.join('\n');
    assert.match(
      unrelated,
      new RegExp(`006_hotfix\\.ts baseline commit ${fixture.unrelatedCommit} is not an ancestor`),
    );
  } finally {
    destroyRepository(fixture);
  }
});

test('re-verifies existing lineage against the promoted refs and the candidate registry', () => {
  const fixture = createPromotedLineageFixture();
  try {
    const existing = {
      files: ['apps/web/src/app/page.tsx'],
      baseRetiredMigrations: [fixture.lineage.applied, fixture.lineage.hotfix],
    };
    assert.deepEqual(analyzeLateLineage(fixture, existing).errors, []);

    const withoutOffice = analyzeLateLineage(fixture, {
      ...existing,
      promotedRefs: ['origin/main'],
    }).errors.join('\n');
    assert.match(withoutOffice, /006_hotfix\.ts baseline commit [0-9a-f]{40} is not an ancestor/);

    const registeredAgain = analyzeLateLineage(fixture, {
      ...existing,
      migrationIndex: registryModule(REGISTRATIONS.replacement, REGISTRATIONS.applied),
    }).errors.join('\n');
    assert.match(registeredAgain, /001_applied\.ts is still registered in the candidate executable migration index/);
  } finally {
    destroyRepository(fixture);
  }
});

test('verifies an unregistered promoted source in a promotion diff through its lineage', () => {
  const fixture = createPromotedLineageFixture();
  try {
    const promotion = {
      files: [
        'VERSION',
        'scripts/data-migrations/index.ts',
        'scripts/data-migrations/retired.json',
        LINEAGE_PATHS.hotfix,
        LINEAGE_PATHS.replacement,
      ],
      prBody: 'Release decision: promote develop VERSION 0.1.31 to release/office; no additional version bump',
      baseVersion: '0.1.30',
      baseMigrationIndex: fixture.officeIndex,
      allowHistoricalMigrationVersions: true,
    };
    assert.deepEqual(analyzeLateLineage(fixture, promotion).errors, []);

    const withoutLineage = analyzeLateLineage(fixture, {
      ...promotion,
      retiredMigrations: [fixture.lineage.applied],
    }).errors.join('\n');
    assert.match(withoutLineage, /006_hotfix\.ts was removed from the executable registry without inactive lineage/);
    assert.match(withoutLineage, /006_hotfix\.ts is not registered in scripts\/data-migrations\/index\.ts/);
    assert.match(withoutLineage, /006_hotfix\.ts is an applied historical migration and requires an Applied migration baseline declaration/);

    const declared = analyzeLateLineage(fixture, {
      ...promotion,
      prBody: `${promotion.prBody}\nApplied migration baseline: ${fixture.officeCommit} ${LINEAGE_PATHS.hotfix}`,
    }).errors.join('\n');
    assert.match(declared, /006_hotfix\.ts has inactive lineage in retired\.json, so it cannot also carry an Applied migration baseline declaration/);

    const edited = analyzeLateLineage(fixture, {
      ...promotion,
      candidateBytesByPath: lineageCandidateBytes({
        [LINEAGE_PATHS.hotfix]: Buffer.from('export const hotfix = {};\n'),
      }),
    }).errors.join('\n');
    assert.match(edited, /006_hotfix\.ts candidate bytes differ from the immutable baseline/);
  } finally {
    destroyRepository(fixture);
  }
});

test('the guard CLI verifies late lineage against the fetched release/office ref', () => {
  const fixture = createPromotedLineageFixture();
  const body = 'Release decision: keep VERSION 0.1.31; record inactive lineage for promoted 0.1.30 migrations\n';
  try {
    const passed = runGuardCli(fixture, { args: ['--base', 'origin/develop'], body });
    assert.equal(passed.status, 0, passed.stderr);
    assert.match(passed.stdout, /check:pr-release-contract PASS/);
    assert.doesNotMatch(passed.stderr, /WARN/);

    runGit(fixture.root, ['update-ref', '-d', 'refs/remotes/origin/release/office']);
    const failed = runGuardCli(fixture, { args: ['--base', 'origin/develop'], body });
    assert.equal(failed.status, 1, failed.stdout);
    assert.match(
      failed.stderr,
      /WARN — cannot read VERSION at origin\/release\/office; run `git fetch origin main develop release\/office`/,
    );
    assert.match(failed.stderr, /006_hotfix\.ts inactive lineage release v0\.1\.30 is above promoted VERSION 0\.1\.29/);
  } finally {
    destroyRepository(fixture);
  }
});

function createLaggingOfficeFixture() {
  const repo = createGuardRepository('pr-release-promotion-');
  const { root } = repo;
  writeRepoFile(root, 'VERSION', '0.1.29\n');
  writeRepoFile(root, 'scripts/data-migrations/index.ts', registryModule());
  writeRepoFile(root, 'scripts/data-migrations/retired.json', '[]\n');
  const officeCommit = commitAll(root, 'release/office carries train 0.1.29');

  writeRepoFile(root, 'VERSION', '0.1.31\n');
  writeRepoFile(root, LINEAGE_PATHS.kept, LINEAGE_BYTES.kept);
  writeRepoFile(root, LINEAGE_PATHS.replacement, LINEAGE_BYTES.replacement);
  writeRepoFile(
    root,
    'scripts/data-migrations/index.ts',
    registryModule(REGISTRATIONS.kept, REGISTRATIONS.replacement),
  );
  commitAll(root, 'develop assembles trains 0.1.30 and 0.1.31');

  runGit(root, ['update-ref', 'refs/remotes/origin/release/office', officeCommit]);
  runGit(root, ['update-ref', 'refs/remotes/origin/main', officeCommit]);
  return repo;
}

test('the guard CLI allows historical train migrations in a develop to release/office promotion', () => {
  const fixture = createLaggingOfficeFixture();
  const body = 'Release decision: promote develop VERSION 0.1.31 to release/office; no additional version bump\n';
  try {
    const promotion = runGuardCli(fixture, {
      env: { GITHUB_BASE_REF: 'release/office', GITHUB_HEAD_REF: 'develop' },
      body,
    });
    assert.equal(promotion.status, 0, promotion.stderr);
    assert.match(promotion.stdout, /check:pr-release-contract PASS/);

    const topic = runGuardCli(fixture, {
      env: { GITHUB_BASE_REF: 'release/office', GITHUB_HEAD_REF: 'kid-1-office-hotfix' },
      body,
    });
    assert.equal(topic.status, 1, topic.stdout);
    assert.match(
      topic.stderr,
      /v0\.1\.30\/003_kept\.ts is an applied historical migration and requires an Applied migration baseline declaration/,
    );
  } finally {
    destroyRepository(fixture);
  }
});
