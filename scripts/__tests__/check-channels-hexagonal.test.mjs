import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channelBoundaryViolations } from '../check-channels-hexagonal.mjs';

const file = 'apps/server/src/channels/application/service/listing/list.service.ts';
test('rejects framework, concrete adapter and Node dependencies in application', () => {
  for (const dep of ['@nestjs/common', '@prisma/client', 'node:crypto', 'fs', '../../../adapter/out/persistence/list', 'xlsx']) {
    assert.ok(channelBoundaryViolations(file, `import { x } from '${dep}';`).length);
  }
  assert.ok(channelBoundaryViolations(file, 'const bytes: Buffer = process.env.DATA;').length);
});
test('permits pure contracts and outgoing IO adapters', () => {
  assert.deepEqual(channelBoundaryViolations(file, "import type { Port } from '../../port/out/persistence/list';"), []);
  assert.deepEqual(channelBoundaryViolations('channels/adapter/out/documents/file.ts', "import * as x from 'xlsx';"), []);
});
test('rejects former usecase, ungrouped service and HTTP locations', () => {
  for (const p of ['application/usecase/a.ts', 'application/service/a.ts', 'adapter/in/http/a.ts']) {
    assert.ok(channelBoundaryViolations(`channels/${p}`, '').length);
  }
});

test('incoming adapters depend on input contracts and domain stays in declared areas', () => {
  const incoming = 'channels/adapter/in/web/list.controller.ts';
  for (const dep of ['application/service/listing/list', 'application/usecase/list', 'application/port/out/repository/list']) {
    assert.ok(channelBoundaryViolations(incoming, `import { x } from '../../../${dep}';`).length);
  }
  for (const source of ["import('../../../application/service/listing/list')", "require('../../../application/service/listing/list')", "import x = require('../../../application/service/listing/list')"]) assert.ok(channelBoundaryViolations(incoming, source).length);
  assert.deepEqual(channelBoundaryViolations(incoming, "import { Port } from '../../../application/port/in/listing/list.port';"), []);
  assert.ok(channelBoundaryViolations('channels/domain/market/x.ts', '').length);
  for (const area of ['account', 'sales-product', 'registration', 'listing', 'collection', 'capability', 'exception']) {
    assert.deepEqual(channelBoundaryViolations(`channels/domain/${area}/x.ts`, ''), []);
  }
});
