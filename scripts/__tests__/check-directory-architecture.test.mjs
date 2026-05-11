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
