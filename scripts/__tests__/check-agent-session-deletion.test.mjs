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

const REQUIRED_LIFECYCLE_LOCK_ADAPTERS = [
  'apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-conversation-event.transaction.ts',
  'apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-run-authorization.transaction.ts',
  'apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-execution-usage.transaction.ts',
  'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-delegation.transaction.ts',
  'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-approval-continuation.transaction.ts',
  'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-attempt-operation.transaction.ts',
  'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-session-transition.transaction.ts',
  'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-session-artifact-materialization.transaction.ts',
];

function withRequiredLifecycleLocks(files) {
  return {
    ...Object.fromEntries(REQUIRED_LIFECYCLE_LOCK_ADAPTERS.map((relativePath) => [
      relativePath,
      "import { lockWritableAgentSession } from './lock-writable-agent-session';\nlockWritableAgentSession;",
    ])),
    ...files,
  };
}

function writeFixtureFile(rootDir, relativePath, source) {
  const absolutePath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source);
}

function fixture(files) {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'kiditem-agent-session-deletion-'));
  const completeFiles = {
    'prisma/models/agents.prisma': [
      'model AgentExecution {',
      '  sessionId String',
      '  sessionTaskId String',
      '}',
    ].join('\n'),
    ...files,
  };
  for (const [relativePath, source] of Object.entries(completeFiles)) {
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
      'apps/server/src/agent-os/a.ts': "const kind = 'quick_ask';",
    },
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /AgentSessionTombstone/);
      assert.match(result.stderr, /quick_ask/);
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

test('rejects outgoing application-port imports from official incoming operation adapters', () => {
  withFixture(
    withRequiredLifecycleLocks({
      'apps/server/src/agent-os/adapter/in/operation/unsafe.operation-adapter.ts': [
        "import { AGENT_SESSION_DELETION_EXECUTION_TRANSACTION } from '../../../application/port/out/transaction/session-deletion/agent-session-deletion-execution.transaction.port';",
        'AGENT_SESSION_DELETION_EXECUTION_TRANSACTION;',
      ].join('\n'),
    }),
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /incoming operation adapter must not import application\/port\/out/);
    },
  );
});

test('rejects arrow and decorated retention schedulers without relying on callback names', () => {
  withFixture(
    withRequiredLifecycleLocks({
      'apps/server/src/agent-os/delete-arrow.ts': [
        'const RETENTION_INTERVAL = 60_000;',
        'setInterval(async () => { await cleanup(); }, RETENTION_INTERVAL);',
      ].join('\n'),
      'apps/server/src/agent-os/delete-decorator.ts': [
        'const CLEANUP_INTERVAL = 60_000;',
        'class RetentionWorker {',
        '  @Interval(CLEANUP_INTERVAL)',
        '  async cleanup() {}',
        '}',
      ].join('\n'),
    }),
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /second deletion scheduler/);
      assert.equal((result.stderr.match(/second deletion scheduler/g) ?? []).length, 2);
    },
  );
});

test('rejects a deletion interval outside Agent OS', () => {
  withFixture(
    withRequiredLifecycleLocks({
      'apps/server/src/operations/delete-arrow.ts': 'setInterval(() => deleteSession(), 1000);',
    }),
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /second deletion scheduler/);
    },
  );
});

test('permits an ordinary interval outside Agent OS', () => {
  withFixture(
    withRequiredLifecycleLocks({
      'apps/server/src/operations/retry.ts': 'setInterval(refreshMetrics, 1000);',
    }),
    (result) => {
      assert.equal(result.status, 0);
    },
  );
});

test('rejects direct RuntimeCredentialBroker verification as local MCP authority', () => {
  withFixture(
    withRequiredLifecycleLocks({
      'apps/server/src/agent-os/adapter/out/runtime/unsafe-runtime-credential.ts': [
        "import { RuntimeCredentialBroker } from './runtime-credential-broker';",
        "const broker = new RuntimeCredentialBroker({ secret: 'test-secret-at-least-32-characters-long' });",
        "broker.verify('credential');",
      ].join('\n'),
    }),
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /RuntimeCredentialBroker verification is not a local MCP authority/);
    },
  );
});

test('rejects Agent OS application and capability OperationRun repository bypasses', () => {
  withFixture(
    withRequiredLifecycleLocks({
      'apps/server/src/agent-os/application/service/session-bypass.ts': [
        "import { OPERATION_REPOSITORY_PORT } from '../../../operations/application/port/out/repository/operation.repository.port';",
        'async function bypass(repository: { createRun(input: object): Promise<void> }) {',
        '  await repository.createRun({});',
        '}',
        'OPERATION_REPOSITORY_PORT; bypass;',
      ].join('\n'),
      'apps/server/src/agent-os/domain/capability/session-bypass.ts': [
        'export async function bypass(repository: { createRun(input: object): Promise<void> }) {',
        '  await repository.createRun({});',
        '}',
      ].join('\n'),
    }),
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /session-originated OperationRun must use the owned-run transaction port/);
      assert.equal(
        (result.stderr.match(/session-originated OperationRun must use the owned-run transaction port/g) ?? []).length,
        2,
      );
    },
  );
});

test('rejects an ephemeral definition whose deletion key appears only in a comment', () => {
  withFixture(
    withRequiredLifecycleLocks({
      'apps/server/src/agent-os/domain/operation/agent-os.operations.ts': [
        "export const OTHER_OPERATION_KEY = 'agent-os.other';",
        'export const definition = {',
        '  // key: AGENT_SESSION_DELETE_OPERATION_KEY',
        '  key: OTHER_OPERATION_KEY,',
        "  successPersistence: 'ephemeral_on_success',",
        '};',
      ].join('\n'),
    }),
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /AGENT_SESSION_DELETE_OPERATION_KEY/);
    },
  );
});

test('ignores ephemeral string-literal types because only object definitions own persistence', () => {
  withFixture(
    withRequiredLifecycleLocks({
      'apps/server/src/agent-os/domain/operation/agent-os.operations.ts': [
        "export const AGENT_SESSION_DELETE_OPERATION_KEY = 'agent-os.delete-session';",
        'interface DeletionOperationDefinition {',
        '  key: typeof AGENT_SESSION_DELETE_OPERATION_KEY;',
        "  successPersistence: 'ephemeral_on_success';",
        '}',
      ].join('\n'),
    }),
    (result) => {
      assert.equal(result.status, 0);
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

test('rejects an ephemeral definition with a quoted persistence property outside deletion ownership', () => {
  withFixture(
    withRequiredLifecycleLocks({
      'apps/server/src/agent-os/domain/operation/agent-os.operations.ts': [
        "export const OTHER_OPERATION_KEY = 'agent-os.other';",
        'export const definition = {',
        '  key: OTHER_OPERATION_KEY,',
        "  'successPersistence': 'ephemeral_on_success',",
        '};',
      ].join('\n'),
    }),
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /AGENT_SESSION_DELETE_OPERATION_KEY/);
    },
  );
});

test('rejects an ephemeral definition with a computed template persistence property outside deletion ownership', () => {
  withFixture(
    withRequiredLifecycleLocks({
      'apps/server/src/agent-os/domain/operation/agent-os.operations.ts': [
        "export const OTHER_OPERATION_KEY = 'agent-os.other';",
        'export const definition = {',
        '  key: OTHER_OPERATION_KEY,',
        "  [`successPersistence`]: 'ephemeral_on_success',",
        '};',
      ].join('\n'),
    }),
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /AGENT_SESSION_DELETE_OPERATION_KEY/);
    },
  );
});

test('rejects an ephemeral definition with a template literal persistence value outside deletion ownership', () => {
  withFixture(
    withRequiredLifecycleLocks({
      'apps/server/src/agent-os/domain/operation/agent-os.operations.ts': [
        "export const OTHER_OPERATION_KEY = 'agent-os.other';",
        'export const definition = {',
        '  key: OTHER_OPERATION_KEY,',
        '  successPersistence: `ephemeral_on_success`,',
        '};',
      ].join('\n'),
    }),
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /AGENT_SESSION_DELETE_OPERATION_KEY/);
    },
  );
});

test('permits an owned deletion definition with a computed string key property', () => {
  withFixture(
    withRequiredLifecycleLocks({
      'apps/server/src/agent-os/domain/operation/agent-os.operations.ts': [
        "export const AGENT_SESSION_DELETE_OPERATION_KEY = 'agent-os.delete-session';",
        'export const definition = {',
        "  ['key']: AGENT_SESSION_DELETE_OPERATION_KEY,",
        "  successPersistence: 'ephemeral_on_success',",
        '};',
      ].join('\n'),
    }),
    (result) => {
      assert.equal(result.status, 0);
    },
  );
});

test('permits an ordinary nonliteral computed persistence property', () => {
  withFixture(
    withRequiredLifecycleLocks({
      'apps/server/src/agent-os/domain/operation/agent-os.operations.ts': [
        "export const OTHER_OPERATION_KEY = 'agent-os.other';",
        "const persistenceProperty = 'successPersistence';",
        'export const definition = {',
        '  key: OTHER_OPERATION_KEY,',
        "  [persistenceProperty]: 'ephemeral_on_success',",
        '};',
      ].join('\n'),
    }),
    (result) => {
      assert.equal(result.status, 0);
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
    'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-session-artifact-materialization.transaction.ts',
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
    'apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-session-artifact-materialization.transaction.ts',
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
