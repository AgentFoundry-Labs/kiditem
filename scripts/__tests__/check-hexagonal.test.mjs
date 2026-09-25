import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHexagonal, hexagonalBoundaryViolations, knownViolationShapeErrors, KNOWN_VIOLATIONS } from '../check-hexagonal.mjs';

const file = 'apps/server/src/channels/application/service/listing/list.service.ts';
test('rejects IO, concrete adapter and Node dependencies in application', () => {
  for (const dep of ['@nestjs/core', '@prisma/client', 'node:crypto', 'fs', '../../../adapter/out/persistence/list', 'xlsx']) {
    assert.ok(hexagonalBoundaryViolations(file, `import { x } from '${dep}';`).length);
  }
  assert.ok(hexagonalBoundaryViolations(file, 'const bytes: Buffer = process.env.DATA;').length);
});
test('application services may use Nest DI from @nestjs/common; domain may not (2026-09-26)', () => {
  assert.deepEqual(hexagonalBoundaryViolations(file, "import { Inject, Injectable } from '@nestjs/common';"), []);
  assert.ok(hexagonalBoundaryViolations('apps/server/src/channels/domain/listing/rule.ts', "import { Injectable } from '@nestjs/common';").length);
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

test('an operation owner adapter may implement the operation contract owner port (KID-354)', () => {
  const owner = 'channels/adapter/in/operation/wing-catalog-operation-owners.ts';
  assert.deepEqual(hexagonalBoundaryViolations(owner, "import type { OperationOwnerPort } from '../../../../common/operation/application/port/out/owner/operation-owner.port';"), []);
  assert.deepEqual(hexagonalBoundaryViolations(owner, "import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';"), []);
  // 채널 자신의 port/out은 여전히 막는다.
  assert.ok(hexagonalBoundaryViolations(owner, "import type { X } from '../../../application/port/out/repository/x';").length);
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

// KID-310 applied three rules to all three domains. Each needs its own fixture:
// the rules that stayed channels-only are covered above, so a fixture that
// passes in sourcing/content is as load-bearing as one that fails.
test('the adapter→port direction holds in sourcing and content too (KID-310)', () => {
  assert.ok(hexagonalBoundaryViolations(
    'apps/server/src/sourcing/application/service/sourcing-collected-draft.service.ts',
    "import { x } from '../../adapter/out/repository/sourcing-candidate.repository.adapter';",
  ).length);
  assert.ok(hexagonalBoundaryViolations(
    'apps/server/src/content/domain/thumbnail-analysis.ts',
    "import { x } from '../adapter/out/storage/asset.adapter';",
  ).length);
});

test('@nestjs stays permitted in sourcing and content (pre-existing debt, not a layout question)', () => {
  assert.deepEqual(hexagonalBoundaryViolations(
    'apps/server/src/sourcing/application/service/sourcing.service.ts',
    "import { Injectable } from '@nestjs/common';",
  ), []);
  assert.deepEqual(hexagonalBoundaryViolations(
    'apps/server/src/content/application/service/thumbnail-generation.service.ts',
    "import { Injectable } from '@nestjs/common';",
  ), []);
});

test('a marketplace/ business domain is refused in every domain (KID-310)', () => {
  for (const owner of ['channels', 'sourcing', 'content']) {
    assert.ok(hexagonalBoundaryViolations(
      `apps/server/src/${owner}/domain/marketplace/wing.ts`, '',
    ).length);
  }
});

// KID-311: orders joins the scanner. Its services still import concrete
// read/dto/products adapters; those exact pairs are listed with the ticket
// that removes them, and anything else stays a failure.
const ordersService = 'orders/application/service/orders.service.ts';
const readerImport = "import { x } from '../../adapter/out/persistence/read/order-facts.reader';";
const listed = { owner: 'orders', file: ordersService, specifier: '../../adapter/out/persistence/read/order-facts.reader', removeWith: 'KID-334' };

test('orders is scanned for the retired read/, mapper/ and usecase lanes (KID-311)', () => {
  assert.ok(hexagonalBoundaryViolations('apps/server/src/orders/read/order-facts.reader.ts', '').length);
  assert.ok(hexagonalBoundaryViolations('apps/server/src/orders/mapper/coupang-direct-order.mapper.ts', '').length);
  assert.ok(hexagonalBoundaryViolations('apps/server/src/orders/shipments/application/usecase/a.ts', '').length);
});

test('a listed known violation passes only on an exact file and specifier match (KID-311)', () => {
  assert.deepEqual(evaluateHexagonal([{ file: ordersService, source: readerImport }], [listed]), []);
  const otherFile = evaluateHexagonal([{ file: 'orders/application/service/reviews.service.ts', source: readerImport }, { file: ordersService, source: readerImport }], [listed]);
  assert.equal(otherFile.length, 1);
  assert.match(otherFile[0], /reviews\.service\.ts: Pure layer imports a concrete adapter/);
});

test('an adapter import missing from the known list fails (KID-311)', () => {
  const errors = evaluateHexagonal([{ file: ordersService, source: `${readerImport}\nimport { y } from '../../adapter/in/web/dto';` }], [listed]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /adapter\/in\/web\/dto/);
});

test('a known violation that no longer occurs fails as stale (KID-311)', () => {
  const errors = evaluateHexagonal([{ file: ordersService, source: '' }], [listed]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Stale KNOWN_VIOLATIONS entry.*KID-334/);
});

test('a known violation cannot allow a non-adapter rule or another owner (KID-311)', () => {
  const usecase = 'orders/application/usecase/a.ts';
  const usecaseErrors = evaluateHexagonal([{ file: usecase, source: '' }], [{ ...listed, file: usecase, specifier: '' }]);
  assert.equal(usecaseErrors.length, 3);
  assert.match(usecaseErrors[0], /specifier is required/);
  const channels = 'channels/application/service/listing/a.ts';
  assert.ok(evaluateHexagonal([{ file: channels, source: readerImport }], [{ ...listed, file: channels }]).length >= 2);
});

test('finance joins the scanner with the same exact known-violation list (KID-311)', () => {
  const settlements = 'finance/application/service/settlement/settlements.service.ts';
  const source = "import { x } from '../../../adapter/out/persistence/read/settlement/settlement-facts';";
  const entry = { owner: 'finance', file: settlements, specifier: '../../../adapter/out/persistence/read/settlement/settlement-facts', removeWith: 'KID-334' };
  assert.deepEqual(evaluateHexagonal([{ file: settlements, source }], [entry]), []);
  assert.equal(evaluateHexagonal([{ file: settlements, source }], []).length, 1);
});

test('advertising joins the scanner (KID-311)', () => {
  assert.ok(hexagonalBoundaryViolations('apps/server/src/advertising/read/ad-target-facts.ts', '').length);
  assert.ok(hexagonalBoundaryViolations('apps/server/src/advertising/mapper/ad-campaign.mapper.ts', '').length);
});

test('products joins the scanner (KID-311)', () => {
  assert.ok(hexagonalBoundaryViolations('apps/server/src/products/mapper/product-abc-evaluation.mapper.ts', '').length);
  assert.ok(hexagonalBoundaryViolations('apps/server/src/products/read/product-abc-publication.reader.ts', '').length);
});

test('analytics joins the scanner: retired lanes refused, a listed adapter import passes (KID-311)', () => {
  for (const path of ['analytics/dto/x.dto.ts', 'analytics/services/x.service.ts', 'analytics/read/x.ts', 'analytics/controllers/x.controller.ts']) {
    assert.ok(hexagonalBoundaryViolations(`apps/server/src/${path}`, '').length, path);
  }
  const statistics = 'analytics/application/service/statistics/statistics.service.ts';
  const specifier = '../../../../orders/adapter/out/persistence/read/order-facts.reader';
  const source = `import { x } from '${specifier}';`;
  const entry = { owner: 'analytics', file: statistics, specifier, removeWith: 'KID-334' };
  assert.deepEqual(evaluateHexagonal([{ file: statistics, source }], [entry]), []);
  assert.equal(evaluateHexagonal([{ file: statistics, source }], []).length, 1);
});

test('a known violation must name a scanned owner, a file under it, a specifier and a KID ticket (KID-311)', () => {
  assert.deepEqual(knownViolationShapeErrors(KNOWN_VIOLATIONS), []);
  const bad = [
    { ...listed, owner: 'inventory', specifier: 'a' },
    { ...listed, file: 'finance/application/service/a.ts' },
    { ...listed, specifier: '' },
    { ...listed, removeWith: undefined, specifier: 'b' },
    { ...listed, removeWith: 'later', specifier: 'c' },
    listed,
    listed,
  ];
  const errors = knownViolationShapeErrors(bad);
  assert.equal(errors.length, 6);
  assert.match(errors[0], /owner "inventory" is not a scanned domain/);
  assert.match(errors[1], /file must start with orders\//);
  assert.match(errors[2], /specifier is required/);
  assert.match(errors[3], /removeWith must be KID-<n>/);
  assert.match(errors[4], /removeWith must be KID-<n>/);
  assert.match(errors[5], /duplicate entry/);
  const evaluated = evaluateHexagonal([{ file: ordersService, source: readerImport }], [{ ...listed, removeWith: undefined }]);
  assert.match(evaluated[0], /removeWith must be KID-<n>/);
});

test('the vacated controllers/, services/ and dto/ lanes are retired for every scanned domain (KID-311)', () => {
  for (const path of ['orders/services/x.service.ts', 'orders/controllers/x.controller.ts', 'finance/dto/x.dto.ts', 'products/services/x.ts', 'channels/controllers/x.ts']) {
    assert.ok(hexagonalBoundaryViolations(`apps/server/src/${path}`, '').length, path);
  }
  assert.deepEqual(hexagonalBoundaryViolations('apps/server/src/orders/adapter/in/web/dto/x.dto.ts', ''), []);
  assert.deepEqual(hexagonalBoundaryViolations('apps/server/src/orders/coupang-directship/services/x.ts', ''), []);
});
