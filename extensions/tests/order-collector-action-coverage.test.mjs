import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const routeRoot = path.join(repoRoot, 'apps/web/src/app/(orders)/order-collection');
const workerPath = path.join(
  repoRoot,
  'extensions/order-collector/background/service-worker.js',
);
const manifestPath = path.join(repoRoot, 'extensions/order-collector/manifest.json');

function sourceFilesUnder(directory) {
  return readdirSync(directory).flatMap((name) => {
    const entry = path.join(directory, name);
    if (statSync(entry).isDirectory()) return sourceFilesUnder(entry);
    return /\.(ts|tsx)$/.test(name) ? [entry] : [];
  });
}

test('order-collection route actions are handled by the extension worker', () => {
  const requestedActions = new Set();
  for (const file of sourceFilesUnder(routeRoot)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/action:\s*['"]([^'"]+)['"]/g)) {
      requestedActions.add(match[1]);
    }
  }

  const worker = readFileSync(workerPath, 'utf8');
  const handledActions = new Set(
    [...worker.matchAll(/msg\?\.action\s*===\s*['"]([^'"]+)['"]/g)].map(
      (match) => match[1],
    ),
  );
  const missingActions = [...requestedActions].filter(
    (action) => !handledActions.has(action),
  );

  assert.deepEqual(missingActions, []);
});

test('order collector manifest grants the exact Kakao seller host', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  assert.ok(manifest.host_permissions.includes('https://shopping-seller.kakao.com/*'));
});
