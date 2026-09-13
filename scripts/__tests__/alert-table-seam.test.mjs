import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * `apps/server/CONTEXT.md` defines a **Source owner** as the single module that
 * owns its rows, and `alerts.service.ts` says the same about the Alert table.
 * Both were false: Rules hand-filled fifteen Alert columns and minted a dedupe
 * key that carried the evaluation's request id, so every run left the operator
 * another copy of a violation nothing ever closed; the dashboard read the table
 * with its own filter, order, and limit, which is how a resolved alert took a
 * slot in a panel of unread ones.
 *
 * A comment could not hold that line. This scans for it.
 */
const PRISMA_ALERT_ACCESS = /\.alert\.(create|createMany|update|updateMany|upsert|findMany|findUnique|findFirst|delete|deleteMany|count|aggregate|groupBy)\b/;

test('nothing outside the alerts module reaches the Alert table', () => {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/server/src'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter((file) => file.endsWith('.ts'))
    // Specs read the table to assert on what the module wrote, which is the
    // seam working rather than being bypassed.
    .filter((file) => !file.includes('.spec.'))
    .filter((file) => !file.startsWith('apps/server/src/alerts/'))
    .filter((file) => existsSync(join(repoRoot, file)));

  const violations = files.filter((file) =>
    PRISMA_ALERT_ACCESS.test(readFileSync(join(repoRoot, file), 'utf8')),
  );

  assert.deepEqual(
    violations,
    [],
    'Route the write or read through apps/server/src/alerts/alerts.service.ts. '
      + 'It owns the Alert row shape, the dedupe key, and what a repeat finding means.',
  );
});

test('the scanner recognises the shape it is guarding against', () => {
  assert.ok(PRISMA_ALERT_ACCESS.test('await tx.alert.createMany({ data: alerts });'));
  assert.ok(PRISMA_ALERT_ACCESS.test('this.prisma.alert.findMany({ where })'));
  // A field or variable named `alert` is not the table.
  assert.ok(!PRISMA_ALERT_ACCESS.test('const title = alert.title;'));
  assert.ok(!PRISMA_ALERT_ACCESS.test('alerts.recordTerminalOutcome(tx, input)'));
});
