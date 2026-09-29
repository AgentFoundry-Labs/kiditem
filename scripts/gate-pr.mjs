#!/usr/bin/env node
// Local mirror of the PR Checks workflow (KID-400). Run before `gh pr create`:
//   npm run gate:pr            # everything the PR jobs run, in the same order
//   npm run gate:pr -- --fast  # skip the shared/server vitest suites
//   npm run gate:pr -- --base origin/release/office
// Stops at the first failing step and prints the time of each step so the slow
// ones are visible. Exit code is the failing step's exit code.
import { execFileSync, spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const fast = args.includes('--fast');
const baseIndex = args.indexOf('--base');
const base = baseIndex >= 0 ? args[baseIndex + 1] : 'origin/develop';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const mergeBase = execFileSync('git', ['merge-base', base, 'HEAD'], { encoding: 'utf8' }).trim();

const steps = [
  ['git diff --check', 'git', ['diff', '--check', `${mergeBase}...HEAD`]],
  ['check:agents-hygiene', npm, ['run', '--silent', 'check:agents-hygiene']],
  ['extension:check', npm, ['run', '--silent', 'extension:check']],
  ['test:scripts', npm, ['run', '--silent', 'test:scripts']],
  ['check:conventions', npm, ['run', '--silent', 'check:conventions']],
];
if (!fast) {
  steps.push(['shared vitest', npm, ['exec', '--workspace=packages/shared', 'vitest', '--', 'run']]);
  steps.push(['server vitest', npm, ['exec', '--workspace=apps/server', 'vitest', '--', 'run']]);
}

const results = [];
for (const [name, command, commandArgs] of steps) {
  const startedAt = Date.now();
  console.log(`\n▶ gate:pr ${name}`);
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
  const status = result.status ?? 1;
  results.push([name, status === 0 ? 'PASS' : 'FAIL', `${seconds}s`]);
  if (status !== 0) {
    printSummary();
    console.error(`\ngate:pr FAIL at "${name}" (exit ${status})`);
    process.exit(status);
  }
}
printSummary();
console.log('\ngate:pr PASS');

function printSummary() {
  console.log('\n' + results.map(([name, status, seconds]) => `${status.padEnd(4)} ${seconds.padStart(5)}  ${name}`).join('\n'));
}
