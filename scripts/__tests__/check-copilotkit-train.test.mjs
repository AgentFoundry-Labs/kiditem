import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assertPackageTrain,
  checkWorkspace,
} from '../check-copilotkit-train.mjs';

const lock = Object.freeze({
  copilotKit: '1.67.1',
  agUi: '0.0.57',
});

function writeJson(rootDir, relativePath, value) {
  const absolutePath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createWorkspace(t, manifests) {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), 'kiditem-copilotkit-train-'),
  );
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));
  writeJson(
    rootDir,
    'deploy/interaction-intelligence/platform-lock.json',
    lock,
  );

  for (const [manifestPath, manifest] of Object.entries(manifests)) {
    writeJson(rootDir, manifestPath, manifest);
  }

  return rootDir;
}

function validWorkspaceManifests() {
  return {
    'package.json': {
      dependencies: { '@copilotkit/react-core': '1.67.1' },
    },
    'apps/web/package.json': {
      dependencies: { '@copilotkit/runtime': '1.67.1' },
    },
    'apps/server/package.json': {
      dependencies: { '@ag-ui/client': '0.0.57' },
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

test('accepts the exact locked CopilotKit and AG-UI package train', () => {
  assert.doesNotThrow(() =>
    assertPackageTrain(
      {
        '@copilotkit/react-core': '1.67.1',
        '@copilotkit/runtime': '1.67.1',
        '@ag-ui/client': '0.0.57',
        '@ag-ui/core': '0.0.57',
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
});

test('rejects the React UI package removed from the v2 train', () => {
  assert.throws(
    () =>
      assertPackageTrain(
        {
          '@copilotkit/react-core': '1.67.1',
          '@copilotkit/react-ui': '1.67.1',
        },
        lock,
      ),
    /removed from the v2 train/,
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

  const removedPackageRoot = createWorkspace(t, {
    'package.json': {
      overrides: {
        'parent-package': {
          '@copilotkit/react-ui': '1.67.1',
        },
      },
    },
  });
  assertWorkspaceError(
    removedPackageRoot,
    'package.json overrides',
    /removed from the v2 train/,
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

test('missing optional workspace manifests are allowed', (t) => {
  const rootDir = createWorkspace(t, {
    'package.json': {
      dependencies: { '@copilotkit/react-core': '1.67.1' },
    },
  });

  assert.doesNotThrow(() => checkWorkspace(rootDir));
});

test('workspace failures surface the package removed from the v2 train first', (t) => {
  const rootDir = createWorkspace(t, {
    'package.json': {
      dependencies: { '@ag-ui/client': '^0.0.53' },
      devDependencies: { '@copilotkit/react-ui': '1.66.2' },
    },
  });

  assertWorkspaceError(
    rootDir,
    'package.json devDependencies',
    /removed from the v2 train/,
  );
});
