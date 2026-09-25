import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectOperationBoundaryFindings, operationTableHits } from '../check-operation-owner-boundary.mjs';

test('finds Prisma delegates and raw SQL on the operation tables, not prose or look-alike names', () => {
  assert.deepEqual(operationTableHits([
    '// prisma.operation is owned by common/operation',
    'await this.prisma.operation.findMany({});',
    'await tx.operationChunk.deleteMany({});',
    'await tx . operationLock.create({ data });',
    'const kind = input.operation.kind;',
    'await prisma.operationLog.findMany({});',
    'await tx.$queryRaw`SELECT id FROM operations WHERE id = ${id}`;',
    "await tx.$executeRawUnsafe('DELETE FROM \"operation_chunks\"');",
    'await tx.$queryRaw`UPDATE operation_locks SET x = 1`;',
    'const text = "operations are one contract";',
    'await tx.$queryRaw`SELECT * FROM operations_archive`;',
  ].join('\n')), [2, 3, 4, 7, 8, 9]);
});

test('fails an owner file that touches operation rows and passes the operation module and tests', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'operation-boundary-'));
  const operationModule = path.join(root, 'apps/server/src/common/operation/adapter/out/persistence');
  const owner = path.join(root, 'apps/server/src/channels/adapter/out/repository');
  const ownerTests = path.join(root, 'apps/server/src/channels/__tests__');
  for (const dir of [operationModule, owner, ownerTests]) mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(operationModule, 'operation.repository.adapter.ts'), 'await this.tx.operation.findFirst({});\n');
  writeFileSync(path.join(owner, 'catalog.repository.adapter.ts'), 'export const x = 1;\n');
  writeFileSync(path.join(ownerTests, 'catalog.pg.integration.spec.ts'), 'await prisma.operationLock.count();\n');
  assert.deepEqual(collectOperationBoundaryFindings(root), []);

  writeFileSync(path.join(owner, 'catalog.repository.adapter.ts'), 'export const x = 1;\nawait tx.operation.update({ where, data });\n');
  writeFileSync(path.join(owner, 'raw.repository.adapter.ts'), 'await tx.$queryRaw`\n  SELECT id\n  FROM operation_locks`;\n');
  assert.deepEqual(collectOperationBoundaryFindings(root), [
    'apps/server/src/channels/adapter/out/repository/catalog.repository.adapter.ts:2 touches operation rows outside common/operation',
    'apps/server/src/channels/adapter/out/repository/raw.repository.adapter.ts:3 touches operation rows outside common/operation',
  ]);
});
