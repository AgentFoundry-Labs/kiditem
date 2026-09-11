import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * PRODUCT.md's brand commitments: an English reason code never reaches the
 * screen. Source owners publish a durable alert when a collection fails, and
 * nineteen of them composed its user-facing message as `${code}: ${message}` —
 * so the dashboard's notification panel read
 *
 *   쿠팡 Wing 트래픽 수집 실패 · 확인 필요
 *   WING_TRAFFIC_DATA_NOT_READY: Wing 트래픽 데이터가 …
 *
 * The code is not lost by dropping it: every one of those owners already writes
 * it to its own run row as `errorCode`, which is where logs and correlation read
 * it from. Only the message a person reads had to change.
 *
 * This scans for the shape rather than trusting nineteen files to stay fixed,
 * because the next source owner will be written by copying one of them.
 */
const REASON_CODE_IN_MESSAGE = /message:\s*`\$\{[^}]*(?:code|Code)[^}]*\}:\s/;

test('no source owner prefixes an alert message with its reason code', () => {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/server/src'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter((file) => file.endsWith('.ts') && !file.includes('.spec.'))
    .filter((file) => existsSync(join(repoRoot, file)));

  const violations = files.filter((file) =>
    REASON_CODE_IN_MESSAGE.test(readFileSync(join(repoRoot, file), 'utf8')),
  );

  assert.deepEqual(
    violations,
    [],
    `An alert message must carry only what a person should read. Keep the reason `
      + `code on the run row's errorCode, which logs and correlation already use.`,
  );
});

test('the scanner recognises the shape it is guarding against', () => {
  assert.ok(REASON_CODE_IN_MESSAGE.test('message: `${code}: ${message}`.slice(0, 300),'));
  assert.ok(REASON_CODE_IN_MESSAGE.test('message: `${input.errorCode}: ${input.errorMessage}`,'));
  // A message that merely interpolates text is fine; only a reason code is not.
  assert.ok(!REASON_CODE_IN_MESSAGE.test('message: `${count}건을 처리했습니다`,'));
  assert.ok(!REASON_CODE_IN_MESSAGE.test('message: message.slice(0, 300),'));
});
