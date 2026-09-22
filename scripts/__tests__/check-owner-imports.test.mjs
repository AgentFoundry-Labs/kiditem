import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inspectOwnerImports } from '../check-ledger-readers.mjs';

function write(root, relativePath, contents) {
  const target = path.join(root, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function createRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'kiditem-owner-imports-'));
  write(
    root,
    'apps/server/tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: { '@/*': ['src/*'] },
      },
    }),
  );
  return root;
}

test('rejects concrete implementation imports across owners and into same-owner adapters', () => {
  const root = createRoot();
  const sources = {
    staticImport:
      'apps/server/src/orders/application/service/static-consumer.ts',
    typeImport: 'apps/server/src/orders/application/service/type-consumer.ts',
    reexport: 'apps/server/src/orders/application/service/reexports.ts',
    dynamicImport:
      'apps/server/src/orders/application/service/dynamic-consumer.ts',
    requireCall: 'apps/server/src/orders/application/service/require-consumer.ts',
    importEquals:
      'apps/server/src/orders/application/service/import-equals-consumer.ts',
    crossOwnerModule: 'apps/server/src/orders/orders.module.ts',
    sameOwnerApplication:
      'apps/server/src/channels/application/service/listing-use-case.ts',
    sameOwnerDomain: 'apps/server/src/channels/domain/listing.domain.ts',
    sameOwnerInboundAdapter:
      'apps/server/src/channels/adapter/in/http/listing.controller.ts',
    crossOwnerUseCase:
      'apps/server/src/orders/application/service/cross-owner-usecase.ts',
    ignoredTest: 'apps/server/src/orders/__tests__/owner-import.spec.ts',
  };
  const targets = {
    adapter:
      'apps/server/src/channels/adapter/out/persistence/listing.repository.ts',
    applicationService:
      'apps/server/src/channels/application/services/listing.query.ts',
    applicationUseCase:
      'apps/server/src/channels/application/usecase/listing.usecase.ts',
    service: 'apps/server/src/channels/services/listing.service.ts',
    reader: 'apps/server/src/channels/read/listing.reader.ts',
  };

  try {
    for (const target of Object.values(targets)) {
      write(root, target, 'export const value = 1;\n');
    }
    write(
      root,
      sources.staticImport,
      "import { value } from '../../../channels/adapter/out/persistence/listing.repository';\nvoid value;\n",
    );
    write(
      root,
      sources.typeImport,
      "import type { Listing } from '@/channels/application/services/listing.query';\nexport type Result = Listing;\n",
    );
    write(
      root,
      sources.reexport,
      "export { value } from '@/channels/read/listing.reader';\n",
    );
    write(
      root,
      sources.dynamicImport,
      "const modulePromise = import('@/channels/services/listing.service');\nvoid modulePromise;\n",
    );
    write(
      root,
      sources.requireCall,
      "const listing = require('@/channels/adapter/out/persistence/listing.repository');\nvoid listing;\n",
    );
    write(
      root,
      sources.importEquals,
      "import listing = require('@/channels/application/services/listing.query');\nvoid listing;\n",
    );
    write(
      root,
      sources.crossOwnerModule,
      "import { value } from '@/channels/adapter/out/persistence/listing.repository';\nvoid value;\n",
    );
    write(
      root,
      sources.sameOwnerApplication,
      "import { value } from '../../adapter/out/persistence/listing.repository';\nvoid value;\n",
    );
    write(
      root,
      sources.sameOwnerDomain,
      "import { value } from '../adapter/out/persistence/listing.repository';\nvoid value;\n",
    );
    write(
      root,
      sources.sameOwnerInboundAdapter,
      "import { value } from '../../out/persistence/listing.repository';\nvoid value;\n",
    );
    write(
      root,
      sources.crossOwnerUseCase,
      "import { value } from '@/channels/application/usecase/listing.usecase';\nvoid value;\n",
    );
    write(
      root,
      sources.ignoredTest,
      "import { value } from '@/channels/adapter/out/persistence/listing.repository';\nvoid value;\n",
    );

    const result = inspectOwnerImports({
      root,
      files: Object.values(sources),
    });
    const byFile = new Map(
      result.violations.map((violation) => [violation.file, violation]),
    );
    const expectedFiles = Object.values(sources).filter(
      (file) => file !== sources.ignoredTest,
    );

    assert.deepEqual([...byFile.keys()].sort(), expectedFiles.sort());
    assert.equal(result.violations.length, expectedFiles.length);
    for (const file of expectedFiles) {
      assert.equal(byFile.get(file).kind, 'owner implementation import');
    }
    assert.equal(
      byFile.get(sources.staticImport).target,
      targets.adapter,
    );
    assert.equal(
      byFile.get(sources.typeImport).target,
      targets.applicationService,
    );
    assert.equal(
      byFile.get(sources.crossOwnerUseCase).target,
      targets.applicationUseCase,
    );
    assert.equal(byFile.get(sources.reexport).target, targets.reader);
    assert.equal(byFile.get(sources.dynamicImport).target, targets.service);
    assert.deepEqual(result.staleExceptions, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('allows owner module wiring and public ports while honoring exact import exceptions', () => {
  const root = createRoot();
  const ownerModule = 'apps/server/src/channels/channels.module.ts';
  const portConsumer = 'apps/server/src/orders/application/service/report.ts';
  const legacyConsumer =
    'apps/server/src/orders/application/service/legacy-report.ts';
  const otherConsumer =
    'apps/server/src/orders/application/service/other-report.ts';
  const adapter =
    'apps/server/src/channels/adapter/out/persistence/listing.repository.ts';
  const ownService =
    'apps/server/src/channels/application/service/listing.service.ts';
  const publicPort =
    'apps/server/src/channels/application/port/in/listing-report.port.ts';
  const exception = {
    from: legacyConsumer,
    to: adapter,
    reason: 'A legacy report adapter is removed after its consumer migration.',
    removeWith: 'KID-297',
  };

  try {
    write(root, adapter, 'export class ListingPersistenceAdapter {}\n');
    write(root, ownService, 'export class ListingService {}\n');
    write(root, publicPort, 'export interface ListingReportPort {}\n');
    write(
      root,
      ownerModule,
      "import { ListingPersistenceAdapter } from './adapter/out/persistence/listing.repository';\nimport { ListingService } from './application/service/listing.service';\nvoid [ListingPersistenceAdapter, ListingService];\n",
    );
    write(
      root,
      portConsumer,
      "import type { ListingReportPort } from '@/channels/application/port/in/listing-report.port';\nexport type ReportPort = ListingReportPort;\n",
    );
    write(
      root,
      legacyConsumer,
      "import { ListingPersistenceAdapter } from '@/channels/adapter/out/persistence/listing.repository';\nvoid ListingPersistenceAdapter;\n",
    );
    write(
      root,
      otherConsumer,
      "import { ListingPersistenceAdapter } from '@/channels/adapter/out/persistence/listing.repository';\nvoid ListingPersistenceAdapter;\n",
    );

    const result = inspectOwnerImports({
      root,
      files: [ownerModule, portConsumer, legacyConsumer, otherConsumer],
      exceptions: [exception],
    });
    assert.deepEqual(
      result.violations.map((violation) => violation.file),
      [otherConsumer],
    );
    assert.deepEqual(result.staleExceptions, []);

    const staleResult = inspectOwnerImports({
      root,
      files: [ownerModule, portConsumer, otherConsumer],
      exceptions: [exception],
    });
    assert.deepEqual(
      staleResult.violations.map((violation) => violation.file),
      [otherConsumer],
    );
    assert.deepEqual(staleResult.staleExceptions, [exception]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('blocks an owner internal barrel from re-exporting an output implementation', () => {
  const root = createRoot();
  const adapter =
    'apps/server/src/channels/adapter/out/persistence/listing.repository.ts';
  const internalBarrel = 'apps/server/src/channels/internal.ts';
  const consumer =
    'apps/server/src/orders/application/service/internal-barrel-consumer.ts';

  try {
    write(root, adapter, 'export class ListingPersistenceAdapter {}\n');
    write(
      root,
      internalBarrel,
      "export { ListingPersistenceAdapter } from './adapter/out/persistence/listing.repository';\n",
    );
    write(
      root,
      consumer,
      "import { ListingPersistenceAdapter } from '@/channels/internal';\nvoid ListingPersistenceAdapter;\n",
    );

    const result = inspectOwnerImports({
      root,
      files: [internalBarrel, consumer],
    });

    assert.equal(result.violations.length, 1);
    assert.deepEqual(result.violations[0], {
      file: internalBarrel,
      target: adapter,
      kind: 'owner implementation import',
    });
    assert.deepEqual(result.staleExceptions, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
