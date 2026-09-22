#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function git(args, cwd = repoRoot()) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function gitBytes(args, cwd = repoRoot()) {
  return execFileSync('git', args, { cwd, encoding: 'buffer' });
}

function gitSucceeds(args, cwd = repoRoot()) {
  try {
    execFileSync('git', args, { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function camelCase(flag) {
  return flag.replace(/-([a-z0-9])/g, (_, character) => character.toUpperCase());
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    // Flags are read as camelCase properties, so `--body-file` has to land on
    // `bodyFile` rather than on a key no reader spells.
    args[camelCase(key.slice(2))] = argv[i + 1];
    i += 1;
  }
  return args;
}

function changedFilesFromGit(base, head) {
  const output = git(['diff', '--name-only', `${base}...${head}`]);
  return output ? output.split('\n').filter(Boolean) : [];
}

function deletedFilesFromGit(base, head) {
  const output = git(['diff', '--name-only', '--diff-filter=D', `${base}...${head}`]);
  return output ? output.split('\n').filter(Boolean) : [];
}

function ghPrBody() {
  try {
    return execFileSync(
      'gh',
      ['pr', 'view', '--json', 'body', '--jq', '.body'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
  } catch {
    return '';
  }
}

function readPrBody({ body, bodyFile, event }) {
  if (body) return body;
  if (process.env.GITHUB_ACTIONS === 'true') {
    const live = ghPrBody();
    if (live) return live;
  }
  const file = bodyFile || event || process.env.GITHUB_EVENT_PATH;
  if (file && existsSync(file)) {
    const raw = readFileSync(file, 'utf8');
    try {
      const parsed = JSON.parse(raw);
      return parsed.pull_request?.body || parsed.body || '';
    } catch {
      return raw;
    }
  }
  return ghPrBody();
}

function hasReleaseDecision(prBody) {
  const match = prBody.match(/Release decision[*_`]*\s*:\s*([^\n\r]+)/i);
  const value = (match?.[1] ?? '').trim();
  return Boolean(value) && !/^(?:TBD|TODO|N\/A|-|_)$/i.test(value);
}

function isSemver(version) {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version.trim());
}

function compareSemver(a, b) {
  const parse = (value) => value
    .trim()
    .split(/[+-]/, 1)[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10));
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] > right[i]) return 1;
    if (left[i] < right[i]) return -1;
  }
  return 0;
}

// Branches that receive trains from develop. A migration whose release is at
// or below the higher VERSION of the two is immutable. Office deploys from
// `release/office`, which root CLAUDE.md keeps as the live operational anchor,
// so a train on it may already be in the Office migration ledger while `main`
// still carries an older train. `main` still receives develop -> main
// promotions, so both branches count.
const PROMOTED_BRANCHES = Object.freeze(['release/office', 'main']);

export function isDevelopPromotion({ baseRef, headRef }) {
  return headRef === 'develop' && PROMOTED_BRANCHES.includes(baseRef);
}

function readPrMetadata({ event }) {
  const file = event || process.env.GITHUB_EVENT_PATH;
  let metadata = {
    baseRef: process.env.GITHUB_BASE_REF || '',
    headRef: process.env.GITHUB_HEAD_REF || '',
  };

  if (!file || !existsSync(file)) return metadata;

  try {
    const raw = readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    metadata = {
      baseRef: parsed.pull_request?.base?.ref || metadata.baseRef,
      headRef: parsed.pull_request?.head?.ref || metadata.headRef,
    };
  } catch {
    // Keep the environment-derived fallback metadata.
  }

  return metadata;
}

function readVersionAtRef(ref) {
  if (!ref) return '';
  try {
    return execFileSync('git', ['show', `${ref}:VERSION`], {
      cwd: repoRoot(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * The immutable boundary: the highest VERSION readable from the promoted
 * branches. A PR that targets one of those branches reads it from its own
 * base; the other branch is read from `origin/<branch>`. `promotedRefs` lists
 * every readable ref, because inactive lineage may be pinned to a commit that
 * only a promoted branch contains.
 */
export function resolvePromotedBoundary({
  baseRef = '',
  base = '',
  readVersionAtRef: readVersion = readVersionAtRef,
} = {}) {
  let promotedVersion = '';
  const promotedRefs = [];
  const unreadableRefs = [];
  for (const branch of PROMOTED_BRANCHES) {
    const ref = baseRef === branch && base ? base : `origin/${branch}`;
    const version = String(readVersion(ref) ?? '').trim();
    if (!isSemver(version)) {
      unreadableRefs.push(ref);
      continue;
    }
    promotedRefs.push(ref);
    if (!promotedVersion || compareSemver(version, promotedVersion) > 0) {
      promotedVersion = version;
    }
  }
  return { promotedVersion, promotedRefs, unreadableRefs };
}

function readTextAtRef(ref, file) {
  if (!ref) return null;
  try {
    return execFileSync('git', ['show', `${ref}:${file}`], {
      cwd: repoRoot(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

export function migrationReleaseFromPath(file) {
  const match = file.match(/^scripts\/data-migrations\/v([^/]+)\/[^/]+\.ts$/);
  return match?.[1] ?? null;
}

const APPLIED_MIGRATION_BASELINE_PREFIX = /^\s*(?:[-*]\s*)?Applied migration baseline\s*:/i;
const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/;

export function parseAppliedMigrationBaselines(prBody) {
  const declarations = [];
  const errors = [];
  const seenPaths = new Set();
  for (const [index, line] of String(prBody ?? '').split(/\r?\n/).entries()) {
    if (!APPLIED_MIGRATION_BASELINE_PREFIX.test(line)) continue;
    const match = line.match(
      /^\s*(?:[-*]\s*)?Applied migration baseline\s*:\s*(\S+)\s+(\S+)\s*$/i,
    );
    if (!match) {
      errors.push(`Applied migration baseline line ${index + 1} is malformed.`);
      continue;
    }
    const [, commit, migrationPath] = match;
    if (seenPaths.has(migrationPath)) {
      errors.push(`Applied migration baseline for ${migrationPath} is duplicated.`);
      continue;
    }
    seenPaths.add(migrationPath);
    declarations.push({ commit, path: migrationPath });
  }
  return { declarations, errors };
}

function hasExecutableMigrationRegistration(indexText, importPath) {
  const escaped = importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const importPattern = new RegExp(
    `import\\s*{([^}]+)}\\s*from\\s*["']${escaped}["']`,
    'g',
  );
  const bindings = new Set();
  for (const match of String(indexText ?? '').matchAll(importPattern)) {
    for (const imported of match[1].split(',')) {
      const parts = imported.trim().split(/\\s+as\\s+/);
      const localBinding = parts.at(-1)?.trim();
      if (localBinding) bindings.add(localBinding);
    }
  }
  const registryBody = String(indexText ?? '').match(
    /\bdataMigrations\s*(?::[^=]+)?=\s*\[([\s\S]*?)]\s*;/,
  )?.[1];
  if (!registryBody) return false;
  const registeredBindings = new Set(
    registryBody.match(/[A-Za-z_$][\w$]*/g) ?? [],
  );
  return [...bindings].some((binding) => registeredBindings.has(binding));
}

export function verifyAppliedMigrationBaseline({
  root,
  head,
  migrationPath,
  baselineCommit,
  expectedRelease,
  candidateBytes,
  // Refs besides the checked head that may contain the baseline. Only inactive
  // lineage passes promoted refs; a PR-body declaration stays head-only.
  ancestorRefs = [],
}) {
  const errors = [];
  const migration = migrationNameFromPath(migrationPath);
  if (!migration || migration.release !== expectedRelease) {
    errors.push(`${migrationPath} is not the canonical migration path for release v${expectedRelease}.`);
    return { errors };
  }
  if (!FULL_COMMIT_SHA.test(baselineCommit ?? '')) {
    errors.push(`${migrationPath} baseline must use a full 40-character commit SHA.`);
    return { errors };
  }
  let resolvedCommit = '';
  try {
    resolvedCommit = git(['rev-parse', '--verify', `${baselineCommit}^{commit}`], root);
  } catch {
    resolvedCommit = '';
  }
  if (resolvedCommit !== baselineCommit) {
    errors.push(`${migrationPath} baseline commit ${baselineCommit} does not exist as a commit.`);
    return { errors };
  }
  const reachable = Boolean(head) && [head, ...ancestorRefs].some((ref) => (
    Boolean(ref) && gitSucceeds(['merge-base', '--is-ancestor', baselineCommit, ref], root)
  ));
  if (!reachable) {
    const promoted = ancestorRefs.length > 0
      ? ` or of promoted refs ${ancestorRefs.join(', ')}`
      : '';
    errors.push(`${migrationPath} baseline commit ${baselineCommit} is not an ancestor of checked head ${head || '<missing>'}${promoted}.`);
    return { errors };
  }

  let baselineVersion;
  let baselineIndex;
  let baselineBytes;
  try {
    baselineVersion = git(['show', `${baselineCommit}:VERSION`], root);
    baselineIndex = git(['show', `${baselineCommit}:scripts/data-migrations/index.ts`], root);
    baselineBytes = gitBytes(['show', `${baselineCommit}:${migrationPath}`], root);
  } catch {
    errors.push(`${migrationPath} baseline commit ${baselineCommit} does not contain the required release artifacts.`);
    return { errors };
  }
  if (baselineVersion.trim() !== expectedRelease) {
    errors.push(
      `${migrationPath} baseline commit ${baselineCommit} has VERSION ${baselineVersion.trim() || '<missing>'}, expected ${expectedRelease}.`,
    );
  }
  const expectedImportPath = `./v${expectedRelease}/${migration.basename}`;
  if (!hasExecutableMigrationRegistration(baselineIndex, expectedImportPath)) {
    errors.push(`${migrationPath} is not registered in the baseline migration index at ${baselineCommit}.`);
  }
  if (!Buffer.isBuffer(candidateBytes) || !Buffer.isBuffer(baselineBytes)
    || !candidateBytes.equals(baselineBytes)) {
    errors.push(`${migrationPath} candidate bytes differ from the immutable baseline at ${baselineCommit}.`);
  }
  return { errors };
}

function migrationNameFromPath(file) {
  const release = migrationReleaseFromPath(file);
  if (!release) return null;
  return {
    release,
    basename: path.basename(file, '.ts'),
  };
}

function migrationImportPath(file) {
  const prefix = 'scripts/data-migrations/';
  if (!file.startsWith(prefix) || !file.endsWith('.ts')) return null;
  return `./${file.slice(prefix.length, -3)}`;
}

export function registeredMigrationPaths(indexText) {
  const paths = new Set();
  const pattern = /(?:from|import\s*\()\s*["'](\.\/v[^/]+\/[^"']+)["']/g;
  for (const match of String(indexText ?? '').matchAll(pattern)) {
    if (hasExecutableMigrationRegistration(indexText, match[1])) {
      paths.add(`scripts/data-migrations/${match[1].slice(2)}.ts`);
    }
  }
  return paths;
}

function candidateBytes(candidateBytesByPath, file) {
  return candidateBytesByPath instanceof Map
    ? candidateBytesByPath.get(file)
    : candidateBytesByPath[file];
}

function fileDeclaresMigrationId(bytes, migrationId) {
  if (!Buffer.isBuffer(bytes)) return false;
  const escaped = migrationId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\bid\\s*:\\s*["']${escaped}["']`).test(bytes.toString('utf8'));
}

function lineageSourcePath(entry) {
  return typeof entry.sourcePath === 'string' ? entry.sourcePath : '';
}

// An inactive lineage entry describes a migration that no longer runs.
function candidateRegistrationErrors({ entry, migrationIndex }) {
  const importPath = migrationImportPath(lineageSourcePath(entry));
  if (importPath && hasExecutableMigrationRegistration(migrationIndex, importPath)) {
    return [
      `${entry.sourcePath} is still registered in the candidate executable migration index, so it cannot be inactive lineage.`,
    ];
  }
  return [];
}

// Lineage added after the registration already left the base registry: the
// migration must belong to a promoted train, and neither registry may run it.
function lateLineageAdmissionErrors({
  entry,
  promotedVersion,
  migrationIndex,
  baseMigrationIndex,
}) {
  const label = lineageSourcePath(entry) || '<missing>';
  if (!isSemver(promotedVersion)) {
    return [
      `${label} cannot gain late inactive lineage because no promoted VERSION (release/office or main) is readable.`,
    ];
  }
  const release = typeof entry.releaseVersion === 'string' ? entry.releaseVersion : '';
  if (!isSemver(release)) {
    return [`${label} inactive lineage has an invalid releaseVersion.`];
  }
  if (compareSemver(release, promotedVersion) > 0) {
    return [
      `${label} inactive lineage release v${release} is above promoted VERSION ${promotedVersion}, so it cannot gain late inactive lineage.`,
    ];
  }
  const importPath = migrationImportPath(label);
  if (
    importPath && (
      hasExecutableMigrationRegistration(baseMigrationIndex, importPath) ||
      hasExecutableMigrationRegistration(migrationIndex, importPath)
    )
  ) {
    return [
      `${label} is still registered in the base or candidate executable migration index, so it cannot gain late inactive lineage.`,
    ];
  }
  return [];
}

function verifyRetiredMigrationLineage({
  entry,
  migrationIndex,
  candidateBytesByPath,
  root,
  head,
  ancestorRefs = [],
}) {
  const errors = [];
  const source = migrationNameFromPath(entry.sourcePath ?? '');
  const expectedSourceId = source ? `v${source.release}:${source.basename}` : null;
  if (!source || entry.releaseVersion !== source.release || entry.id !== expectedSourceId) {
    errors.push(`${entry.sourcePath ?? '<missing>'} has inconsistent inactive migration identity.`);
    return errors;
  }
  if (!/^[0-9a-f]{64}$/.test(entry.sourceSha256 ?? '')) {
    errors.push(`${entry.sourcePath} inactive lineage must declare a lowercase SHA-256.`);
  }

  const sourceBytes = candidateBytes(candidateBytesByPath, entry.sourcePath);
  const verification = verifyAppliedMigrationBaseline({
    root,
    head,
    migrationPath: entry.sourcePath,
    baselineCommit: entry.baselineCommit,
    expectedRelease: entry.releaseVersion,
    candidateBytes: sourceBytes,
    ancestorRefs,
  });
  errors.push(...verification.errors);
  if (
    !Buffer.isBuffer(sourceBytes) ||
    createHash('sha256').update(sourceBytes).digest('hex') !== entry.sourceSha256
  ) {
    errors.push(`${entry.sourcePath} does not match its inactive lineage SHA-256.`);
  }

  if (!Array.isArray(entry.replacementMigrations) || entry.replacementMigrations.length === 0) {
    errors.push(`${entry.sourcePath} inactive lineage must name at least one replacement migration.`);
    return errors;
  }
  const replacementIds = new Set();
  const replacementPaths = new Set();
  for (const replacementEntry of entry.replacementMigrations) {
    const replacement = migrationNameFromPath(replacementEntry.path ?? '');
    const expectedReplacementId = replacement
      ? `v${replacement.release}:${replacement.basename}`
      : null;
    if (!replacement || replacementEntry.id !== expectedReplacementId) {
      errors.push(`${entry.sourcePath} has inconsistent replacement migration identity.`);
      continue;
    }
    if (replacementIds.has(replacementEntry.id) || replacementPaths.has(replacementEntry.path)) {
      errors.push(`${entry.sourcePath} has a duplicated replacement migration.`);
      continue;
    }
    replacementIds.add(replacementEntry.id);
    replacementPaths.add(replacementEntry.path);
    const replacementImportPath = migrationImportPath(replacementEntry.path);
    if (
      !replacementImportPath ||
      !hasExecutableMigrationRegistration(migrationIndex, replacementImportPath)
    ) {
      errors.push(
        `${entry.sourcePath} replacement ${replacementEntry.id} is not registered in the executable migration index.`,
      );
    }
    if (
      !fileDeclaresMigrationId(
        candidateBytes(candidateBytesByPath, replacementEntry.path),
        replacementEntry.id,
      )
    ) {
      errors.push(`${replacementEntry.path} does not declare replacement id ${replacementEntry.id}.`);
    }
  }
  return errors;
}

function classifyFiles(files) {
  const reasons = [];
  if (files.some((file) => (
    file === 'prisma/schema.prisma' ||
    file === 'prisma.config.ts' ||
    /^prisma\/models\/.+\.prisma$/.test(file)
  ))) {
    reasons.push('Prisma schema/model change');
  }
  if (files.some((file) => /^scripts\/data-migrations\//.test(file))) {
    reasons.push('durable data migration change');
  }
  if (files.some((file) => (
    /^scripts\/dev-data/.test(file) ||
    file === 'docs/DEV_DATA_BUNDLES.md' ||
    /^docs\/runbooks\/google-drive-dev-data\.md$/.test(file)
  ))) {
    reasons.push('development data workflow change');
  }
  if (files.some((file) => (
    file === 'prisma/init.sql.gz' ||
    file === 'deployments/current-db.json' ||
    /^deployments\/db-history\//.test(file)
  ))) {
    reasons.push('local/Office fresh database baseline change');
  }
  if (files.includes('VERSION')) {
    reasons.push('release VERSION change');
  }
  return reasons;
}

export function analyzePrReleaseContract({
  files,
  prBody,
  rootVersion,
  baseVersion = '',
  migrationIndex,
  baseMigrationIndex = '',
  promotedVersion = '',
  promotedRefs = [],
  retiredMigrations = [],
  baseRetiredMigrations = [],
  allowHistoricalMigrationVersions = false,
  deletedFiles = [],
  root = repoRoot(),
  head = 'HEAD',
  candidateBytesByPath = new Map(),
}) {
  const errors = [];
  const requiredReasons = classifyFiles(files);
  const version = rootVersion.trim();
  const base = baseVersion.trim();

  if (!isSemver(version)) {
    errors.push(`Root VERSION must be semver, got "${rootVersion}"`);
  }

  if (
    files.includes('VERSION') &&
    isSemver(version) &&
    isSemver(base) &&
    compareSemver(version, base) <= 0
  ) {
    errors.push(
      `Root VERSION ${version} must be higher than base VERSION ${base} when VERSION changes.`,
    );
  }

  if (requiredReasons.length > 0 && !hasReleaseDecision(prBody)) {
    errors.push('Release decision: field is required for persisted schema/data/release changes.');
  }

  const deletedFileSet = new Set(deletedFiles);
  const { declarations: baselineDeclarations, errors: baselineDeclarationErrors } =
    parseAppliedMigrationBaselines(prBody);
  errors.push(...baselineDeclarationErrors);
  const declarationsByPath = new Map(
    baselineDeclarations.map((declaration) => [declaration.path, declaration]),
  );
  const migrationFiles = files
    .filter((file) => /^scripts\/data-migrations\/v[^/]+\/[^/]+\.ts$/.test(file))
    .filter((file) => !deletedFileSet.has(file))
    .filter((file) => !file.endsWith('/index.ts') && !file.endsWith('/types.ts'));

  const candidateRegisteredPaths = registeredMigrationPaths(migrationIndex);
  const retirementByPath = new Map();
  for (const entry of retiredMigrations) {
    if (retirementByPath.has(entry.sourcePath)) {
      errors.push(`Inactive migration lineage for ${entry.sourcePath} is duplicated.`);
      continue;
    }
    retirementByPath.set(entry.sourcePath, entry);
  }
  const baseRetirementByPath = new Map();
  for (const entry of baseRetiredMigrations) {
    if (baseRetirementByPath.has(entry.sourcePath)) {
      errors.push(`Base inactive migration lineage for ${entry.sourcePath} is duplicated.`);
      continue;
    }
    baseRetirementByPath.set(entry.sourcePath, entry);
    const candidateEntry = retirementByPath.get(entry.sourcePath);
    if (!candidateEntry) {
      errors.push(`${entry.sourcePath} inactive lineage entry was removed.`);
    } else if (!isDeepStrictEqual(candidateEntry, entry)) {
      errors.push(`${entry.sourcePath} inactive lineage entry was altered.`);
    }
  }
  const removedBasePaths = [...registeredMigrationPaths(baseMigrationIndex)]
    .filter((registeredPath) => !candidateRegisteredPaths.has(registeredPath));
  if (removedBasePaths.length > 0 && !isSemver(promotedVersion)) {
    errors.push(
      'The release contract cannot verify promoted migration removals because no promoted VERSION (release/office or main) is readable.',
    );
  }
  const removedPromotedPaths = removedBasePaths.filter((registeredPath) => {
    const migration = migrationNameFromPath(registeredPath);
    return migration && isSemver(promotedVersion)
      && compareSemver(migration.release, promotedVersion) <= 0;
  });
  const removedPromotedPathSet = new Set(removedPromotedPaths);
  for (const baseRegisteredPath of removedPromotedPaths) {
    const retirement = retirementByPath.get(baseRegisteredPath);
    if (!retirement) {
      errors.push(
        `${baseRegisteredPath} was removed from the executable registry without inactive lineage.`,
      );
    }
  }
  // Every entry is re-verified on every run. An entry that is neither in the
  // base catalog nor removed by this change is late lineage for a promoted
  // migration whose registration already left without it.
  for (const entry of retiredMigrations) {
    const isLateLineage =
      !baseRetirementByPath.has(entry.sourcePath) &&
      !removedPromotedPathSet.has(entry.sourcePath);
    const admissionErrors = isLateLineage
      ? lateLineageAdmissionErrors({
        entry,
        promotedVersion,
        migrationIndex,
        baseMigrationIndex,
      })
      : candidateRegistrationErrors({ entry, migrationIndex });
    if (admissionErrors.length > 0) {
      errors.push(...admissionErrors);
      continue;
    }
    errors.push(...verifyRetiredMigrationLineage({
      entry,
      migrationIndex,
      candidateBytesByPath,
      root,
      head,
      ancestorRefs: promotedRefs,
    }));
  }

  for (const file of migrationFiles) {
    const migration = migrationNameFromPath(file);
    if (!migration) continue;
    const declaration = declarationsByPath.get(file);
    if (retirementByPath.has(file)) {
      // An inactive source is unregistered on purpose, and a promotion diff can
      // carry it. Its lineage entry above pins these bytes to the baseline on
      // every run, so the registry and declaration rules do not apply.
      if (declaration) {
        errors.push(
          `${file} has inactive lineage in retired.json, so it cannot also carry an Applied migration baseline declaration.`,
        );
      }
      continue;
    }
    const isCurrentRelease = migration.release === version;
    const isHistoricalPromotionRelease =
      allowHistoricalMigrationVersions &&
      isSemver(migration.release) &&
      isSemver(base) &&
      isSemver(version) &&
      compareSemver(migration.release, base) > 0 &&
      compareSemver(migration.release, version) <= 0;
    const isHistoricalMigration =
      isSemver(migration.release) &&
      isSemver(version) &&
      compareSemver(migration.release, version) < 0;
    if (!isCurrentRelease && !isHistoricalPromotionRelease && !isHistoricalMigration) {
      errors.push(`${file} release v${migration.release} does not match root VERSION ${version}.`);
    }
    const expectedImportPath = `./v${migration.release}/${migration.basename}`;
    if (!migrationIndex.includes(expectedImportPath)) {
      errors.push(`${file} is not registered in scripts/data-migrations/index.ts.`);
    }
    if (declaration && !hasExecutableMigrationRegistration(migrationIndex, expectedImportPath)) {
      errors.push(`${file} is not exactly registered in the candidate migration index.`);
    }

    if (!isCurrentRelease && !isHistoricalPromotionRelease && !declaration) {
      errors.push(`${file} is an applied historical migration and requires an Applied migration baseline declaration.`);
    }
    if (declaration) {
      const candidateBytes = candidateBytesByPath instanceof Map
        ? candidateBytesByPath.get(file)
        : candidateBytesByPath[file];
      const verification = verifyAppliedMigrationBaseline({
        root,
        head,
        migrationPath: file,
        baselineCommit: declaration.commit,
        expectedRelease: migration.release,
        candidateBytes,
      });
      errors.push(...verification.errors);
    }
  }

  for (const declaration of baselineDeclarations) {
    const migration = migrationNameFromPath(declaration.path);
    if (!migration) {
      errors.push(`${declaration.path} is not a canonical data migration path.`);
      continue;
    }
    if (!files.includes(declaration.path) && !deletedFileSet.has(declaration.path)) {
      errors.push(`Applied migration baseline ${declaration.path} does not match a changed migration file.`);
    }
    if (deletedFileSet.has(declaration.path)) {
      errors.push(`${declaration.path} is declared as an applied migration baseline but is deleted or renamed.`);
    }
  }

  return { requiredReasons, errors };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const base =
    args.base ||
    (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/develop');
  const head = args.head || 'HEAD';
  const root = repoRoot();
  const files = args.files
    ? args.files.split(',').map((file) => file.trim()).filter(Boolean)
    : changedFilesFromGit(base, head);
  const deletedFiles = deletedFilesFromGit(base, head);
  const prBody = readPrBody(args);
  const prMetadata = readPrMetadata({ event: args.event });
  const allowHistoricalMigrationVersions = isDevelopPromotion(prMetadata);
  const migrationIndexPath = 'scripts/data-migrations/index.ts';
  const retirementCatalogPath = 'scripts/data-migrations/retired.json';
  const migrationIndex = readFileSync(path.join(root, migrationIndexPath), 'utf8');
  const baseMigrationIndex = readTextAtRef(base, migrationIndexPath) ?? '';
  const { promotedVersion, promotedRefs, unreadableRefs } = resolvePromotedBoundary({
    baseRef: prMetadata.baseRef,
    base,
  });
  for (const ref of unreadableRefs) {
    console.warn(
      `check:pr-release-contract WARN — cannot read VERSION at ${ref}; run \`git fetch origin main develop release/office\` so the promoted boundary includes it.`,
    );
  }
  let retiredMigrations = [];
  let baseRetiredMigrations = [];
  let retirementCatalogError = '';
  try {
    retiredMigrations = JSON.parse(
      readFileSync(path.join(root, retirementCatalogPath), 'utf8'),
    );
    if (!Array.isArray(retiredMigrations)) {
      retirementCatalogError = `${retirementCatalogPath} must contain a JSON array.`;
      retiredMigrations = [];
    }
  } catch (error) {
    retirementCatalogError = `${retirementCatalogPath} is invalid: ${error instanceof Error ? error.message : String(error)}`;
  }
  const baseRetirementCatalog = readTextAtRef(base, retirementCatalogPath);
  if (baseRetirementCatalog !== null) {
    try {
      baseRetiredMigrations = JSON.parse(baseRetirementCatalog);
      if (!Array.isArray(baseRetiredMigrations)) {
        retirementCatalogError = `${retirementCatalogPath} at ${base} must contain a JSON array.`;
        baseRetiredMigrations = [];
      }
    } catch (error) {
      retirementCatalogError = `${retirementCatalogPath} at ${base} is invalid: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  const candidateBytesByPath = new Map();
  const candidateMigrationPaths = new Set(
    files.filter((file) => /^scripts\/data-migrations\/v[^/]+\/[^/]+\.ts$/.test(file)),
  );
  for (const retiredMigration of retiredMigrations) {
    if (typeof retiredMigration.sourcePath === 'string') {
      candidateMigrationPaths.add(retiredMigration.sourcePath);
    }
    if (Array.isArray(retiredMigration.replacementMigrations)) {
      for (const replacement of retiredMigration.replacementMigrations) {
        if (typeof replacement.path === 'string') {
          candidateMigrationPaths.add(replacement.path);
        }
      }
    }
  }
  for (const file of candidateMigrationPaths) {
    try {
      candidateBytesByPath.set(
        file,
        args.head
          ? gitBytes(['show', `${head}:${file}`], root)
          : readFileSync(path.join(root, file)),
      );
    } catch {
      candidateBytesByPath.set(file, undefined);
    }
  }
  const result = analyzePrReleaseContract({
    files,
    prBody,
    rootVersion: readFileSync(path.join(root, 'VERSION'), 'utf8'),
    baseVersion: readVersionAtRef(base),
    migrationIndex,
    baseMigrationIndex,
    promotedVersion,
    promotedRefs,
    retiredMigrations,
    baseRetiredMigrations,
    allowHistoricalMigrationVersions,
    deletedFiles,
    root,
    head,
    candidateBytesByPath,
  });
  if (retirementCatalogError) result.errors.unshift(retirementCatalogError);

  if (result.errors.length === 0) {
    if (result.requiredReasons.length === 0) {
      console.log('check:pr-release-contract PASS — no persisted schema/data release trigger');
    } else {
      console.log('check:pr-release-contract PASS');
      console.log(`Release/data triggers: ${result.requiredReasons.join('; ')}`);
    }
    return;
  }

  console.error('check:pr-release-contract FAIL');
  if (result.requiredReasons.length > 0) {
    console.error(`Release/data triggers: ${result.requiredReasons.join('; ')}`);
  }
  for (const error of result.errors) console.error(`- ${error}`);
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
