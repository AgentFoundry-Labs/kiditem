import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('automatic profitability ABC schema owns versioned formulas, exact evidence bounds, and scoped Sellpia syncs', async () => {
  const [core, channels, inventory, shared] = await Promise.all([
    read('prisma/models/core.prisma'),
    read('prisma/models/channels.prisma'),
    read('prisma/models/inventory.prisma'),
    read('packages/shared/src/schemas/product-abc.ts'),
  ]);

  assert.match(core, /model MasterProductAbcFormulaVersion/);
  assert.match(core, /model MasterProductAbcFormulaState/);
  assert.match(core, /model MasterProductAbcEvaluation/);
  assert.match(core, /model MasterProductAbcGradeHistory/);
  assert.doesNotMatch(core, /model MasterProductAbcPolicy/);
  assert.match(core, /formula_checksum/);
  assert.match(core, /calculation_code_checksum/);
  assert.match(channels, /coverage_start_date/);
  assert.match(channels, /coverage_end_date/);
  assert.match(inventory, /requested_sync_scope/);
  assert.match(inventory, /active_sync_scope/);
  assert.match(inventory, /last_attempt_sync_scope/);
  assert.match(shared, /ProductAbcCalculationStatusSchema/);
  assert.match(shared, /NOT_APPLIED/);
  assert.doesNotMatch(shared, /MasterProductAbcMetricSchema/);
  assert.doesNotMatch(shared, /MasterProductAbcLifecycleStageSchema/);
  assert.doesNotMatch(shared, /provisionalGrade/);
});
