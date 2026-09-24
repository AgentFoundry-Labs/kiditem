import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareToBaseline,
  parseTscDiagnostics,
  resolveTypeBaselineProject,
} from '../check-server-type-baseline.mjs';

test('counts diagnostics per file, including Next route-group paths with parentheses', () => {
  const output = [
    "apps/web/src/app/(catalog)/product-hub/page.spec.tsx(12,5): error TS2322: Type 'string' is not assignable to type 'number'.",
    "  Type 'string' is not assignable to type 'number'.",
    "apps/web/src/app/(catalog)/product-hub/page.spec.tsx(20,1): error TS2339: Property 'x' does not exist.",
    "apps/web/src/lib/utils.spec.ts(1,1): error TS2582: Cannot find name 'describe'.",
  ].join('\n');

  const { counts, projectErrors } = parseTscDiagnostics(output, { repoRoot: '/repo' });

  assert.deepEqual(projectErrors, []);
  assert.deepEqual([...counts.entries()], [
    ['apps/web/src/app/(catalog)/product-hub/page.spec.tsx', 2],
    ['apps/web/src/lib/utils.spec.ts', 1],
  ]);
});

test('ignores generated Next type files so a local build does not change the count', () => {
  const output = [
    "apps/web/.next/types/app/page.ts(3,3): error TS2344: Type 'Props' does not satisfy the constraint.",
    "apps/web/.next/dev/types/routes.d.ts(1,1): error TS2304: Cannot find name 'X'.",
    "apps/web/src/app/page.spec.tsx(1,1): error TS2304: Cannot find name 'Y'.",
  ].join('\n');

  const { counts } = parseTscDiagnostics(output, { repoRoot: '/repo', ignore: [/\/\.next\//] });

  assert.deepEqual([...counts.keys()], ['apps/web/src/app/page.spec.tsx']);
});

test('reports project-level diagnostics separately from file diagnostics', () => {
  const { projectErrors } = parseTscDiagnostics(
    "error TS18003: No inputs were found in config file 'x/tsconfig.json'.",
    { repoRoot: '/repo' },
  );
  assert.equal(projectErrors.length, 1);
});

test('fails on a new file or growth and tolerates decay', () => {
  const baseline = new Map([
    ['a.spec.ts', 2],
    ['b.spec.ts', 1],
  ]);

  assert.deepEqual(
    compareToBaseline({ baseline, current: new Map([['a.spec.ts', 1]]) }),
    { newFiles: [], grownFiles: [] },
  );
  assert.deepEqual(
    compareToBaseline({ baseline, current: new Map([['a.spec.ts', 3], ['c.spec.ts', 1]]) }),
    { newFiles: ['1 c.spec.ts'], grownFiles: ['a.spec.ts: 2 -> 3'] },
  );
});

test('resolves the server and web projects to their own configs and baselines', () => {
  assert.deepEqual(resolveTypeBaselineProject('server'), {
    name: 'server',
    tsconfig: 'apps/server/tsconfig.json',
    baselineFile: 'scripts/.server-type-baseline.txt',
    npmScript: 'check:server-type-baseline',
  });
  assert.deepEqual(resolveTypeBaselineProject('web'), {
    name: 'web',
    tsconfig: 'apps/web/tsconfig.json',
    baselineFile: 'scripts/.web-type-baseline.txt',
    npmScript: 'check:web-type-baseline',
  });
  assert.throws(() => resolveTypeBaselineProject('shared'), /unknown project/);
});
