import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDirectoryArchitecture } from '../check-directory-architecture.mjs';

test('accepts documented backend, web app, and web shared directories', () => {
  const result = analyzeDirectoryArchitecture({
    architectureDoc: [
      '`apps/server/src/inventory`',
      '`apps/web/src/app/(inventory)`',
      '`apps/web/src/app/settings`',
      '`apps/web/src/components`',
    ].join('\n'),
    serverSrcDirs: ['inventory'],
    webAppDirs: ['(inventory)', 'settings'],
    webSrcDirs: ['app', 'components'],
    webAppApiExists: false,
  });

  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.forbidden, []);
});

test('reports undocumented directories and forbidden app route handlers', () => {
  const result = analyzeDirectoryArchitecture({
    architectureDoc: '`apps/server/src/inventory`',
    serverSrcDirs: ['inventory', 'orders'],
    webAppDirs: ['(orders)'],
    webSrcDirs: ['app', 'lib'],
    webAppApiExists: true,
  });

  assert.deepEqual(result.missing, [
    'apps/server/src/orders',
    'apps/web/src/app/(orders)',
    'apps/web/src/lib',
  ]);
  assert.deepEqual(result.forbidden, ['apps/web/src/app/api']);
});

test('reports backend outgoing ports left directly under port/out', () => {
  const result = analyzeDirectoryArchitecture({
    architectureDoc: '',
    serverSrcDirs: [],
    webAppDirs: [],
    webSrcDirs: ['app'],
    webAppApiExists: false,
    backendPortFiles: [
      'apps/server/src/ai/application/port/out/provider/text-completion.port.ts',
      'apps/server/src/supply/application/port/out/supplier.repository.port.ts',
      'apps/server/src/sourcing/application/port/out/repository-transaction.ts',
      'apps/server/src/advertising/application/port/out/daily-fact-meta.ts',
    ],
  });

  assert.deepEqual(result.directOutPortFiles, [
    'apps/server/src/advertising/application/port/out/daily-fact-meta.ts',
    'apps/server/src/sourcing/application/port/out/repository-transaction.ts',
    'apps/server/src/supply/application/port/out/supplier.repository.port.ts',
  ]);
});

test('reports incoming port folders named after caller or entrypoint types', () => {
  const result = analyzeDirectoryArchitecture({
    architectureDoc: '',
    serverSrcDirs: [],
    webAppDirs: [],
    webSrcDirs: ['app'],
    webAppApiExists: false,
    backendPortFiles: [
      'apps/server/src/inventory/application/port/in/stock/inventory.port.ts',
      'apps/server/src/products/application/port/in/agent/master-promotion.port.ts',
      'apps/server/src/automation/application/port/in/workflow/workflow-run-cancellation.port.ts',
      'apps/server/src/supply/application/port/in/http/suppliers.port.ts',
    ],
  });

  assert.deepEqual(result.forbiddenInPortCallerFolders, [
    'apps/server/src/automation/application/port/in/workflow/workflow-run-cancellation.port.ts',
    'apps/server/src/products/application/port/in/agent/master-promotion.port.ts',
    'apps/server/src/supply/application/port/in/http/suppliers.port.ts',
  ]);
});
