import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkAgentInteractionLifecycle } from '../check-agent-interaction-lifecycle.mjs';

const VALID_AGENT_EXECUTION_SCHEMA = `
model AgentExecution {
  id            String @id
  sessionId     String
  sessionTaskId String
}
`;

const RETIRED_EVIDENCE_PATHS = Object.freeze([
  'apps/server/src/agent-os/application/service/__tests__/agent-interaction-identity.service.spec.ts',
  'apps/server/src/agent-os/adapter/out/repository/__tests__/prisma-agent-interaction.repository.pg.integration.spec.ts',
  'packages/shared/src/agent-interaction/index.spec.ts',
]);

function writeText(rootDir, relativePath, source) {
  const absolutePath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source);
}

function createFixture() {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), 'kiditem-agent-interaction-lifecycle-'),
  );
  writeText(
    rootDir,
    'prisma/models/agents.prisma',
    VALID_AGENT_EXECUTION_SCHEMA,
  );
  return rootDir;
}

async function expectScannerFailure(
  source,
  relativePath = 'apps/server/src/agent-os/lifecycle.ts',
) {
  const rootDir = createFixture();
  try {
    writeText(rootDir, relativePath, `${source}\n`);
    assert.throws(
      () => checkAgentInteractionLifecycle(rootDir),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /retired agent interaction lifecycle/i);
        assert.ok(
          error.message.includes(relativePath),
          `expected ${relativePath} in ${error.message}`,
        );
        return true;
      },
    );
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

async function expectScannerSuccess(
  source,
  relativePath = 'apps/server/src/agent-os/lifecycle.ts',
) {
  const rootDir = createFixture();
  try {
    writeText(rootDir, relativePath, `${source}\n`);
    assert.doesNotThrow(() => checkAgentInteractionLifecycle(rootDir));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

test('rejects every exact retired lifecycle source identifier', async () => {
  for (const forbidden of [
    "'quick_ask'",
    'QuickAskScope',
    'AgentInteractionThreadBinding',
    'idleExpiresAt',
    'withQuickAskLock',
    'AgentSessionPromotion',
    'interactionClass:',
  ]) {
    await expectScannerFailure(forbidden);
  }
  await expectScannerSuccess('session creation requires capability policy');
});

test('scans every active implementation and shared-contract root', async () => {
  for (const relativePath of [
    'agents/src/runtime.py',
    'apps/interaction-gateway/src/runtime.ts',
    'apps/server/src/agent-os/runtime.ts',
    'apps/web/src/app/agent-runtime.tsx',
    'packages/shared/src/agent-interaction/runtime.ts',
  ]) {
    await expectScannerFailure('AgentSessionPromotion', relativePath);
  }
});

test('scans current-contract tests outside the exact evidence allowlist', async () => {
  await expectScannerFailure(
    'const lifecycle = withQuickAskLock;',
    'apps/server/src/agent-os/application/service/__tests__/new-lifecycle.spec.ts',
  );
});

test('ignores docs, plans, generated dependencies, and exact retired evidence', async () => {
  const source = [
    "'quick_ask'",
    'QuickAskScope',
    'AgentInteractionThreadBinding',
    'idleExpiresAt',
    'withQuickAskLock',
    'AgentSessionPromotion',
    'interactionClass:',
  ].join('\n');

  for (const relativePath of [
    'docs/agent-interaction-lifecycle.md',
    'docs/superpowers/plans/agent-interaction-lifecycle.md',
    'apps/server/src/generated/legacy-runtime.ts',
    'apps/server/src/node_modules/legacy-runtime/index.js',
    ...RETIRED_EVIDENCE_PATHS,
  ]) {
    await expectScannerSuccess(source, relativePath);
  }
});

test('requires non-null AgentExecution session ownership', () => {
  for (const field of ['sessionId', 'sessionTaskId']) {
    const rootDir = createFixture();
    try {
      writeText(
        rootDir,
        'prisma/models/agents.prisma',
        VALID_AGENT_EXECUTION_SCHEMA.replace(
          new RegExp(`(${field}\\s+)String`),
          '$1String?',
        ),
      );

      assert.throws(
        () => checkAgentInteractionLifecycle(rootDir),
        new RegExp(`AgentExecution\\.${field} must be non-null`),
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  }
});
