import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeInventory, SCRIPT_INVENTORY } from '../check-script-inventory.mjs';

test('accepts complete script inventory metadata', () => {
  const result = analyzeInventory({
    actualFiles: SCRIPT_INVENTORY,
    readme: SCRIPT_INVENTORY.map((file) => `\`scripts/${file}\``).join('\n'),
    packageScripts: {
      'check:scripts-inventory': 'node scripts/check-script-inventory.mjs',
      'test:scripts': 'vitest run --config scripts/vitest.config.ts && node --test scripts/__tests__/*.test.mjs',
      'check:conventions': 'npm run check:scripts-inventory',
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
    'test:scripts',
    'check:conventions -> check:scripts-inventory',
  ]);
});
