import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * An alert's whole purpose is to take an operator somewhere. Its `href` is an
 * unconstrained string in the contract, and three of them led nowhere:
 * `/ads/profitability-imports/current` was the server's own `@Controller` path,
 * `/analytics/sellpia-product-sales` had no page at all while its sibling source
 * correctly used `/stock-ops`, and `/sourcing-ai/wholesale` was missing the
 * `-search` the real route carries. Nobody noticed, because nothing checks.
 *
 * A `WebRoute` union in the shared contract would catch this at the write site,
 * at the cost of making the server's contract know the web's page tree. This
 * costs one test.
 */
function tracked(pathspec) {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', pathspec], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean);
}

/** Every route the Next.js app router actually serves, with route groups removed. */
function webRoutes() {
  return new Set(
    tracked('apps/web/src/app')
      .filter(
        (file) => file.endsWith('/page.tsx') && existsSync(join(repoRoot, file)),
      )
      .map((file) =>
        file
          .replace('apps/web/src/app', '')
          .replace('/page.tsx', '')
          .replaceAll(/\/?\([^)]*\)/g, '')
        || '/',
      ),
  );
}

/** `/product-hub/abc` is served by `/product-hub/[id]`. */
function resolves(href, routes) {
  if (routes.has(href)) return true;
  const segments = href.split('/');
  for (let i = segments.length - 1; i > 0; i -= 1) {
    const candidate = [...segments.slice(0, i), '[id]', ...segments.slice(i + 1)].join('/');
    if (routes.has(candidate)) return true;
  }
  return false;
}

test('every alert href leads to a page the app serves', () => {
  const routes = webRoutes();
  assert.ok(routes.size > 10, 'expected to find the app router pages');

  const broken = [];
  for (const file of tracked('apps/server/src')) {
    if (!file.endsWith('.ts') || !existsSync(join(repoRoot, file))) continue;
    // Specs use stand-in paths to assert on the row, not to send anyone there.
    if (file.includes('.spec.') || file.includes('__tests__')) continue;
    const source = readFileSync(join(repoRoot, file), 'utf8');
    for (const match of source.matchAll(/href: '(\/[^']*)'/g)) {
      if (!resolves(match[1], routes)) broken.push(`${file}: ${match[1]}`);
    }
  }

  assert.deepEqual(broken, [], 'An alert that links nowhere is worse than no link.');
});

test('the resolver understands dynamic segments and route groups', () => {
  const routes = new Set(['/product-hub', '/product-hub/[id]', '/stock-ops']);
  assert.ok(resolves('/stock-ops', routes));
  assert.ok(resolves('/product-hub/abc-1', routes));
  assert.ok(!resolves('/product-hub/abc-1/editor', routes));
  assert.ok(!resolves('/ads/profitability-imports/current', routes));
});

test('route groups do not appear in the served path', () => {
  assert.ok(existsSync(join(repoRoot, 'apps/web/src/app/(inventory)/stock-ops/page.tsx')));
  assert.ok(webRoutes().has('/stock-ops'));
});
