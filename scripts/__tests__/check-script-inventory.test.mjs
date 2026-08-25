import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeInventory, SCRIPT_INVENTORY } from '../check-script-inventory.mjs';

test('registers the Agent OS contraction scanner', () => {
  assert.ok(SCRIPT_INVENTORY.includes('check-agent-os-contraction.mjs'));
});

test('registers the built-in isolated Agent OS browser-QA seed command', () => {
  assert.ok(SCRIPT_INVENTORY.includes('seed-agent-os-browser-qa.ts'));
});

test('accepts complete script inventory metadata', () => {
  const result = analyzeInventory({
    actualFiles: SCRIPT_INVENTORY,
    readme: SCRIPT_INVENTORY.map((file) => `\`scripts/${file}\``).join('\n'),
    packageScripts: {
      'check:copilotkit-train': 'node scripts/check-copilotkit-train.mjs',
      'check:agent-os-hexagonal': 'node scripts/check-agent-os-hexagonal.mjs',
      'check:agent-os-contraction': 'node scripts/check-agent-os-contraction.mjs',
      'qa:agent-os:clean-cutover': 'node scripts/qa-agent-os-clean-cutover.mjs',
      'seed:agent-os:browser-qa': 'tsx scripts/seed-agent-os-browser-qa.ts',
      'check:scripts-inventory': 'node scripts/check-script-inventory.mjs',
      'check:schema-artifact-sync': 'node scripts/check-schema-artifact-sync.mjs',
      'check:pr-release-contract': 'node scripts/check-pr-release-contract.mjs',
      'check:directory-architecture': 'node scripts/check-directory-architecture.mjs',
      'check:identifier-contracts': 'node scripts/check-identifier-contracts.mjs',
      'check:shared-interface-names': 'node scripts/check-shared-interface-names.mjs',
      'test:scripts': 'vitest run --config scripts/vitest.config.ts && node --test scripts/__tests__/*.test.mjs',
      'check:conventions': 'npm run check:scripts-inventory && npm run check:schema-artifact-sync && npm run check:directory-architecture && npm run check:shared-interface-names && npm run check:identifier-contracts',
    },
  });

  assert.deepEqual(result.unexpected, []);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.undocumented, []);
  assert.deepEqual(result.missingPackageHooks, []);
});

test('requires the built-in browser-QA seed package entrypoint', () => {
  const result = analyzeInventory({
    actualFiles: SCRIPT_INVENTORY,
    readme: SCRIPT_INVENTORY.map((file) => `\`scripts/${file}\``).join('\n'),
    packageScripts: {
      'check:copilotkit-train': 'node scripts/check-copilotkit-train.mjs',
      'check:agent-os-hexagonal': 'node scripts/check-agent-os-hexagonal.mjs',
      'check:agent-os-contraction': 'node scripts/check-agent-os-contraction.mjs',
      'qa:agent-os:clean-cutover': 'node scripts/qa-agent-os-clean-cutover.mjs',
      'check:scripts-inventory': 'node scripts/check-script-inventory.mjs',
      'check:schema-artifact-sync': 'node scripts/check-schema-artifact-sync.mjs',
      'check:pr-release-contract': 'node scripts/check-pr-release-contract.mjs',
      'check:directory-architecture': 'node scripts/check-directory-architecture.mjs',
      'check:identifier-contracts': 'node scripts/check-identifier-contracts.mjs',
      'check:shared-interface-names': 'node scripts/check-shared-interface-names.mjs',
      'test:scripts': 'vitest run --config scripts/vitest.config.ts && node --test scripts/__tests__/*.test.mjs',
      'check:conventions': 'npm run check:scripts-inventory && npm run check:schema-artifact-sync && npm run check:directory-architecture && npm run check:shared-interface-names && npm run check:identifier-contracts',
    },
  });

  assert.deepEqual(result.missingPackageHooks, ['seed:agent-os:browser-qa']);
});

test('reports unregistered scripts and missing hooks', () => {
  const result = analyzeInventory({
    actualFiles: ['adhoc-backfill.ts'],
    readme: '',
    packageScripts: {},
  });

  assert.deepEqual(result.unexpected, ['adhoc-backfill.ts']);
  assert.ok(result.missing.includes('check-script-inventory.mjs'));
  assert.ok(result.undocumented.includes('check-script-inventory.mjs'));
  assert.deepEqual(result.missingPackageHooks, [
    'check:copilotkit-train',
    'check:agent-os-hexagonal',
    'check:agent-os-contraction',
    'qa:agent-os:clean-cutover',
    'seed:agent-os:browser-qa',
    'check:scripts-inventory',
    'check:schema-artifact-sync',
    'check:pr-release-contract',
    'check:directory-architecture',
    'check:shared-interface-names',
    'check:identifier-contracts',
    'test:scripts',
    'check:conventions -> check:scripts-inventory',
    'check:conventions -> check:schema-artifact-sync',
    'check:conventions -> check:directory-architecture',
    'check:conventions -> check:shared-interface-names',
    'check:conventions -> check:identifier-contracts',
  ]);
});
