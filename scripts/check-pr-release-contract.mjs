#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
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

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1];
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

function isDevelopToMainPromotion({ baseRef, headRef }) {
  return baseRef === 'main' && headRef === 'develop';
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
    return git(['show', `${ref}:VERSION`]);
  } catch {
    return '';
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

function hasExactMigrationRegistration(indexText, importPath) {
  const escaped = importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:from|import\\s*\\()\\s*["']${escaped}["']`).test(indexText);
}

export function verifyAppliedMigrationBaseline({
  root,
  head,
  migrationPath,
  baselineCommit,
  expectedRelease,
  candidateBytes,
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
  if (!head || !gitSucceeds(['merge-base', '--is-ancestor', baselineCommit, head], root)) {
    errors.push(`${migrationPath} baseline commit ${baselineCommit} is not an ancestor of checked head ${head || '<missing>'}.`);
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
  if (!hasExactMigrationRegistration(baselineIndex, expectedImportPath)) {
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

  for (const file of migrationFiles) {
    const migration = migrationNameFromPath(file);
    if (!migration) continue;
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
    const declaration = declarationsByPath.get(file);
    const expectedImportPath = `./v${migration.release}/${migration.basename}`;
    if (!migrationIndex.includes(expectedImportPath)) {
      errors.push(`${file} is not registered in scripts/data-migrations/index.ts.`);
    }
    if (declaration && !hasExactMigrationRegistration(migrationIndex, expectedImportPath)) {
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
  const allowHistoricalMigrationVersions = isDevelopToMainPromotion(prMetadata);
  const candidateBytesByPath = new Map();
  for (const file of files) {
    if (!/^scripts\/data-migrations\/v[^/]+\/[^/]+\.ts$/.test(file)) continue;
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
    migrationIndex: readFileSync(path.join(root, 'scripts/data-migrations/index.ts'), 'utf8'),
    allowHistoricalMigrationVersions,
    deletedFiles,
    root,
    head,
    candidateBytesByPath,
  });

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
