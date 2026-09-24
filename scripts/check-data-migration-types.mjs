#!/usr/bin/env node
// Data-migration type gate (KID-262).
//
// `npm run data:migrate` runs scripts/run-data-migrations.ts through tsx, which
// strips types without checking them, and no tsconfig covered scripts/, so a
// migration left broken by a Prisma schema change was only found when Office
// ran it. This gate type-checks the runner, scripts/_shared, and the
// executable data migrations with scripts/data-migrations/tsconfig.json.
//
// Checked set: every file the committed tsconfig includes, minus
//   - retired sources (retired.json `sourcePath`), which never run again, and
//   - version files index.ts does not register or re-export (registrations
//     removed before retired.json existed; see data-migrations/README.md).
// Both lists are derived here on every run; nothing is written by hand.
//
// Policy: zero errors. The one exception is scripts/.data-migration-type-
// allowlist.txt: `<path> <count> <reason>` for a promoted migration whose
// source must stay byte-identical. A listed file must have exactly its recorded
// count, and a listed file with no errors fails so the list cannot go stale.

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseTscDiagnostics } from './check-server-type-baseline.mjs';

const require = createRequire(import.meta.url);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const MIGRATIONS_DIR = 'scripts/data-migrations';
const TSCONFIG = `${MIGRATIONS_DIR}/tsconfig.json`;
const ALLOWLIST_FILE = 'scripts/.data-migration-type-allowlist.txt';

const IMPORT_SPECIFIER = /(?:import|export)\b[^'"]*?\bfrom\s+['"](\.\/v[^'"]+)['"]/g;

/** Which version files to leave out of the check, derived from index.ts and retired.json. */
export function planDataMigrationTypeCheck({ versionFiles, indexSource, retired }) {
  const registered = new Set();
  for (const match of indexSource.matchAll(IMPORT_SPECIFIER)) {
    registered.add(`${MIGRATIONS_DIR}/${match[1].slice(2).replace(/\.ts$/, '')}.ts`);
  }
  const present = new Set(versionFiles);
  const errors = [];
  const retiredPaths = [];
  for (const { sourcePath } of retired) {
    if (registered.has(sourcePath)) {
      errors.push(`${sourcePath} is retired but still registered in index.ts`);
    } else if (!present.has(sourcePath)) {
      errors.push(`${sourcePath} is retired but its source file is missing`);
    } else {
      retiredPaths.push(sourcePath);
    }
  }
  const retiredSet = new Set(retiredPaths);
  const unregistered = versionFiles
    .filter((file) => !registered.has(file) && !retiredSet.has(file))
    .sort();
  return {
    errors,
    retired: [...retiredPaths].sort(),
    unregistered,
    exclude: [...retiredPaths, ...unregistered].sort(),
  };
}

/** `<path> <count> <reason>` lines; `#` comments and blank lines are ignored. */
export function parseAllowlist(text) {
  const entries = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const [file, countText, ...reasonWords] = line.split(/\s+/);
    if (!/^\d+$/.test(countText ?? '')) {
      throw new Error(`allowlist line needs a numeric error count: ${raw}`);
    }
    if (reasonWords.length === 0) {
      throw new Error(`allowlist line needs a reason: ${raw}`);
    }
    entries.set(file, { count: Number(countText), reason: reasonWords.join(' ') });
  }
  return entries;
}

/** Failures for errors outside the allowlist, allowlisted counts that moved, and stale entries. */
export function compareToAllowlist({ counts, allowlist }) {
  const failures = [];
  for (const [file, count] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const entry = allowlist.get(file);
    if (!entry) {
      failures.push(`${file}: ${count} type error(s) and no allowlist entry`);
    } else if (count !== entry.count) {
      failures.push(`${file}: ${count} type error(s), allowlist records ${entry.count}`);
    }
  }
  for (const [file, entry] of allowlist) {
    if (!counts.has(file)) {
      failures.push(
        `${file}: allowlisted with ${entry.count} error(s) but now has 0; remove or lower the entry`,
      );
    }
  }
  return failures;
}

function listVersionFiles() {
  const root = path.join(REPO_ROOT, MIGRATIONS_DIR);
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^v\d/.test(entry.name))
    .flatMap((dir) =>
      readdirSync(path.join(root, dir.name))
        .filter((name) => name.endsWith('.ts'))
        .map((name) => `${MIGRATIONS_DIR}/${dir.name}/${name}`),
    )
    .sort();
}

function run() {
  const plan = planDataMigrationTypeCheck({
    versionFiles: listVersionFiles(),
    indexSource: readFileSync(path.join(REPO_ROOT, MIGRATIONS_DIR, 'index.ts'), 'utf8'),
    retired: JSON.parse(readFileSync(path.join(REPO_ROOT, MIGRATIONS_DIR, 'retired.json'), 'utf8')),
  });
  if (plan.errors.length > 0) {
    console.error('ERROR: data-migration registry is inconsistent:');
    for (const error of plan.errors) console.error(`  ${error}`);
    process.exit(2);
  }
  const allowlistPath = path.join(REPO_ROOT, ALLOWLIST_FILE);
  const allowlist = existsSync(allowlistPath)
    ? parseAllowlist(readFileSync(allowlistPath, 'utf8'))
    : new Map();

  console.log(`check:data-migration-types - type-checking ${TSCONFIG}`);
  console.log(`  excluded: ${plan.retired.length} retired, ${plan.unregistered.length} unregistered pre-retirement file(s)`);

  // A throwaway config that extends the committed one with the derived
  // exclusions. Absolute paths keep it independent of the temp directory.
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'data-migration-types-'));
  const tempConfig = path.join(tempDir, 'tsconfig.json');
  const committedConfig = JSON.parse(readFileSync(path.join(REPO_ROOT, TSCONFIG), 'utf8'));
  writeFileSync(
    tempConfig,
    JSON.stringify({
      extends: path.join(REPO_ROOT, TSCONFIG),
      include: committedConfig.include.map((pattern) => path.join(REPO_ROOT, MIGRATIONS_DIR, pattern)),
      exclude: [
        ...(committedConfig.exclude ?? []).map((pattern) => path.join(REPO_ROOT, MIGRATIONS_DIR, pattern)),
        ...plan.exclude.map((file) => path.join(REPO_ROOT, file)),
      ],
    }),
  );
  let result;
  try {
    result = spawnSync(
      process.execPath,
      [require.resolve('typescript/bin/tsc'), '-p', tempConfig, '--pretty', 'false'],
      { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
  if (result.error) {
    console.error(`ERROR: failed to run tsc: ${result.error.message}`);
    process.exit(2);
  }
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const { counts, projectErrors } = parseTscDiagnostics(output, { repoRoot: REPO_ROOT });
  if (projectErrors.length > 0 || (counts.size === 0 && result.status !== 0)) {
    console.error(`ERROR: tsc could not check ${TSCONFIG}:`);
    console.error(output.trim().slice(0, 4000));
    process.exit(2);
  }

  const failures = compareToAllowlist({ counts, allowlist });
  if (failures.length > 0) {
    console.log('');
    console.log('FAIL: data-migration type errors outside the allowlist:');
    for (const failure of failures) console.log(`   - ${failure}`);
    console.log(`
  Reproduce with the file list above and:
      npx tsc -p ${TSCONFIG}
  (that run also checks the excluded retired and unregistered files).
  A migration whose release has not reached release/office is fixed in place.
  A promoted migration stays byte-identical: retire it through retired.json,
  or, when retirement is blocked, record it in ${ALLOWLIST_FILE} with its exact
  error count and a reason.`);
    process.exit(1);
  }
  console.log(`PASS: no data-migration type errors outside ${allowlist.size} allowlisted file(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run();
}
