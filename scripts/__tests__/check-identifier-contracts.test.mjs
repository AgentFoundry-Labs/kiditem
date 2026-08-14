import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkIdentifierContracts } from '../check-identifier-contracts.mjs';

function writeText(rootDir, relativePath, source) {
  const absolutePath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source);
}

function createFixture() {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'kiditem-identifier-contracts-'));
  writeText(rootDir, 'packages/shared/src/identifiers/index.ts', [
    'export const AgentSessionNameSchema = z.string();',
    'export const AgentSessionTaskNameSchema = z.string();',
    'export const AgentExecutionNameSchema = z.string();',
  ].join('\n'));
  writeText(rootDir, 'packages/shared/src/agent-interaction/index.ts', 'export const Ready = true;\n');
  writeText(rootDir, 'apps/server/src/agent-os/domain/operation/operation.ts', [
    'export const Input = z.object({',
    '  session: AgentSessionNameSchema,',
    '  task: AgentSessionTaskNameSchema,',
    '  execution: AgentExecutionNameSchema,',
    '});',
  ].join('\n'));
  writeText(rootDir, 'apps/server/src/operations/handler.ts', 'export const handler = true;\n');
  writeText(rootDir, 'prisma/models/agents.prisma', [
    'model AgentSession {',
    '  id String @id',
    '}',
    'model AgentSessionTask {',
    '  id String @id',
    '}',
    'model AgentExecution {',
    '  id String @id',
    '}',
    'model AgentConversationEvent {',
    '  id String @id',
    '}',
  ].join('\n'));
  return rootDir;
}

function expectViolation(relativePath, source, pattern) {
  const rootDir = createFixture();
  try {
    writeText(rootDir, relativePath, source);
    assert.throws(
      () => checkIdentifierContracts(rootDir),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /identifier contract violations/i);
        assert.match(error.message, pattern);
        assert.ok(error.message.includes(relativePath));
        return true;
      },
    );
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

test('rejects raw storage IDs and identifier conflation in public contracts', () => {
  expectViolation(
    'apps/server/src/agent-os/domain/operation/operation.ts',
    'export const Input = z.object({ sessionId: z.string().uuid() });',
    /raw storage identifier sessionId/i,
  );
  expectViolation(
    'packages/shared/src/identifiers/index.ts',
    'export type Id = string;',
    /generic exported Id alias/i,
  );
  expectViolation(
    'packages/shared/src/agent-interaction/index.ts',
    'const session = unsafeValue as AgentSessionName;',
    /unchecked resource-name cast/i,
  );
  expectViolation(
    'apps/server/src/agent-os/domain/operation/operation.ts',
    'const command = { idempotencyKey: input.requestId };',
    /request ID reused as idempotency/i,
  );
});

test('rejects non-sequence conversation ordering, duplicate names, and Operations registry imports', () => {
  expectViolation(
    'apps/server/src/agent-os/adapter/out/repository/prisma-agent-interaction.repository.ts',
    'events.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());',
    /timestamp sorting.*conversation order/i,
  );
  expectViolation(
    'prisma/models/agents.prisma', [
      'model AgentSession {',
      '  id String @id',
      '  name String',
      '}',
    ].join('\n'),
    /redundant persisted resource name/i,
  );
  expectViolation(
    'apps/server/src/operations/handler.ts',
    "import { AgentCapabilityRegistry } from '../agent-os/application/service/agent-capability-registry.service';",
    /Operations handler imports AgentCapabilityRegistry/i,
  );
});

test('allows owner-private IDs, external protocol IDs, and canonical public names', () => {
  const rootDir = createFixture();
  try {
    writeText(rootDir, 'apps/server/src/agent-os/application/port/out/repository/private.ts', [
      'export interface PrivateRecord {',
      '  sessionId: string;',
      '  executionId: string;',
      '}',
    ].join('\n'));
    writeText(rootDir, 'packages/shared/src/agent-interaction/index.ts', [
      'export const Wire = z.object({',
      '  copilotThreadId: z.string(),',
      '  aguiRunId: z.string(),',
      '  session: AgentSessionNameSchema,',
      '  execution: AgentExecutionNameSchema,',
      '});',
    ].join('\n'));
    assert.doesNotThrow(() => checkIdentifierContracts(rootDir));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
