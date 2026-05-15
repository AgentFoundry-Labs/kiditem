#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
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

export function migrationReleaseFromPath(file) {
  const match = file.match(/^scripts\/data-migrations\/v([^/]+)\/[^/]+\.ts$/);
  return match?.[1] ?? null;
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
    reasons.push('staging/fresh database baseline change');
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
  migrationIndex,
}) {
  const errors = [];
  const requiredReasons = classifyFiles(files);
  const version = rootVersion.trim();

  if (!isSemver(version)) {
    errors.push(`Root VERSION must be semver, got "${rootVersion}"`);
  }

  if (requiredReasons.length > 0 && !hasReleaseDecision(prBody)) {
    errors.push('Release decision: field is required for persisted schema/data/release changes.');
  }

  const migrationFiles = files
    .filter((file) => /^scripts\/data-migrations\/v[^/]+\/[^/]+\.ts$/.test(file))
    .filter((file) => !file.endsWith('/index.ts') && !file.endsWith('/types.ts'));

  for (const file of migrationFiles) {
    const migration = migrationNameFromPath(file);
    if (!migration) continue;
    if (migration.release !== version) {
      errors.push(`${file} release v${migration.release} does not match root VERSION ${version}.`);
    }
    const expectedImportPath = `./v${migration.release}/${migration.basename}`;
    if (!migrationIndex.includes(expectedImportPath)) {
      errors.push(`${file} is not registered in scripts/data-migrations/index.ts.`);
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
  const prBody = readPrBody(args);
  const result = analyzePrReleaseContract({
    files,
    prBody,
    rootVersion: readFileSync(path.join(root, 'VERSION'), 'utf8'),
    migrationIndex: readFileSync(path.join(root, 'scripts/data-migrations/index.ts'), 'utf8'),
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
