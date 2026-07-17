import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const guardPath = path.join(repoRoot, 'scripts/safe-prisma-db-push.mjs');

test('local db:push refuses force-reset before Prisma can run', async () => {
  assert.equal(
    existsSync(guardPath),
    true,
    'safe Prisma db push wrapper must exist',
  );
  const guard = await import(pathToFileURL(guardPath));
  assert.throws(
    () => guard.assertSafeDbPushArgs(['--force-reset']),
    /force-reset.*blocked/i,
  );
  assert.doesNotThrow(() => guard.assertSafeDbPushArgs([]));

  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['db:push'], 'node scripts/safe-prisma-db-push.mjs');
});
