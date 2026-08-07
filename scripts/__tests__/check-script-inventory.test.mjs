import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeInventory, SCRIPT_INVENTORY } from '../check-script-inventory.mjs';

test('accepts complete script inventory metadata', () => {
  const result = analyzeInventory({
    actualFiles: SCRIPT_INVENTORY,
    readme: SCRIPT_INVENTORY.map((file) => `\`scripts/${file}\``).join('\n'),
    packageScripts: {
      'check:scripts-inventory': 'node scripts/check-script-inventory.mjs',
      'check:schema-artifact-sync': 'node scripts/check-schema-artifact-sync.mjs',
      'check:pr-release-contract': 'node scripts/check-pr-release-contract.mjs',
      'check:directory-architecture': 'node scripts/check-directory-architecture.mjs',
      'check:shared-interface-names': 'node scripts/check-shared-interface-names.mjs',
      'test:scripts': 'vitest run --config scripts/vitest.config.ts && node --test scripts/__tests__/*.test.mjs',
      'check:conventions': 'npm run check:scripts-inventory && npm run check:schema-artifact-sync && npm run check:directory-architecture && npm run check:shared-interface-names',
    },
  });

  assert.deepEqual(result.unexpected, []);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.undocumented, []);
  assert.deepEqual(result.missingPackageHooks, []);
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
    'check:scripts-inventory',
    'check:schema-artifact-sync',
    'check:pr-release-contract',
    'check:directory-architecture',
    'check:shared-interface-names',
    'test:scripts',
    'check:conventions -> check:scripts-inventory',
    'check:conventions -> check:schema-artifact-sync',
    'check:conventions -> check:directory-architecture',
    'check:conventions -> check:shared-interface-names',
  ]);
});
