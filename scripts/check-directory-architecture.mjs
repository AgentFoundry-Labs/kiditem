#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function listDirectories(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function analyzeDirectoryArchitecture({
  architectureDoc,
  serverSrcDirs,
  webAppDirs,
  webSrcDirs,
  webAppApiExists,
}) {
  const requiredPaths = [
    ...serverSrcDirs.map((name) => `apps/server/src/${name}`),
    ...webAppDirs.map((name) => `apps/web/src/app/${name}`),
    ...webSrcDirs
      .filter((name) => name !== 'app')
      .map((name) => `apps/web/src/${name}`),
  ].sort();

  const missing = requiredPaths.filter(
    (requiredPath) => !architectureDoc.includes(`\`${requiredPath}\``),
  );

  const forbidden = [];
  if (webAppApiExists) {
    forbidden.push('apps/web/src/app/api');
  }

  return { requiredPaths, missing, forbidden };
}

export function collectDirectoryArchitecture(root) {
  const webAppApiPath = path.join(root, 'apps/web/src/app/api');
  return {
    architectureDoc: readFileSync(path.join(root, 'docs/ARCHITECTURE.md'), 'utf8'),
    serverSrcDirs: listDirectories(path.join(root, 'apps/server/src')),
    webAppDirs: listDirectories(path.join(root, 'apps/web/src/app')),
    webSrcDirs: listDirectories(path.join(root, 'apps/web/src')),
    webAppApiExists: existsSync(webAppApiPath),
  };
}

function main() {
  const result = analyzeDirectoryArchitecture(collectDirectoryArchitecture(repoRoot()));
  const hasFailure = result.missing.length > 0 || result.forbidden.length > 0;

  if (!hasFailure) {
    console.log('check:directory-architecture PASS');
    return;
  }

  console.error('check:directory-architecture FAIL');
  if (result.missing.length > 0) {
    console.error(`Missing docs/ARCHITECTURE.md entries: ${result.missing.join(', ')}`);
  }
  if (result.forbidden.length > 0) {
    console.error(`Forbidden frontend route-handler directories: ${result.forbidden.join(', ')}`);
  }
  console.error('Update docs/ARCHITECTURE.md with the directory map or move the directory.');
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
