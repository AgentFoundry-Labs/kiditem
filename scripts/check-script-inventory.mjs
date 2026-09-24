#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPT_INVENTORY = Object.freeze([
  'bootstrap-authoritative-inventory-dev.ts',
  'bootstrap-local-auth-user.ts',
  'check-agent-os-contraction.mjs',
  'check-agent-os-hexagonal.mjs',
  'check-agents-hygiene.mjs',
  'check-business-date-arithmetic.mjs',
  'check-copilotkit-train.mjs',
  'check-cross-owner-fk.mjs',
  'check-directory-architecture.mjs',
  'check-frontend-db-boundary.sh',
  'check-identifier-contracts.mjs',
  'check-operation-automation-cutover.mjs',
  'check-pr-reconstruction-contract.mjs',
  'check-pr-release-contract.mjs',
  'check-queryraw-tenancy.sh',
  'check-raw-snapshot-read-models.sh',
  'check-ledger-readers.mjs',
  'check-schema-artifact-sync.mjs',
  'check-sourcing-long-running-actions.mjs',
  'check-script-inventory.mjs',
  'check-cutover-data-blockers.mjs',
  'check-cutover-blocker-coverage.mjs',
  'check-server-type-baseline.mjs',
  'check-shared-interface-names.mjs',
  'check-shared-root-imports.sh',
  'check-tenant-scope.sh',
  'dev-data-coupang.ts',
  'dev-data.ts',
  'generate-channel-registry.mjs',
  'generate-prisma-erd.mjs',
  'local-agent-gateway.mjs',
  'office-deploy.mjs',
  'operation-automation-cutover-preflight.mjs',
  'manage-extension-release.mjs',
  'qa-agent-os-clean-cutover.mjs',
  'run-data-migrations.ts',
  'run-local-development.mjs',
  'safe-prisma-db-push.mjs',
  'seed-agent-os-browser-qa.ts',
  'seed-order-collection-mall-accounts.ts',
  'smoke-interaction-os.mjs',
  'sync-local-database.ts',
  'setup-macos-development.mjs',
  'vitest.config.ts',
]);

const SUPPORT_FILES = new Set([
  '.server-type-baseline.txt',
  '.web-type-baseline.txt',
  '.shared-interface-names-baseline.txt',
  '.shared-root-imports-baseline.txt',
  '.tenant-scope-allowlist.txt',
  'ledger-readers.json',
  'cross-owner-fk.json',
  'cutover-blocker-coverage.json',
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
  if (
    packageScripts['check:copilotkit-train'] !==
    'node scripts/check-copilotkit-train.mjs'
  ) {
    missingPackageHooks.push('check:copilotkit-train');
  }
  if (
    packageScripts['check:agent-os-hexagonal'] !==
    'node scripts/check-agent-os-hexagonal.mjs'
  ) {
    missingPackageHooks.push('check:agent-os-hexagonal');
  }
  if (
    packageScripts['check:agent-os-contraction'] !==
    'node scripts/check-agent-os-contraction.mjs'
  ) {
    missingPackageHooks.push('check:agent-os-contraction');
  }
  if (
    packageScripts['check:operation-automation-cutover'] !==
    'node scripts/check-operation-automation-cutover.mjs'
  ) {
    missingPackageHooks.push('check:operation-automation-cutover');
  }
  if (
    packageScripts['qa:agent-os:clean-cutover'] !==
    'node scripts/qa-agent-os-clean-cutover.mjs'
  ) {
    missingPackageHooks.push('qa:agent-os:clean-cutover');
  }
  if (packageScripts['setup:macos'] !== 'node scripts/setup-macos-development.mjs') {
    missingPackageHooks.push('setup:macos');
  }
  if (packageScripts['dev:gateway'] !== 'npm run build --workspace=apps/agent-gateway && node scripts/local-agent-gateway.mjs start') {
    missingPackageHooks.push('dev:gateway');
  }
  if (packageScripts['dev:all'] !== 'node scripts/run-local-development.mjs') {
    missingPackageHooks.push('dev:all');
  }
  if (packageScripts['gateway:auth:codex'] !== 'node scripts/local-agent-gateway.mjs auth codex') {
    missingPackageHooks.push('gateway:auth:codex');
  }
  if (packageScripts['gateway:login:codex'] !== 'node scripts/local-agent-gateway.mjs login codex') {
    missingPackageHooks.push('gateway:login:codex');
  }
  if (packageScripts['db:sync:local'] !== 'tsx scripts/sync-local-database.ts') {
    missingPackageHooks.push('db:sync:local');
  }
  if (packageScripts['dev:bootstrap-user'] !== 'bash bin/bootstrap-local-auth-user.sh') {
    missingPackageHooks.push('dev:bootstrap-user');
  }
  if (
    packageScripts['seed:agent-os:browser-qa'] !==
    'tsx scripts/seed-agent-os-browser-qa.ts'
  ) {
    missingPackageHooks.push('seed:agent-os:browser-qa');
  }
  if (!packageScripts['check:scripts-inventory']) {
    missingPackageHooks.push('check:scripts-inventory');
  }
  if (packageScripts['check:cutover-blocker-coverage'] !== 'node scripts/check-cutover-blocker-coverage.mjs') {
    missingPackageHooks.push('check:cutover-blocker-coverage');
  }
  if (packageScripts['check:ledger-readers'] !== 'node scripts/check-ledger-readers.mjs') {
    missingPackageHooks.push('check:ledger-readers');
  }
  if (packageScripts['check:cross-owner-fk'] !== 'node scripts/check-cross-owner-fk.mjs') {
    missingPackageHooks.push('check:cross-owner-fk');
  }
  if (packageScripts['deploy:office:local'] !== 'node scripts/office-deploy.mjs deploy') {
    missingPackageHooks.push('deploy:office:local');
  }
  if (packageScripts['deploy:office:status'] !== 'node scripts/office-deploy.mjs status') {
    missingPackageHooks.push('deploy:office:status');
  }
  if (packageScripts['deploy:office:rollback'] !== 'node scripts/office-deploy.mjs rollback') {
    missingPackageHooks.push('deploy:office:rollback');
  }
  if (!packageScripts['check:schema-artifact-sync']) {
    missingPackageHooks.push('check:schema-artifact-sync');
  }
  if (!packageScripts['check:pr-release-contract']) {
    missingPackageHooks.push('check:pr-release-contract');
  }
  if (!packageScripts['check:directory-architecture']) {
    missingPackageHooks.push('check:directory-architecture');
  }
  if (!packageScripts['check:shared-interface-names']) {
    missingPackageHooks.push('check:shared-interface-names');
  }
  if (packageScripts['check:identifier-contracts'] !== 'node scripts/check-identifier-contracts.mjs') {
    missingPackageHooks.push('check:identifier-contracts');
  }
  if (!packageScripts['test:scripts']) {
    missingPackageHooks.push('test:scripts');
  }
  if (!packageScripts['check:conventions']?.includes('check:scripts-inventory')) {
    missingPackageHooks.push('check:conventions -> check:scripts-inventory');
  }
  if (!packageScripts['check:conventions']?.includes('check:ledger-readers')) {
    missingPackageHooks.push('check:conventions -> check:ledger-readers');
  }
  if (!packageScripts['check:conventions']?.includes('check:cross-owner-fk')) {
    missingPackageHooks.push('check:conventions -> check:cross-owner-fk');
  }
  if (!packageScripts['check:conventions']?.includes('check:schema-artifact-sync')) {
    missingPackageHooks.push('check:conventions -> check:schema-artifact-sync');
  }
  if (!packageScripts['check:conventions']?.includes('check:directory-architecture')) {
    missingPackageHooks.push('check:conventions -> check:directory-architecture');
  }
  if (!packageScripts['check:conventions']?.includes('check:shared-interface-names')) {
    missingPackageHooks.push('check:conventions -> check:shared-interface-names');
  }
  if (!packageScripts['check:conventions']?.includes('check:identifier-contracts')) {
    missingPackageHooks.push('check:conventions -> check:identifier-contracts');
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
