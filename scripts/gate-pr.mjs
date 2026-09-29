#!/usr/bin/env node
// Local mirror of the PR Checks workflow (KID-400). Run before `gh pr create`:
//   npm run gate:pr            # the PR jobs' checks, in job order
//   npm run gate:pr -- --fast  # skip the vitest / node --test suites
//   npm run gate:pr -- --base origin/release/office
// Covers: hygiene job (git diff --check, agents hygiene), unit job (shared and
// server vitest, extension bundle check, extension vitest and node tests) and
// script-contract job (cutover blocker coverage, script contract tests,
// workspace type builds, convention scanners). Not covered: the Gateway job
// (build + vitest of apps/agent-gateway), which CI runs only when its inputs change.
// Stops at the first failing step and prints the time of each step.
import { execFileSync, spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const fast = args.includes('--fast');
const baseIndex = args.indexOf('--base');
const baseValue = baseIndex >= 0 ? args[baseIndex + 1] : undefined;
if (baseIndex >= 0 && (!baseValue || baseValue.startsWith('--'))) {
  console.error('gate:pr: --base needs a ref, e.g. --base origin/develop');
  process.exit(2);
}
const base = baseValue ?? 'origin/develop';
const windows = process.platform === 'win32';
const npm = windows ? 'npm.cmd' : 'npm';

let mergeBase;
try {
  mergeBase = execFileSync('git', ['merge-base', base, 'HEAD'], { encoding: 'utf8' }).trim();
} catch (error) {
  console.error(`gate:pr: cannot find the merge base with ${base}: ${error.message.trim()}`);
  process.exit(2);
}

const steps = [
  ['git diff --check', 'git', ['diff', '--check', `${mergeBase}...HEAD`]],
  ['check:agents-hygiene', npm, ['run', '--silent', 'check:agents-hygiene']],
  ['extension:check', npm, ['run', '--silent', 'extension:check']],
];
if (!fast) {
  steps.push(['shared vitest', npm, ['exec', '--workspace=packages/shared', 'vitest', '--', 'run']]);
  steps.push(['server vitest', npm, ['exec', '--workspace=apps/server', 'vitest', '--', 'run']]);
  steps.push(['extension:test', npm, ['run', '--silent', 'extension:test']]);
  steps.push(['extension node tests', 'node', ['--test', '--test-concurrency=8', 'extensions/tests/*.test.mjs', 'extensions/tests/*/*.test.mjs']]);
}
steps.push(['cutover blocker coverage', 'node', ['scripts/check-cutover-blocker-coverage.mjs', '--base-ref', 'origin/release/office']]);
steps.push(['test:scripts', npm, ['run', '--silent', 'test:scripts']]);
steps.push(['build shared/runner/templates', npm, ['run', '--silent', 'build', '--workspace=packages/shared', '--workspace=packages/copilotkit-sqlite-runner', '--workspace=packages/templates']]);
steps.push(['check:conventions', npm, ['run', '--silent', 'check:conventions']]);

const results = [];
for (const [name, command, commandArgs] of steps) {
  const startedAt = Date.now();
  console.log(`\n▶ gate:pr ${name}`);
  // Node refuses to spawn .cmd files without a shell on Windows; a shell is also what expands the node --test globs.
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', shell: windows || command === 'node' });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
  const status = result.error ? 1 : (result.status ?? 1);
  results.push([name, status === 0 ? 'PASS' : 'FAIL', `${seconds}s`]);
  if (status !== 0) {
    if (result.error) console.error(`gate:pr: could not run ${command}: ${result.error.message}`);
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
