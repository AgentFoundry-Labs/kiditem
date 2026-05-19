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

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath);
    return [entryPath];
  });
}

function directOutPortFiles(backendPortFiles) {
  return backendPortFiles
    .filter((file) => file.endsWith('.ts'))
    .filter((file) => {
      const marker = '/application/port/out/';
      const markerIndex = file.indexOf(marker);
      if (markerIndex === -1) return false;

      const rest = file.slice(markerIndex + marker.length);
      return !rest.includes('/') && rest !== 'index.ts';
    })
    .sort();
}

export function analyzeDirectoryArchitecture({
  architectureDoc,
  serverSrcDirs,
  webAppDirs,
  webSrcDirs,
  webAppApiExists,
  backendPortFiles = [],
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

  return {
    requiredPaths,
    missing,
    forbidden,
    directOutPortFiles: directOutPortFiles(backendPortFiles),
  };
}

export function collectDirectoryArchitecture(root) {
  const webAppApiPath = path.join(root, 'apps/web/src/app/api');
  const serverSrcPath = path.join(root, 'apps/server/src');
  return {
    architectureDoc: readFileSync(path.join(root, 'docs/ARCHITECTURE.md'), 'utf8'),
    serverSrcDirs: listDirectories(serverSrcPath),
    backendPortFiles: listFiles(serverSrcPath)
      .map((file) => path.relative(root, file))
      .filter((file) => file.includes('/application/port/')),
    webAppDirs: listDirectories(path.join(root, 'apps/web/src/app')),
    webSrcDirs: listDirectories(path.join(root, 'apps/web/src')),
    webAppApiExists: existsSync(webAppApiPath),
  };
}

function main() {
  const result = analyzeDirectoryArchitecture(collectDirectoryArchitecture(repoRoot()));
  const hasFailure =
    result.missing.length > 0 ||
    result.forbidden.length > 0 ||
    result.directOutPortFiles.length > 0;

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
  if (result.directOutPortFiles.length > 0) {
    console.error(
      `Outgoing port files must live under explicit lane directories: ${result.directOutPortFiles.join(', ')}`,
    );
  }
  console.error('Update docs/ARCHITECTURE.md with the directory map or move the directory.');
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
