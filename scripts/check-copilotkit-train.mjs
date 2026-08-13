#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCKED_PACKAGES = Object.freeze({
  '@copilotkit/react-core': 'copilotKit',
  '@copilotkit/runtime': 'copilotKit',
  '@ag-ui/client': 'agUi',
  '@ag-ui/core': 'agUi',
});

const WORKSPACE_MANIFESTS = Object.freeze([
  'package.json',
  'apps/web/package.json',
  'apps/server/package.json',
  'apps/interaction-gateway/package.json',
]);

export function assertPackageTrain(dependencies, lock) {
  if (Object.hasOwn(dependencies, '@copilotkit/react-ui')) {
    throw new Error('@copilotkit/react-ui was removed from the v2 train');
  }

  for (const [packageName, lockKey] of Object.entries(LOCKED_PACKAGES)) {
    if (!Object.hasOwn(dependencies, packageName)) continue;

    const actualVersion = dependencies[packageName];
    const lockedVersion = lock[lockKey];
    if (actualVersion !== lockedVersion) {
      throw new Error(
        `${packageName} must equal exact locked version ${lockedVersion}; received ${JSON.stringify(actualVersion)}`,
      );
    }
  }
}

export function loadPlatformLock(rootDir) {
  const lockPath = path.join(
    rootDir,
    'deploy',
    'interaction-intelligence',
    'platform-lock.json',
  );
  return JSON.parse(readFileSync(lockPath, 'utf8'));
}

export function checkWorkspace(rootDir) {
  const lock = loadPlatformLock(rootDir);

  for (const manifestPath of WORKSPACE_MANIFESTS) {
    const absolutePath = path.join(rootDir, manifestPath);
    if (!existsSync(absolutePath)) continue;

    const manifest = JSON.parse(readFileSync(absolutePath, 'utf8'));
    assertPackageTrain(
      {
        ...(manifest.dependencies ?? {}),
        ...(manifest.devDependencies ?? {}),
        ...(manifest.overrides ?? {}),
      },
      lock,
    );
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  checkWorkspace(process.cwd());
  console.log('CopilotKit/AG-UI train matches platform lock');
}
