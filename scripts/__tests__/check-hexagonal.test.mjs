import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexagonalBoundaryViolations } from '../check-hexagonal.mjs';

const file = 'apps/server/src/channels/application/service/listing/list.service.ts';
test('rejects framework, concrete adapter and Node dependencies in application', () => {
  for (const dep of ['@nestjs/common', '@prisma/client', 'node:crypto', 'fs', '../../../adapter/out/persistence/list', 'xlsx']) {
    assert.ok(hexagonalBoundaryViolations(file, `import { x } from '${dep}';`).length);
  }
  assert.ok(hexagonalBoundaryViolations(file, 'const bytes: Buffer = process.env.DATA;').length);
});
test('permits pure contracts and outgoing IO adapters', () => {
  assert.deepEqual(hexagonalBoundaryViolations(file, "import type { Port } from '../../port/out/persistence/list';"), []);
  assert.deepEqual(hexagonalBoundaryViolations('channels/adapter/out/documents/file.ts', "import * as x from 'xlsx';"), []);
});
test('rejects former usecase, ungrouped service and HTTP locations', () => {
  for (const p of ['application/usecase/a.ts', 'application/service/a.ts', 'adapter/in/http/a.ts']) {
    assert.ok(hexagonalBoundaryViolations(`channels/${p}`, '').length);
  }
});

test('incoming adapters depend on input contracts and domain stays in declared areas', () => {
  const incoming = 'channels/adapter/in/web/list.controller.ts';
  for (const dep of ['application/service/listing/list', 'application/usecase/list', 'application/port/out/repository/list']) {
    assert.ok(hexagonalBoundaryViolations(incoming, `import { x } from '../../../${dep}';`).length);
  }
  for (const source of ["import('../../../application/service/listing/list')", "require('../../../application/service/listing/list')", "import x = require('../../../application/service/listing/list')"]) assert.ok(hexagonalBoundaryViolations(incoming, source).length);
  assert.deepEqual(hexagonalBoundaryViolations(incoming, "import { Port } from '../../../application/port/in/listing/list.port';"), []);
  assert.ok(hexagonalBoundaryViolations('channels/domain/market/x.ts', '').length);
  for (const area of ['account', 'sales-product', 'registration', 'listing', 'collection', 'capability', 'exception']) {
    assert.deepEqual(hexagonalBoundaryViolations(`channels/domain/${area}/x.ts`, ''), []);
  }
});

// KID-310: the scanner now covers sourcing and content too, but only channels
// nests domain/ and application/service/ by named business area — sourcing
// and content mostly sit flat (one file per concern), so a flat file there
// must stay permitted rather than tripping the channels-only area check.
test('sourcing and content stay flat without tripping the channels-only area rule', () => {
  assert.deepEqual(hexagonalBoundaryViolations('apps/server/src/sourcing/domain/source-evidence-coverage.ts', ''), []);
  assert.deepEqual(hexagonalBoundaryViolations('apps/server/src/content/domain/thumbnail-analysis.mapper.ts', ''), []);
  assert.deepEqual(hexagonalBoundaryViolations('apps/server/src/sourcing/application/service/sourcing-collected-draft.service.ts', ''), []);
  assert.deepEqual(hexagonalBoundaryViolations('apps/server/src/content/application/service/thumbnail-generation.service.ts', ''), []);
});

// KID-310 retired read/ (absorbed into adapter/out/{persistence,repository})
// and mapper/ (absorbed into domain/) as top-level domain-root lanes across
// all three domains, and a bare top-level service/ never was one. One
// negative fixture per domain proves the scanner still catches a regression
// back to any of those shapes.
test('rejects the retired top-level read/, mapper/ and service/ lanes per domain (KID-310)', () => {
  assert.ok(hexagonalBoundaryViolations('apps/server/src/channels/read/some.reader.ts', '').length);
  assert.ok(hexagonalBoundaryViolations('apps/server/src/sourcing/read/some.reader.ts', '').length);
  assert.ok(hexagonalBoundaryViolations('apps/server/src/content/mapper/some.mapper.ts', '').length);
  assert.ok(hexagonalBoundaryViolations('apps/server/src/channels/service/some.service.ts', '').length);
  // A file merely named *.mapper.ts inside the permitted domain/ lane is not
  // a top-level mapper/ folder and must not be flagged.
  assert.deepEqual(hexagonalBoundaryViolations('apps/server/src/content/domain/thumbnail-wing.mapper.ts', ''), []);
  // application/service/ is the correct nested location, not the retired
  // top-level service/ lane, and must not be flagged in any of the three domains.
  assert.deepEqual(hexagonalBoundaryViolations('apps/server/src/channels/application/service/listing/list.service.ts', ''), []);
  assert.deepEqual(hexagonalBoundaryViolations('apps/server/src/sourcing/application/service/a.ts', ''), []);
  assert.deepEqual(hexagonalBoundaryViolations('apps/server/src/content/application/service/a.ts', ''), []);
});
