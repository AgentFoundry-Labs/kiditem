#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPT_INVENTORY = Object.freeze([
  'check-agents-hygiene.mjs',
  'check-directory-architecture.mjs',
  'check-frontend-db-boundary.sh',
  'check-pr-reconstruction-contract.mjs',
  'check-queryraw-tenancy.sh',
  'check-raw-snapshot-read-models.sh',
  'check-schema-artifact-sync.mjs',
  'check-script-inventory.mjs',
  'check-shared-root-imports.sh',
  'check-tenant-scope.sh',
  'create-dev-preview-session.mjs',
  'dev-data-coupang.ts',
  'dev-data.ts',
  'generate-prisma-erd.mjs',
  'generate-schema-graphify.py',
  'import-baseline-planner.ts',
  'import-product-baseline.ts',
  'prepare-coupang-extension.mjs',
  'seed-agent-os.ts',
  'staging-db-baseline.ts',
  'sync-supabase-user.ts',
  'vitest.config.ts',
]);

const SUPPORT_FILES = new Set([
  '.shared-root-imports-baseline.txt',
  '.tenant-scope-allowlist.txt',
  'README.md',
]);

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function listTopLevelScriptFiles(scriptsDir) {
  return readdirSync(scriptsDir, { withFileTypes: true })
    .filter((entry) => {
      if (entry.isDirectory()) return false;
      if (!entry.isFile()) return false;
      if (SUPPORT_FILES.has(entry.name)) return false;
      if (entry.name.endsWith('.test.mjs')) return false;
      return /\.(mjs|ts|sh|py|sql)$/.test(entry.name);
    })
    .map((entry) => entry.name)
    .sort();
}

export function analyzeInventory({ actualFiles, readme, packageScripts }) {
  const expected = [...SCRIPT_INVENTORY].sort();
  const actual = [...actualFiles].sort();
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);

  const unexpected = actual.filter((file) => !expectedSet.has(file));
  const missing = expected.filter((file) => !actualSet.has(file));
  const undocumented = expected.filter((file) => !readme.includes(`scripts/${file}`));

  const missingPackageHooks = [];
  if (!packageScripts['check:scripts-inventory']) {
    missingPackageHooks.push('check:scripts-inventory');
  }
  if (!packageScripts['check:schema-artifact-sync']) {
    missingPackageHooks.push('check:schema-artifact-sync');
  }
  if (!packageScripts['check:directory-architecture']) {
    missingPackageHooks.push('check:directory-architecture');
  }
  if (!packageScripts['test:scripts']) {
    missingPackageHooks.push('test:scripts');
  }
  if (!packageScripts['check:conventions']?.includes('check:scripts-inventory')) {
    missingPackageHooks.push('check:conventions -> check:scripts-inventory');
  }
  if (!packageScripts['check:conventions']?.includes('check:schema-artifact-sync')) {
    missingPackageHooks.push('check:conventions -> check:schema-artifact-sync');
  }
  if (!packageScripts['check:conventions']?.includes('check:directory-architecture')) {
    missingPackageHooks.push('check:conventions -> check:directory-architecture');
  }

  return { unexpected, missing, undocumented, missingPackageHooks };
}

function main() {
  const root = repoRoot();
  const actualFiles = listTopLevelScriptFiles(path.join(root, 'scripts'));
  const readme = readFileSync(path.join(root, 'scripts', 'README.md'), 'utf8');
  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const result = analyzeInventory({
    actualFiles,
    readme,
    packageScripts: packageJson.scripts ?? {},
  });

  const hasFailure =
    result.unexpected.length > 0 ||
    result.missing.length > 0 ||
    result.undocumented.length > 0 ||
    result.missingPackageHooks.length > 0;

  if (!hasFailure) {
    console.log('check:scripts-inventory PASS');
    return;
  }

  console.error('check:scripts-inventory FAIL');
  if (result.unexpected.length > 0) {
    console.error(`Unexpected scripts: ${result.unexpected.join(', ')}`);
  }
  if (result.missing.length > 0) {
    console.error(`Inventory entries without files: ${result.missing.join(', ')}`);
  }
  if (result.undocumented.length > 0) {
    console.error(`README missing entries: ${result.undocumented.join(', ')}`);
  }
  if (result.missingPackageHooks.length > 0) {
    console.error(`Missing package hooks: ${result.missingPackageHooks.join(', ')}`);
  }
  console.error('Update scripts/README.md and scripts/check-script-inventory.mjs together.');
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
