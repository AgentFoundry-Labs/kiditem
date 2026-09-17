#!/usr/bin/env node
/**
 * PR-time check that every schema change existing rows could stop has a
 * reviewed answer before it merges.
 *
 * `db push` applies these changes only while no existing row conflicts:
 *
 *   - `not-null:<table>.<column>`: a required column without a database default.
 *   - `set-not-null:<table>.<column>`: `ALTER COLUMN ... SET NOT NULL`.
 *   - `type-change:<table>.<column>`: `ALTER COLUMN ... SET DATA TYPE`.
 *   - `unique:<index>`: a unique index on a table that already exists. It is
 *     cleared when a key column arrives nullable without a default (NULL never
 *     collides), or when the base already holds a full unique index or
 *     primary key over a subset of its columns that this diff leaves as it is.
 *   - `primary-key:<constraint>`: a primary key added to a table that already
 *     exists, cleared by the same subset rule.
 *   - `foreign-key:<constraint>`: a foreign key on a table that already exists,
 *     cleared when one of its columns arrives nullable without a default.
 *
 * Office holds those rows, and the deploy-time survey
 * (`check-cutover-data-blockers.mjs`) meets them only during the cutover. This
 * check diffs the schema against `origin/release/office` offline, with this
 * checkout's Prisma CLI and no database, and requires each change to be listed
 * in `scripts/cutover-blocker-coverage.json`: covered by the pre-schema data
 * migration that removes or fixes the rows (`coveredBy`), or accepted with the
 * reason existing rows cannot stop it (`acceptedRisk`). A table entry covers
 * every change on a table its migration empties.
 *
 * It reads schemas, not data. The deploy-time survey stays the gate for real
 * duplicates and orphans, and neither check sees a change in the words a
 * column stores.
 *
 * Usage:
 *   node scripts/check-cutover-blocker-coverage.mjs [--base-ref origin/release/office]
 *     [--head-schema prisma] [--coverage scripts/cutover-blocker-coverage.json] [--json]
 *
 * Exit 0 when every change is covered, 1 when one is not or the coverage file
 * is invalid, 2 when the check cannot run.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alterTableStatements, createdTables, uniqueIndexes } from './_shared/prisma-ddl.mjs';

export const COVERAGE_SCHEMA_VERSION = 'kiditem.cutover-blocker-coverage.v1';
export const DEFAULT_BASE_REF = 'origin/release/office';
export const DEFAULT_HEAD_SCHEMA = 'prisma';
export const DEFAULT_COVERAGE_PATH = 'scripts/cutover-blocker-coverage.json';
export const BLOCKER_KINDS = Object.freeze([
  'not-null',
  'set-not-null',
  'type-change',
  'unique',
  'primary-key',
  'foreign-key',
]);
/**
 * `prisma.config.ts` resolves DATABASE_URL when it loads. The diff only reads
 * two schemas, and this address refuses connections, so a developer's own
 * database URL never reaches the Prisma process.
 */
export const OFFLINE_DATABASE_URL = 'postgresql://offline:offline@127.0.0.1:1/offline';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const MIGRATION_ID = /^v(\d+\.\d+\.\d+):\d{3}_[a-z0-9_]+$/;
const TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const BLOCKER_KEY = new RegExp(`^(?:${BLOCKER_KINDS.join('|')}):[^\\s:]+$`);
const ENTRY_FIELDS = new Set(['train', 'table', 'keys', 'coveredBy', 'acceptedRisk', 'note']);
const COMMAND_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const FETCH_HINT = 'git fetch --no-tags origin +refs/heads/release/office:refs/remotes/origin/release/office';

const USAGE = `Usage: node scripts/check-cutover-blocker-coverage.mjs [options]

Diffs the Prisma schema against the base ref offline and requires every change
that existing rows could stop to be listed in the coverage file.

Options:
  --base-ref <ref>      Git ref with the promoted schema (default: ${DEFAULT_BASE_REF})
  --head-schema <path>  Schema file or folder to check (default: ${DEFAULT_HEAD_SCHEMA})
  --coverage <path>     Coverage file (default: ${DEFAULT_COVERAGE_PATH})
  --json                Print the result as JSON
  --help                Print this help

Exit codes: 0 every change covered, 1 a change uncovered or the coverage file
invalid, 2 the check could not run.`;

/** A problem with the checkout or the tools, rather than with the coverage. */
export class CheckError extends Error {
  name = 'CheckError';
}

export function compareReleaseVersions(left, right) {
  const leftParts = left.match(RELEASE_VERSION);
  const rightParts = right.match(RELEASE_VERSION);
  if (!leftParts || !rightParts) {
    throw new CheckError(`Cannot compare release versions ${JSON.stringify(left)} and ${JSON.stringify(right)}.`);
  }
  for (let part = 1; part <= 3; part += 1) {
    const difference = Number(leftParts[part]) - Number(rightParts[part]);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function change(kind, name, table, columns, detail) {
  return { key: `${kind}:${name}`, kind, table, columns, detail };
}

function columnText(columns) {
  return columns.join(', ');
}

/**
 * Unique keys the base holds over all of a table's rows: full unique indexes,
 * primary keys, and unique constraints. A partial index says nothing about the
 * rows its predicate leaves out.
 */
function baseUniqueKeys(baseDdl) {
  const keys = new Map();
  const add = (table, name, columns) => {
    if (!keys.has(table)) keys.set(table, []);
    keys.get(table).push({ name, columns });
  };
  for (const index of uniqueIndexes(baseDdl)) {
    if (/\bWHERE\b/i.test(index.where ?? '')) continue;
    add(index.table, index.name, index.columns);
  }
  const isUniqueKey = (constraint) => constraint.type === 'primary-key' || constraint.type === 'unique';
  for (const { table, constraints } of createdTables(baseDdl)) {
    for (const constraint of constraints.filter(isUniqueKey)) {
      add(table, constraint.name ?? `${table} ${constraint.type}`, constraint.columns);
    }
  }
  for (const { table, clauses } of alterTableStatements(baseDdl)) {
    for (const clause of clauses) {
      if (clause.action !== 'add-constraint' || !isUniqueKey(clause)) continue;
      add(table, clause.name ?? `${table} ${clause.type}`, clause.columns);
    }
  }
  return keys;
}

/**
 * The changes in `diffSql` that existing rows could stop (`blockers`), and the
 * unique keys and foreign keys on existing tables the rules above clear
 * (`cleared`, each with `clearedBy`). `baseDdl` is the base schema written as
 * the statements that create it.
 */
export function classifyBlockers({ diffSql, baseDdl }) {
  const newTables = new Set(createdTables(diffSql).map(({ table }) => table));
  const alters = alterTableStatements(diffSql).filter(({ table }) => !newTables.has(table));

  const added = new Map();
  // A column this diff adds, drops, or retypes no longer holds the values a
  // base unique key vouched for.
  const rewritten = new Set();
  for (const { table, clauses } of alters) {
    for (const clause of clauses) {
      const column = `${table}.${clause.column}`;
      if (clause.action === 'add-column') added.set(column, clause);
      if (
        clause.action === 'add-column'
        || clause.action === 'drop-column'
        || (clause.action === 'alter-column' && clause.change === 'set-data-type')
      ) {
        rewritten.add(column);
      }
    }
  }
  const newNullableColumn = (table, columns) =>
    columns.find((column) => added.get(`${table}.${column}`)?.initialSql === 'NULL');
  const baseKeys = baseUniqueKeys(baseDdl);
  // A key whose columns could not be read implies nothing.
  const baseKeyWithin = (table, columns) =>
    (baseKeys.get(table) ?? []).find((key) =>
      key.columns.length > 0
      && key.columns.every((column) => columns.includes(column) && !rewritten.has(`${table}.${column}`)));
  const nullableClearance = (column) => column && { rule: 'new-nullable-column', column };
  const baseKeyClearance = (key) => key && { rule: 'base-unique-key', key: key.name, columns: key.columns };

  const blockers = [];
  const cleared = [];
  const record = (found, clearedBy) => {
    if (clearedBy) cleared.push({ ...found, clearedBy });
    else blockers.push(found);
  };

  for (const { table, clauses } of alters) {
    for (const clause of clauses) {
      const at = `${table}.${clause.column}`;
      if (clause.action === 'add-column' && clause.requiredWithoutDefault) {
        record(change('not-null', at, table, [clause.column], `ADD COLUMN "${clause.column}" ${clause.definition}`));
      } else if (clause.action === 'alter-column' && clause.change === 'set-not-null') {
        record(change('set-not-null', at, table, [clause.column], `ALTER COLUMN "${clause.column}" SET NOT NULL`));
      } else if (clause.action === 'alter-column' && clause.change === 'set-data-type') {
        record(change(
          'type-change',
          at,
          table,
          [clause.column],
          `ALTER COLUMN "${clause.column}" SET DATA TYPE ${clause.value}`,
        ));
      } else if (clause.action === 'add-constraint') {
        const name = clause.name ?? `${table}(${clause.columns.join(',')})`;
        const columns = columnText(clause.columns);
        if (clause.type === 'foreign-key') {
          const target = clause.references
            ? ` REFERENCES ${clause.references.table}(${columnText(clause.references.columns)})`
            : '';
          // MATCH FULL checks a row whose key is only partly NULL.
          const nullable = /\bMATCH\s+FULL\b/i.test(clause.definition)
            ? undefined
            : newNullableColumn(table, clause.columns);
          record(change('foreign-key', name, table, clause.columns, `FOREIGN KEY (${columns})${target}`), nullableClearance(nullable));
        } else if (clause.type === 'primary-key') {
          record(
            change('primary-key', name, table, clause.columns, `PRIMARY KEY (${columns})`),
            baseKeyClearance(baseKeyWithin(table, clause.columns)),
          );
        } else if (clause.type === 'unique') {
          record(
            change('unique', name, table, clause.columns, `UNIQUE (${columns})`),
            clause.nullsNotDistinct
              ? null
              : nullableClearance(newNullableColumn(table, clause.columns))
                || baseKeyClearance(baseKeyWithin(table, clause.columns)),
          );
        }
      }
    }
  }

  for (const index of uniqueIndexes(diffSql)) {
    if (newTables.has(index.table)) continue;
    // NULLS NOT DISTINCT compares NULLs, so neither rule holds.
    const nullsNotDistinct = /\bNULLS\s+NOT\s+DISTINCT\b/i.test(index.where ?? '');
    record(
      change(
        'unique',
        index.name,
        index.table,
        index.columns,
        `UNIQUE INDEX (${columnText(index.columns)})${index.where ? ` ${index.where}` : ''}`,
      ),
      nullsNotDistinct
        ? null
        : nullableClearance(newNullableColumn(index.table, index.columns))
          || baseKeyClearance(baseKeyWithin(index.table, index.columns)),
    );
  }

  const byKey = (left, right) => left.key.localeCompare(right.key);
  return { blockers: blockers.sort(byKey), cleared: cleared.sort(byKey) };
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Checks the coverage file's shape. `entries` carries each entry with its
 * position (`index`) when the file is valid, and is empty otherwise.
 */
export function validateCoverage(document, { headVersion } = {}) {
  const errors = [];
  if (!isRecord(document)) return { entries: [], errors: ['The coverage file must hold a JSON object.'] };
  for (const field of Object.keys(document)) {
    if (field !== 'schemaVersion' && field !== 'entries') errors.push(`Unknown top-level field ${JSON.stringify(field)}.`);
  }
  if (document.schemaVersion !== COVERAGE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${JSON.stringify(COVERAGE_SCHEMA_VERSION)}.`);
  }
  if (!Array.isArray(document.entries)) {
    errors.push('entries must be an array.');
    return { entries: [], errors };
  }

  const claimed = new Map();
  document.entries.forEach((entry, index) => {
    const at = `entries[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${at} must be an object.`);
      return;
    }
    const before = errors.length;
    for (const field of Object.keys(entry)) {
      if (!ENTRY_FIELDS.has(field)) errors.push(`${at} has unknown field ${JSON.stringify(field)}.`);
    }

    const { train } = entry;
    const trainValid = typeof train === 'string' && RELEASE_VERSION.test(train);
    if (!trainValid) {
      errors.push(`${at}.train must be a release version such as "0.1.31".`);
    } else if (headVersion && compareReleaseVersions(train, headVersion) > 0) {
      errors.push(`${at}.train ${train} is above this checkout's VERSION ${headVersion}.`);
    }

    const hasTable = Object.hasOwn(entry, 'table');
    const hasKeys = Object.hasOwn(entry, 'keys');
    if (hasTable === hasKeys) errors.push(`${at} needs exactly one of "table" or "keys".`);
    if (hasTable && !(typeof entry.table === 'string' && TABLE_NAME.test(entry.table))) {
      errors.push(`${at}.table must be a table name.`);
    }
    if (hasKeys) {
      if (!Array.isArray(entry.keys) || entry.keys.length === 0) {
        errors.push(`${at}.keys must be a non-empty array.`);
      } else {
        entry.keys.forEach((key, keyIndex) => {
          if (typeof key !== 'string' || !BLOCKER_KEY.test(key)) {
            errors.push(`${at}.keys[${keyIndex}] must be "<kind>:<name>" with a kind of ${BLOCKER_KINDS.join(', ')}.`);
          }
        });
        if (new Set(entry.keys).size !== entry.keys.length) errors.push(`${at}.keys names a key twice.`);
      }
    }

    const hasCoveredBy = Object.hasOwn(entry, 'coveredBy');
    const hasAcceptedRisk = Object.hasOwn(entry, 'acceptedRisk');
    if (hasCoveredBy === hasAcceptedRisk) errors.push(`${at} needs exactly one of "coveredBy" or "acceptedRisk".`);
    if (hasCoveredBy) {
      const id = typeof entry.coveredBy === 'string' ? entry.coveredBy.match(MIGRATION_ID) : null;
      if (!id) {
        errors.push(`${at}.coveredBy must be a data migration id such as "v0.1.31:014_remove_rows".`);
      } else if (trainValid && id[1] !== train) {
        errors.push(`${at}.coveredBy ${entry.coveredBy} belongs to ${id[1]}, not to train ${train}.`);
      }
    }
    if (hasAcceptedRisk && !isText(entry.acceptedRisk)) {
      errors.push(`${at}.acceptedRisk must say why existing rows cannot stop the change.`);
    }
    if (Object.hasOwn(entry, 'note') && !isText(entry.note)) errors.push(`${at}.note must be text when present.`);
    if (errors.length > before) return;

    for (const target of hasTable ? [`table ${entry.table}`] : entry.keys) {
      const slot = `${train} ${target}`;
      if (claimed.has(slot)) {
        errors.push(`${at} repeats ${target} for train ${train}, already in entries[${claimed.get(slot)}].`);
      } else {
        claimed.set(slot, index);
      }
    }
  });

  return {
    entries: errors.length === 0 ? document.entries.map((entry, index) => ({ ...entry, index })) : [],
    errors,
  };
}

/**
 * Matches blockers to entries whose train the base has not reached yet. A key
 * entry covers its keys, and a table entry every blocker on its table.
 * `prunable` entries have a train at or below the base VERSION, so the base
 * already carries their changes. `stale` names what an active entry covers
 * that this diff does not have, with the rule that clears it, if one does.
 */
export function matchCoverage({ blockers, cleared = [], entries, baseVersion }) {
  const active = entries.filter((entry) => compareReleaseVersions(entry.train, baseVersion) > 0);
  const prunable = entries.filter((entry) => compareReleaseVersions(entry.train, baseVersion) <= 0);
  const usedTables = new Set();
  const usedKeys = new Set();
  const covered = [];
  const uncovered = [];
  for (const blocker of blockers) {
    const keyEntries = active.filter((entry) => entry.keys?.includes(blocker.key));
    const tableEntries = active.filter((entry) => entry.table === blocker.table);
    for (const entry of keyEntries) usedKeys.add(`${entry.index} ${blocker.key}`);
    for (const entry of tableEntries) usedTables.add(entry.index);
    const entry = keyEntries[0] ?? tableEntries[0];
    if (entry) covered.push({ ...blocker, entry });
    else uncovered.push(blocker);
  }

  const clearedByKey = new Map(cleared.map((found) => [found.key, found.clearedBy]));
  const stale = [];
  for (const entry of active) {
    if (entry.table !== undefined) {
      if (!usedTables.has(entry.index)) stale.push({ entry, target: `table ${entry.table}` });
      continue;
    }
    for (const key of entry.keys) {
      if (usedKeys.has(`${entry.index} ${key}`)) continue;
      stale.push({ entry, target: key, ...(clearedByKey.has(key) ? { clearedBy: clearedByKey.get(key) } : {}) });
    }
  }
  return { covered, uncovered, prunable, stale };
}

/** An entry to paste for an uncovered blocker. Its `coveredBy` fails validation until someone names the migration. */
export function suggestedEntry(blocker, train) {
  return {
    train,
    keys: [blocker.key],
    coveredBy: `v${train}:<nnn>_<pre-schema migration that removes or fixes these rows>`,
  };
}

/**
 * The base commit, its VERSION, and the `.prisma` files under `prisma/`, which
 * is what Prisma reads from a schema folder.
 */
export function resolveBase({ git, baseRef }) {
  let sha = '';
  try {
    sha = git(['rev-parse', '--verify', '--quiet', `${baseRef}^{commit}`]).trim();
  } catch {
    sha = '';
  }
  if (!/^[0-9a-f]{40,64}$/.test(sha)) {
    const hint = baseRef === DEFAULT_BASE_REF ? `Fetch it with: ${FETCH_HINT}` : 'Fetch it, or pass another --base-ref.';
    throw new CheckError(`Base ref ${baseRef} is not available in this checkout. ${hint}`);
  }
  let version;
  try {
    version = git(['show', `${sha}:VERSION`]).trim();
  } catch {
    throw new CheckError(`${baseRef} has no VERSION file.`);
  }
  if (!RELEASE_VERSION.test(version)) {
    throw new CheckError(`${baseRef}:VERSION is ${JSON.stringify(version)}, not a release version.`);
  }
  const files = git(['ls-tree', '-r', '-z', '--name-only', sha, '--', 'prisma'])
    .split('\0')
    .filter((file) => file.endsWith('.prisma'));
  if (!files.includes('prisma/schema.prisma')) throw new CheckError(`${baseRef} has no prisma/schema.prisma.`);
  return { ref: baseRef, sha, version, files };
}

/** Writes the base schema files under `directory` and returns its `prisma` folder. */
export function copyBaseSchema({ git, base, directory }) {
  for (const file of base.files) {
    const parts = file.split('/');
    if (parts[0] !== 'prisma' || parts.some((part) => part === '' || part === '.' || part === '..')) {
      throw new CheckError(`Unexpected schema path in ${base.ref}: ${JSON.stringify(file)}.`);
    }
    const target = join(directory, ...parts);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, git(['show', `${base.sha}:${file}`]));
  }
  return join(directory, 'prisma');
}

function gitRunner(cwd) {
  return (args) => execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: COMMAND_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * This checkout's Prisma CLI run by the current Node executable: `npx` could
 * fetch a Prisma other than the one this SHA pins.
 */
export function prismaCommand(args) {
  const require = createRequire(import.meta.url);
  return { file: process.execPath, args: [require.resolve('prisma/build/index.js'), ...args] };
}

/** The Prisma process's environment: the caller's, with the offline database URL. */
export function prismaEnvironment(environment = process.env) {
  return { ...environment, DATABASE_URL: OFFLINE_DATABASE_URL };
}

function prismaRunner(args, { cwd }) {
  const command = prismaCommand(args);
  try {
    return execFileSync(command.file, command.args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT_BYTES,
      timeout: COMMAND_TIMEOUT_MS,
      env: prismaEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const output = `${error.stderr ?? ''}${error.stdout ?? ''}`.trim();
    throw new CheckError(`prisma ${args.slice(0, 2).join(' ')} failed: ${output || error.message}`);
  }
}

function emptyResult({ coveragePath, headSchema, headVersion }) {
  return {
    exitCode: 0,
    coveragePath,
    errors: [],
    base: null,
    head: { schema: headSchema, version: headVersion },
    blockers: [],
    cleared: [],
    covered: [],
    uncovered: [],
    prunable: [],
    stale: [],
  };
}

/**
 * Runs the whole check. `git` and `prisma` run commands and return their
 * output; tests replace them. Throws `CheckError` when the check cannot run.
 */
export function runCoverageCheck({
  repoRoot = REPO_ROOT,
  baseRef = DEFAULT_BASE_REF,
  headSchema = DEFAULT_HEAD_SCHEMA,
  coveragePath = DEFAULT_COVERAGE_PATH,
  git = gitRunner(repoRoot),
  prisma = prismaRunner,
  headVersion,
} = {}) {
  const versionFile = resolve(repoRoot, 'VERSION');
  const version = headVersion ?? (existsSync(versionFile) ? readFileSync(versionFile, 'utf8').trim() : '');
  if (!RELEASE_VERSION.test(version)) throw new CheckError(`This checkout's VERSION is ${JSON.stringify(version)}, not a release version.`);
  const result = emptyResult({ coveragePath, headSchema, headVersion: version });

  const coverageFile = resolve(repoRoot, coveragePath);
  if (!existsSync(coverageFile)) throw new CheckError(`Coverage file ${coveragePath} does not exist.`);
  let document;
  try {
    document = JSON.parse(readFileSync(coverageFile, 'utf8'));
  } catch (error) {
    return { ...result, exitCode: 1, errors: [`${coveragePath} is not valid JSON: ${error.message}`] };
  }
  const { entries, errors } = validateCoverage(document, { headVersion: version });
  if (errors.length > 0) return { ...result, exitCode: 1, errors };

  const base = resolveBase({ git, baseRef });
  const directory = mkdtempSync(join(tmpdir(), 'cutover-blocker-base-'));
  try {
    const baseSchema = copyBaseSchema({ git, base, directory });
    const diffSql = prisma(
      ['migrate', 'diff', `--from-schema=${baseSchema}`, `--to-schema=${resolve(repoRoot, headSchema)}`, '--script'],
      { cwd: repoRoot },
    );
    const baseDdl = prisma(['migrate', 'diff', '--from-empty', `--to-schema=${baseSchema}`, '--script'], { cwd: repoRoot });
    const { blockers, cleared } = classifyBlockers({ diffSql, baseDdl });
    const matched = matchCoverage({ blockers, cleared, entries, baseVersion: base.version });
    return {
      ...result,
      exitCode: matched.uncovered.length > 0 ? 1 : 0,
      base: { ref: base.ref, sha: base.sha, version: base.version },
      blockers,
      cleared,
      ...matched,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function describeEntry(entry) {
  return entry.table !== undefined ? `table ${entry.table}` : `${entry.keys.length} key(s)`;
}

function describeClearance(clearedBy) {
  return clearedBy.rule === 'new-nullable-column'
    ? `new nullable column ${clearedBy.column}`
    : `base unique key ${clearedBy.key} (${columnText(clearedBy.columns)})`;
}

export function formatReport(result) {
  if (result.errors.length > 0) {
    return [`FAIL: ${result.coveragePath} is invalid.`, ...result.errors.map((error) => `  ${error}`)].join('\n');
  }
  const { base, head } = result;
  const lines = [
    `Cutover blocker coverage: ${base.ref} ${base.sha.slice(0, 9)} (VERSION ${base.version}) -> ${head.schema} (VERSION ${head.version})`,
  ];
  const counts = BLOCKER_KINDS
    .map((kind) => [kind, result.blockers.filter((blocker) => blocker.kind === kind).length])
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${kind} ${count}`);
  lines.push(`${result.blockers.length} change(s) existing rows could stop${counts.length ? ` (${counts.join(', ')})` : ''}.`);
  lines.push(
    `${result.cleared.length} unique key or foreign key change(s) on existing tables cleared by a new nullable column or a unique key the base already holds.`,
  );

  if (result.covered.length > 0) {
    lines.push('', `Covered (${result.covered.length}):`);
    const groups = new Map();
    for (const blocker of result.covered) {
      const group = groups.get(blocker.entry.index) ?? { entry: blocker.entry, count: 0 };
      group.count += 1;
      groups.set(blocker.entry.index, group);
    }
    for (const { entry, count } of [...groups.values()].sort((left, right) => left.entry.index - right.entry.index)) {
      const answer = entry.coveredBy ?? `accepted risk: ${entry.acceptedRisk}`;
      lines.push(`  ${describeEntry(entry)} [${entry.train}]: ${count} -> ${answer}`);
    }
  }
  if (result.prunable.length > 0) {
    lines.push('', `Prunable (train at or below ${base.version}, which ${base.ref} already carries):`);
    for (const entry of result.prunable) lines.push(`  entries[${entry.index}] ${describeEntry(entry)} [${entry.train}]`);
  }
  if (result.stale.length > 0) {
    lines.push('', 'Stale (not in this diff; remove or correct):');
    for (const item of result.stale) {
      const reason = item.clearedBy ? ` (cleared: ${describeClearance(item.clearedBy)})` : '';
      lines.push(`  entries[${item.entry.index}] ${item.target}${reason}`);
    }
  }
  if (result.uncovered.length === 0) {
    lines.push('', 'PASS: every change existing rows could stop has a reviewed answer.');
    return lines.join('\n');
  }

  lines.push('', `UNCOVERED (${result.uncovered.length}):`);
  for (const blocker of result.uncovered) lines.push(`  ${blocker.key}`, `      ${blocker.table}: ${blocker.detail}`);
  lines.push(
    '',
    `Add each to ${result.coveragePath}, naming the pre-schema migration that removes or fixes the rows:`,
    ...result.uncovered.map((blocker) => `  ${JSON.stringify(suggestedEntry(blocker, head.version))},`),
    'When no row needs to change, replace "coveredBy" with "acceptedRisk": "<why existing rows cannot stop it>".',
    'A {"table": ...} entry covers every change on a table its migration empties.',
    '',
    `FAIL: ${result.uncovered.length} change(s) existing rows could stop have no reviewed answer.`,
  );
  return lines.join('\n');
}

export function parseArguments(argv) {
  const options = {
    baseRef: DEFAULT_BASE_REF,
    headSchema: DEFAULT_HEAD_SCHEMA,
    coveragePath: DEFAULT_COVERAGE_PATH,
    json: false,
    help: false,
  };
  const valued = { '--base-ref': 'baseRef', '--head-schema': 'headSchema', '--coverage': 'coveragePath' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') {
      options.json = true;
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    const equals = argument.indexOf('=');
    const flag = equals === -1 ? argument : argument.slice(0, equals);
    const option = valued[flag];
    if (!option) throw new CheckError(`Unknown argument ${JSON.stringify(argument)}.\n\n${USAGE}`);
    const raw = equals === -1 ? argv[index + 1] : argument.slice(equals + 1);
    if (equals === -1) index += 1;
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value === '' || value.startsWith('--')) throw new CheckError(`${flag} needs a value.`);
    options[option] = value;
  }
  return options;
}

export function main(argv, { log = console.log, error = console.error } = {}) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (problem) {
    error(problem.message);
    return 2;
  }
  if (options.help) {
    log(USAGE);
    return 0;
  }
  try {
    const { json, help, ...check } = options;
    const result = runCoverageCheck(check);
    log(json ? JSON.stringify(result, null, 2) : formatReport(result));
    return result.exitCode;
  } catch (problem) {
    error(`check:cutover-blocker-coverage could not run: ${problem.message}`);
    return 2;
  }
}

const isEntrypoint = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isEntrypoint) {
  process.exitCode = main(process.argv.slice(2));
}
