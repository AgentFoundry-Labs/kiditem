import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  analyzeBusinessDateArithmetic,
  dayArithmeticLines,
} from '../check-business-date-arithmetic.mjs';

const SCRIPT = fileURLToPath(new URL('../check-business-date-arithmetic.mjs', import.meta.url));

test('recognizes each millisecond-day spelling and ignores other durations', () => {
  for (const text of [
    'const cutoff = new Date(today.getTime() - 86_400_000);',
    'const cutoff = new Date(today.getTime() - 86400000);',
    'const cutoff = new Date(today.getTime() - 24 * 60 * 60 * 1000);',
    'expiresAt: new Date(Date.now() + 24 * 60 * 60_000),',
    'Math.floor(span / (1000 * 60 * 60 * 24))',
    'const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);',
    'const cutoff = today.getTime() - 864e5;',
  ]) {
    assert.equal(dayArithmeticLines(text).length, 1, text);
  }
  for (const text of [
    'const HOUR_MS = 60 * 60 * 1000;',
    'const ATTEMPT_TTL_MS = 30 * 60_000;',
    'const SECONDS_PER_DAY = 86_400;',
    '// one day is 86_400_000 ms',
    'const id = item.v86400000;',
  ]) {
    assert.equal(dayArithmeticLines(text).length, 0, text);
  }
});

test('fails a business date built by hand outside common/kst, but not inside it or in tests', () => {
  const planted = 'const requiredCutoff = new Date(currentBusinessDate().getTime() - 86_400_000);\n';
  const result = analyzeBusinessDateArithmetic({
    files: {
      'apps/server/src/advertising/adapter/out/repository/new-source.repository.ts': planted,
      'apps/server/src/common/kst.ts': planted,
      'apps/server/src/advertising/__tests__/new-source.pg.integration.spec.ts': planted,
      'apps/server/src/advertising/domain/new-source.spec.ts': planted,
      'apps/server/src/test-helpers/new-seeds.ts': planted,
    },
    recorded: {},
  });
  assert.deepEqual(
    result.violations.map(({ file, found }) => [file, found.map(({ line }) => line)]),
    [['apps/server/src/advertising/adapter/out/repository/new-source.repository.ts', [1]]],
  );
});

test('holds recorded non-business-date lines to their ceiling and hints when they shrink', () => {
  const file = 'apps/server/src/example/lease.repository.ts';
  const lease = 'expiresAt: new Date(Date.now() + 24 * 60 * 60_000),\n';
  const recorded = { [file]: { lines: 1, reason: 'attempt lease expiry' } };
  assert.deepEqual(analyzeBusinessDateArithmetic({ files: { [file]: lease }, recorded }).violations, []);
  assert.equal(
    analyzeBusinessDateArithmetic({ files: { [file]: lease + lease }, recorded }).violations.length,
    1,
  );
  assert.deepEqual(
    analyzeBusinessDateArithmetic({ files: { [file]: '' }, recorded }).ratchet,
    [{ file, ceiling: 1, count: 0 }],
  );
});

test('the command exits non-zero for a violation planted in a repository tree', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'business-date-arithmetic-'));
  try {
    const planted = path.join(root, 'apps/server/src/orders/adapter/out/repository/planted.repository.ts');
    mkdirSync(path.dirname(planted), { recursive: true });
    writeFileSync(planted, 'export const cutoff = (now: Date) => new Date(now.getTime() - 86400000);\n');
    const failed = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
    assert.equal(failed.status, 1, failed.stdout);
    assert.match(failed.stderr, /planted\.repository\.ts:1/);

    writeFileSync(planted, 'export const cutoff = (now: Date) => evidenceCutoffDate(now);\n');
    const passed = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
    assert.equal(passed.status, 0, passed.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
