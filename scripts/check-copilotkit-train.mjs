#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLATFORM_LOCK_PATH =
  'deploy/copilotkit/platform-lock.json';

const EXPECTED_PLATFORM_LOCK = Object.freeze({
  copilotKit: '1.69.0',
  agUi: '0.0.57',
  node: '>=22 <23',
  fork: 'AgentFoundry-Labs/CopilotKit',
  upstream: 'CopilotKit/CopilotKit',
});

const PACKAGE_TRAINS = Object.freeze([
  ['@copilotkit/', 'copilotKit'],
  ['@ag-ui/', 'agUi'],
]);

const WORKSPACE_MANIFESTS = Object.freeze([
  'package.json',
  'apps/web/package.json',
  'apps/server/package.json',
  'packages/copilotkit-sqlite-runner/package.json',
]);

const PRODUCTION_SOURCE_ROOTS = Object.freeze([
  'apps/web/src',
  'apps/server/src',
]);

const PRODUCTION_SOURCE_FILE_PATTERN = /\.[cm]?[jt]sx?$/;

const EXCLUDED_PRODUCTION_RULES = Object.freeze([
  ['enterpriseChart', /\benterpriseChart\b/i],
  ['copilot-intelligence', /\bcopilot-intelligence\b/i],
  ['intelligenceApiKey', /\bintelligenceApiKey\b/i],
  ['COPILOTKIT_PUBLIC_API_KEY', /\bCOPILOTKIT_PUBLIC_API_KEY\b/],
  ['useThreads', /\buseThreads\b/],
  [
    'Kubernetes/Helm requirement',
    /\b(?:kubernetes|helm)\b(?:(?:["'`]\s*)?[:=]\s*["'`]?\s*|\s+)(?:[<>]=?|[~^])?\s*\d/i,
  ],
  ['CopilotKitIntelligence', /\bCopilotKitIntelligence\b/],
  [
    'CopilotKit Enterprise configuration',
    /\bCOPILOTKIT_(?:ENTERPRISE|INTELLIGENCE)_[A-Z0-9_]*\b/,
  ],
  [
    'CopilotKit-managed thread endpoint',
    /(?:https?:\/\/[^\s"'`]*copilotkit[^\s"'`]*|\/api\/copilotkit)\/threads(?:[/?#]|\b)/i,
  ],
]);

function packageTrain(packageName) {
  return PACKAGE_TRAINS.find(([prefix]) => packageName.startsWith(prefix));
}

export function assertPackageTrain(dependencies, lock) {
  for (const [packageName, actualVersion] of Object.entries(dependencies)) {
    const train = packageTrain(packageName);
    if (!train) continue;

    const [, lockKey] = train;
    const lockedVersion = lock[lockKey];
    if (actualVersion !== lockedVersion) {
      throw new Error(
        `${packageName} must equal exact locked version ${lockedVersion}; received ${JSON.stringify(actualVersion)}`,
      );
    }
  }
}

function overridePackageName(key) {
  const match = /^(@copilotkit\/[^@]+|@ag-ui\/[^@]+)(?:@.*)?$/.exec(key);
  return match?.[1];
}

function assertOverrideTrain(overrides, lock) {
  for (const [key, value] of Object.entries(overrides)) {
    const packageName = overridePackageName(key);

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

function assertOssProductionBoundary(relativePath, source) {
  for (const [name, pattern] of EXCLUDED_PRODUCTION_RULES) {
    if (pattern.test(source)) {
      throw new Error(
        `${relativePath}: ${name} is excluded from the CopilotKit OSS train`,
      );
    }
  }
}

function assertExactPlatformLock(lock) {
  const expectedKeys = Object.keys(EXPECTED_PLATFORM_LOCK).sort();
  const actualKeys = Object.keys(lock).sort();
  const hasExactKeys =
    JSON.stringify(actualKeys) === JSON.stringify(expectedKeys);
  const hasExactValues = expectedKeys.every(
    (key) => lock[key] === EXPECTED_PLATFORM_LOCK[key],
  );

  if (!hasExactKeys || !hasExactValues) {
    throw new Error(
      `${PLATFORM_LOCK_PATH}: must exactly match the OSS platform lock; received ${JSON.stringify(lock)}`,
    );
  }
}

function isProductionSourceFile(relativePath) {
  const segments = relativePath.split(path.sep);
  const fileName = segments.at(-1) ?? '';
  return (
    !segments.includes('__tests__') &&
    !/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(fileName) &&
    PRODUCTION_SOURCE_FILE_PATTERN.test(fileName)
  );
}

function listProductionSourceFiles(rootDir, relativeRoot) {
  const absoluteRoot = path.join(rootDir, relativeRoot);
  if (!existsSync(absoluteRoot)) return [];

  const files = [];
  const pending = [relativeRoot];
  while (pending.length > 0) {
    const relativeDir = pending.pop();
    const entries = readdirSync(path.join(rootDir, relativeDir), {
      withFileTypes: true,
    }).sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const relativePath = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') pending.push(relativePath);
        continue;
      }
      if (entry.isFile() && isProductionSourceFile(relativePath)) {
        files.push(relativePath);
      }
    }
  }

  return files.sort();
}

export function loadPlatformLock(rootDir) {
  const lock = JSON.parse(
    readFileSync(path.join(rootDir, PLATFORM_LOCK_PATH), 'utf8'),
  );
  assertExactPlatformLock(lock);
  return lock;
}

export function checkWorkspace(rootDir) {
  const lock = loadPlatformLock(rootDir);

  for (const manifestPath of WORKSPACE_MANIFESTS) {
    const absolutePath = path.join(rootDir, manifestPath);
    if (!existsSync(absolutePath)) continue;

    const source = readFileSync(absolutePath, 'utf8');
    assertOssProductionBoundary(manifestPath, source);

    const manifest = JSON.parse(source);
    for (const groupName of [
      'devDependencies',
      'dependencies',
      'optionalDependencies',
      'peerDependencies',
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

  for (const sourceRoot of PRODUCTION_SOURCE_ROOTS) {
    for (const relativePath of listProductionSourceFiles(rootDir, sourceRoot)) {
      assertOssProductionBoundary(
        relativePath,
        readFileSync(path.join(rootDir, relativePath), 'utf8'),
      );
    }
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  checkWorkspace(process.cwd());
  console.log('CopilotKit/AG-UI OSS train matches platform lock');
}
