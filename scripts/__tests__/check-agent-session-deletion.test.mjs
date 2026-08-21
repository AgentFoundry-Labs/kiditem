import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scannerPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'check-agent-session-deletion.mjs',
);

function writeFixtureFile(rootDir, relativePath, source) {
  const absolutePath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source);
}

function fixture(files) {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'kiditem-agent-session-deletion-'));
  for (const [relativePath, source] of Object.entries(files)) {
    writeFixtureFile(rootDir, relativePath, source);
  }
  return rootDir;
}

function runScanner(rootDir) {
  return spawnSync(process.execPath, [scannerPath], {
    cwd: rootDir,
    encoding: 'utf8',
  });
}

function withFixture(files, assertResult) {
  const rootDir = fixture(files);
  try {
    assertResult(runScanner(rootDir));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

test('rejects every retired lifecycle concept', () => {
  withFixture(
    {
      'prisma/models/agents.prisma': 'model AgentSessionTombstone {}',
    },
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /AgentSessionTombstone/);
    },
  );
});

test('rejects raw artifact references and a second deletion worker', () => {
  withFixture(
    {
      'apps/server/src/agent-os/a.ts': 'const storageReference = input.path;',
      'apps/server/src/agent-os/b.ts': 'setInterval(runDeletion, 1000);',
    },
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /storageReference/);
      assert.match(result.stderr, /second deletion scheduler/);
    },
  );
});

test('rejects ephemeral success policy outside the AgentSession deletion definition', () => {
  withFixture(
    {
      'apps/server/src/agent-os/domain/operation/agent-os.operations.ts': [
        "export const OTHER_OPERATION_KEY = 'agent-os.other';",
        'export const definition = {',
        '  key: OTHER_OPERATION_KEY,',
        "  successPersistence: 'ephemeral_on_success',",
        '};',
      ].join('\n'),
    },
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /AGENT_SESSION_DELETE_OPERATION_KEY/);
    },
  );
});

test('rejects another definition in a source file that also declares the deletion key', () => {
  withFixture(
    {
      'apps/server/src/agent-os/domain/operation/agent-os.operations.ts': [
        "export const AGENT_SESSION_DELETE_OPERATION_KEY = 'agent-os.delete-session';",
        "export const OTHER_OPERATION_KEY = 'agent-os.other';",
        'export const definition = {',
        '  key: OTHER_OPERATION_KEY,',
        "  successPersistence: 'ephemeral_on_success',",
        '};',
      ].join('\n'),
    },
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /AGENT_SESSION_DELETE_OPERATION_KEY/);
    },
  );
});

test('permits ephemeral success only when the AgentSession deletion key owns the definition', () => {
  const transactionAdapter = [
    'apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-conversation-event.transaction.ts',
    'apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-run-authorization.transaction.ts',
    'apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-execution-usage.transaction.ts',
    'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-delegation.transaction.ts',
    'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-approval-continuation.transaction.ts',
    'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-attempt-operation.transaction.ts',
    'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-session-transition.transaction.ts',
  ];
  const files = Object.fromEntries(transactionAdapter.map((relativePath) => [
    relativePath,
    "import { lockWritableAgentSession } from './lock-writable-agent-session';\nlockWritableAgentSession;",
  ]));
  files['apps/server/src/agent-os/domain/operation/agent-os.operations.ts'] = [
    "export const AGENT_SESSION_DELETE_OPERATION_KEY = 'agent-os.delete-session';",
    'export const definition = {',
    '  key: AGENT_SESSION_DELETE_OPERATION_KEY,',
    "  successPersistence: 'ephemeral_on_success',",
    '};',
  ].join('\n');

  withFixture(files, (result) => {
    assert.equal(result.status, 0);
  });
});

test('permits a deletion definition when an earlier string contains an opening brace', () => {
  const transactionAdapter = [
    'apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-conversation-event.transaction.ts',
    'apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-run-authorization.transaction.ts',
    'apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-execution-usage.transaction.ts',
    'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-delegation.transaction.ts',
    'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-approval-continuation.transaction.ts',
    'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-attempt-operation.transaction.ts',
    'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-session-transition.transaction.ts',
  ];
  const files = Object.fromEntries(transactionAdapter.map((relativePath) => [
    relativePath,
    "import { lockWritableAgentSession } from './lock-writable-agent-session';\nlockWritableAgentSession;",
  ]));
  files['apps/server/src/agent-os/domain/operation/agent-os.operations.ts'] = [
    "export const AGENT_SESSION_DELETE_OPERATION_KEY = 'agent-os.delete-session';",
    'export const definition = {',
    '  key: AGENT_SESSION_DELETE_OPERATION_KEY,',
    "  title: 'Delete {session',",
    "  successPersistence: 'ephemeral_on_success',",
    '};',
  ].join('\n');

  withFixture(files, (result) => {
    assert.equal(result.status, 0);
  });
});

test('rejects a later ephemeral definition after a valid deletion definition', () => {
  const transactionAdapter = [
    'apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-conversation-event.transaction.ts',
    'apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-run-authorization.transaction.ts',
    'apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-execution-usage.transaction.ts',
    'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-delegation.transaction.ts',
    'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-approval-continuation.transaction.ts',
    'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-attempt-operation.transaction.ts',
    'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-session-transition.transaction.ts',
  ];
  const files = Object.fromEntries(transactionAdapter.map((relativePath) => [
    relativePath,
    "import { lockWritableAgentSession } from './lock-writable-agent-session';\nlockWritableAgentSession;",
  ]));
  files['apps/server/src/agent-os/domain/operation/agent-os.operations.ts'] = [
    "export const AGENT_SESSION_DELETE_OPERATION_KEY = 'agent-os.delete-session';",
    "export const OTHER_OPERATION_KEY = 'agent-os.other';",
    'export const deletionDefinition = {',
    '  key: AGENT_SESSION_DELETE_OPERATION_KEY,',
    "  successPersistence: 'ephemeral_on_success',",
    '};',
    'export const otherDefinition = {',
    '  key: OTHER_OPERATION_KEY,',
    "  successPersistence: 'ephemeral_on_success',",
    '};',
  ].join('\n');

  withFixture(files, (result) => {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AGENT_SESSION_DELETE_OPERATION_KEY/);
  });
});
