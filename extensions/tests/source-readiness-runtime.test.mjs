import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtimePath = path.join(repoRoot, 'extensions/kiditem-os/shared/source-readiness.js');

test('the popup runtime stays generated from the shared readiness implementation', () => {
  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'extensions/scripts/build-source-readiness-runtime.mjs'), '--check'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('a newer failed attempt does not hide a valid completed snapshot', () => {
  const context = vm.createContext({ Date, Number });
  vm.runInContext(readFileSync(runtimePath, 'utf8'), context);
  const source = context.KidItemSourceReadiness.deriveSourceReadiness({
    latestAttempt: { state: 'FAILED' },
    latestComplete: { actualCutoff: '2026-09-12' },
    requiredCutoff: '2026-09-12',
  });
  assert.equal(source.ready, true);
  assert.equal(context.KidItemSourceReadiness.sourceReadinessStatus({
    ...source,
    latestComplete: { actualCutoff: '2026-09-12' },
  }), 'ready');
});
