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

function overridePackageName(key) {
  return Object.keys(LOCKED_PACKAGES)
    .concat('@copilotkit/react-ui')
    .find((packageName) => key === packageName || key.startsWith(`${packageName}@`));
}

function assertOverrideTrain(overrides, lock) {
  for (const [key, value] of Object.entries(overrides)) {
    const packageName = overridePackageName(key);

    if (packageName === '@copilotkit/react-ui') {
      throw new Error('@copilotkit/react-ui was removed from the v2 train');
    }

    if (packageName) {
      const version =
        typeof value === 'object' && value !== null ? value['.'] : value;
      if (version !== undefined) {
        assertPackageTrain({ [packageName]: version }, lock);
      }
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      assertOverrideTrain(value, lock);
    }
  }
}

function assertManifestGroup(manifestPath, groupName, values, lock) {
  try {
    if (groupName === 'overrides') {
      assertOverrideTrain(values, lock);
    } else {
      assertPackageTrain(values, lock);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`${manifestPath} ${groupName}: ${error.message}`, {
        cause: error,
      });
    }
    throw error;
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
    for (const groupName of [
      'devDependencies',
      'dependencies',
      'overrides',
    ]) {
      assertManifestGroup(
        manifestPath,
        groupName,
        manifest[groupName] ?? {},
        lock,
      );
    }
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  checkWorkspace(process.cwd());
  console.log('CopilotKit/AG-UI train matches platform lock');
}
