import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assertPackageTrain,
  checkWorkspace,
  loadPlatformLock,
} from '../check-copilotkit-train.mjs';
import { analyzeInventory } from '../check-script-inventory.mjs';

const lock = Object.freeze({
  copilotKit: '1.67.1',
  agUi: '0.0.57',
  node: '>=22 <23',
  fork: 'AgentFoundry-Labs/CopilotKit',
  upstream: 'CopilotKit/CopilotKit',
});

const forbiddenProductionValues = Object.freeze([
  ['enterpriseChart', 'const enterpriseChart = "0.10.23";'],
  [
    'copilot-intelligence',
    'import intelligence from "@copilotkit/copilot-intelligence";',
  ],
  ['intelligenceApiKey', 'const intelligenceApiKey = process.env.KEY;'],
  [
    'COPILOTKIT_PUBLIC_API_KEY',
    'const key = process.env.COPILOTKIT_PUBLIC_API_KEY;',
  ],
  ['useThreads', 'const threads = useThreads();'],
  ['Kubernetes', 'const runtimeRequirement = "Kubernetes >=1.28";'],
  ['Helm', 'const deploymentRequirement = "Helm >=3.12";'],
  [
    'CopilotKit-managed thread endpoint',
    'const threadsUrl = "https://api.copilotkit.ai/threads";',
  ],
  [
    'CopilotKit-managed thread endpoint',
    'const threadsUrl = "/api/copilotkit/threads";',
  ],
]);

function writeText(rootDir, relativePath, value) {
  const absolutePath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, value);
}

function writeJson(rootDir, relativePath, value) {
  writeText(rootDir, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createWorkspace(t, manifests = validWorkspaceManifests()) {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), 'kiditem-copilotkit-train-'),
  );
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));
  writeJson(rootDir, 'deploy/interaction-gateway/platform-lock.json', lock);

  for (const [manifestPath, manifest] of Object.entries(manifests)) {
    writeJson(rootDir, manifestPath, manifest);
  }

  return rootDir;
}

function validWorkspaceManifests() {
  return {
    'package.json': {
      dependencies: { '@ag-ui/client': '0.0.57' },
      devDependencies: {
        '@copilotkit/react-core': '1.67.1',
        '@copilotkit/react-ui': '1.67.1',
        '@copilotkit/runtime': '1.67.1',
      },
    },
    'apps/web/package.json': {
      dependencies: {
        '@copilotkit/react-core': '1.67.1',
        '@copilotkit/react-ui': '1.67.1',
      },
    },
    'apps/server/package.json': {
      dependencies: { '@copilotkit/runtime': '1.67.1' },
    },
    'apps/interaction-gateway/package.json': {
      dependencies: { '@ag-ui/core': '0.0.57' },
    },
  };
}

function assertWorkspaceError(rootDir, context, pattern) {
  assert.throws(
    () => checkWorkspace(rootDir),
    (error) => {
      assert.ok(error instanceof Error);
      assert.ok(
        error.message.startsWith(`${context}:`),
        `expected error context ${context}, received ${error.message}`,
      );
      assert.match(error.message, pattern);
      return true;
    },
  );
}

test('loads only the exact OSS interaction gateway platform lock', (t) => {
  const rootDir = createWorkspace(t);

  assert.deepEqual(loadPlatformLock(rootDir), lock);
  assert.doesNotThrow(() => checkWorkspace(rootDir));
});

test('rejects vendor lock fields outside the exact OSS boundary', (t) => {
  for (const [field, value] of [
    ['enterpriseChart', '0.10.23'],
    ['kubernetes', '>=1.28'],
    ['helm', '>=3.12'],
    ['postgresql', '>=14'],
    ['redis', '>=7'],
  ]) {
    const rootDir = createWorkspace(t);
    writeJson(rootDir, 'deploy/interaction-gateway/platform-lock.json', {
      ...lock,
      [field]: value,
    });

    assertWorkspaceError(
      rootDir,
      'deploy/interaction-gateway/platform-lock.json',
      /must exactly match the OSS platform lock/,
    );
  }
});

test('accepts the exact locked CopilotKit and AG-UI package train', () => {
  assert.doesNotThrow(() =>
    assertPackageTrain(
      {
        '@copilotkit/react-core': '1.67.1',
        '@copilotkit/react-ui': '1.67.1',
        '@copilotkit/runtime': '1.67.1',
        '@copilotkit/shared': '1.67.1',
        '@ag-ui/client': '0.0.57',
        '@ag-ui/core': '0.0.57',
        '@ag-ui/encoder': '0.0.57',
      },
      lock,
    ),
  );
});

test('rejects ranges and mixed package versions', () => {
  assert.throws(
    () =>
      assertPackageTrain(
        {
          '@copilotkit/react-core': '^1.67.1',
          '@copilotkit/runtime': '1.67.1',
          '@ag-ui/client': '0.0.57',
          '@ag-ui/core': '0.0.57',
        },
        lock,
      ),
    /must equal exact locked version/,
  );

  assert.throws(
    () =>
      assertPackageTrain(
        {
          '@copilotkit/react-core': '1.67.1',
          '@copilotkit/runtime': '1.66.2',
          '@ag-ui/client': '0.0.57',
          '@ag-ui/core': '0.0.57',
        },
        lock,
      ),
    /must equal exact locked version/,
  );

  assert.throws(
    () =>
      assertPackageTrain(
        {
          '@copilotkit/shared': '1.66.2',
          '@ag-ui/encoder': '^0.0.57',
        },
        lock,
      ),
    /must equal exact locked version/,
  );
});

test('keeps the temporary React UI dependency exact-pinned', () => {
  assert.doesNotThrow(() =>
    assertPackageTrain({ '@copilotkit/react-ui': '1.67.1' }, lock),
  );
  assert.throws(
    () => assertPackageTrain({ '@copilotkit/react-ui': '^1.67.1' }, lock),
    /must equal exact locked version/,
  );
});

test('checkWorkspace scans all configured manifests and identifies the failing group', (t) => {
  const cases = [
    ['package.json', 'dependencies'],
    ['apps/web/package.json', 'devDependencies'],
    ['apps/server/package.json', 'overrides'],
    ['apps/interaction-gateway/package.json', 'dependencies'],
  ];

  for (const [manifestPath, group] of cases) {
    const manifests = validWorkspaceManifests();
    manifests[manifestPath] = {
      ...manifests[manifestPath],
      [group]: { '@copilotkit/react-core': '^1.67.1' },
    };
    const rootDir = createWorkspace(t, manifests);

    assertWorkspaceError(
      rootDir,
      `${manifestPath} ${group}`,
      /must equal exact locked version/,
    );
  }
});

test('duplicate declarations cannot mask an invalid package range', (t) => {
  const rootDir = createWorkspace(t, {
    'package.json': {
      dependencies: { '@copilotkit/runtime': '^1.67.1' },
      devDependencies: { '@copilotkit/runtime': '1.67.1' },
    },
  });

  assertWorkspaceError(
    rootDir,
    'package.json dependencies',
    /must equal exact locked version/,
  );
});

test('nested overrides are recursively inspected', (t) => {
  const invalidRangeRoot = createWorkspace(t, {
    'package.json': {
      overrides: {
        'parent-package': {
          '@ag-ui/client': '^0.0.57',
        },
      },
    },
  });
  assertWorkspaceError(
    invalidRangeRoot,
    'package.json overrides',
    /must equal exact locked version/,
  );

  const invalidReactUiRoot = createWorkspace(t, {
    'package.json': {
      overrides: {
        'parent-package': {
          '@copilotkit/react-ui': '^1.67.1',
        },
      },
    },
  });
  assertWorkspaceError(
    invalidReactUiRoot,
    'package.json overrides',
    /must equal exact locked version/,
  );
});

test('target override objects validate their dot self version', (t) => {
  const exactRoot = createWorkspace(t, {
    'package.json': {
      overrides: {
        '@copilotkit/runtime': { '.': '1.67.1' },
        '@ag-ui/core': { '.': '0.0.57' },
      },
    },
  });
  assert.doesNotThrow(() => checkWorkspace(exactRoot));

  const rangedRoot = createWorkspace(t, {
    'package.json': {
      overrides: {
        '@copilotkit/runtime': { '.': '^1.67.1' },
      },
    },
  });
  assertWorkspaceError(
    rangedRoot,
    'package.json overrides',
    /must equal exact locked version/,
  );
});

test('rejects excluded Enterprise and managed-thread production source', (t) => {
  for (const [name, source] of forbiddenProductionValues) {
    const rootDir = createWorkspace(t);
    writeText(rootDir, 'apps/interaction-gateway/src/runtime.ts', `${source}\n`);

    assertWorkspaceError(
      rootDir,
      'apps/interaction-gateway/src/runtime.ts',
      new RegExp(name, 'i'),
    );
  }
});

test('rejects excluded Enterprise configuration in production manifests', (t) => {
  for (const [name, value] of forbiddenProductionValues) {
    const manifests = validWorkspaceManifests();
    manifests['apps/interaction-gateway/package.json'] = {
      ...manifests['apps/interaction-gateway/package.json'],
      kiditemTestConfig: value,
    };
    const rootDir = createWorkspace(t, manifests);

    assertWorkspaceError(
      rootDir,
      'apps/interaction-gateway/package.json',
      new RegExp(name, 'i'),
    );
  }
});

test('ignores documentation, tests, and transitive lockfile package names', (t) => {
  const rootDir = createWorkspace(t);
  const excludedBoundaryExplanation = forbiddenProductionValues
    .map(([, value]) => value)
    .join('\n');
  writeText(
    rootDir,
    'docs/oss-boundary.md',
    excludedBoundaryExplanation,
  );
  writeText(
    rootDir,
    'apps/interaction-gateway/src/__tests__/boundary.test.ts',
    excludedBoundaryExplanation,
  );
  writeJson(rootDir, 'package-lock.json', {
    packages: {
      'node_modules/@copilotkit/copilot-intelligence': {
        version: '0.10.23',
      },
      'node_modules/@ag-ui/client': { version: '0.0.53' },
    },
  });

  assert.doesNotThrow(() => checkWorkspace(rootDir));
});

test('missing optional workspace manifests are allowed', (t) => {
  const rootDir = createWorkspace(t, {
    'package.json': {
      dependencies: { '@copilotkit/react-core': '1.67.1' },
    },
  });

  assert.doesNotThrow(() => checkWorkspace(rootDir));
});

test('workspace failures surface forbidden production config before train drift', (t) => {
  const rootDir = createWorkspace(t, {
    'package.json': {
      dependencies: { '@ag-ui/client': '^0.0.53' },
      kiditemConfig: {
        intelligenceApiKey: 'forbidden-placeholder',
      },
    },
  });

  assertWorkspaceError(
    rootDir,
    'package.json',
    /intelligenceApiKey/,
  );
});

test('script inventory rejects a substituted CopilotKit train entrypoint', () => {
  const result = analyzeInventory({
    actualFiles: [],
    readme: '',
    packageScripts: {
      'check:copilotkit-train': 'echo skipped',
    },
  });

  assert.ok(result.missingPackageHooks.includes('check:copilotkit-train'));
});
