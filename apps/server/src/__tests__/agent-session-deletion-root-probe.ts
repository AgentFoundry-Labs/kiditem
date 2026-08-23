/**
 * Test-only process-root probe invoked by the bounded deletion verifier.
 * It has no HTTP route or production module alias: each context is one of the
 * real API, worker, or MCP application roots.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { type IEntryNestModule, NestFactory } from '@nestjs/core';
import {
  AgentSessionIdSchema,
  formatAgentSessionName,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';
import { ApiApplicationModule } from '../api-application.module';
import { AgentMcpApplicationModule } from '../agent-mcp-application.module';
import { AgentWorkerApplicationModule } from '../agent-worker-application.module';
import { PrismaService } from '../prisma/prisma.service';
import { OperationRunWorkerService } from '../operations/application/service/operation-run-worker.service';
import { AgentSessionDeletionController } from '../agent-os/adapter/in/http/session-control/agent-session-deletion.controller';
import { AgentSessionDeletionOperationHandler } from '../agent-os/adapter/in/operation/agent-session-deletion.operation-handler';
import { PrismaAgentSessionDeletionCommandTransaction } from '../agent-os/adapter/out/transaction/session-deletion/prisma-agent-session-deletion-command.transaction';
import {
  AGENT_OS_MCP_TOOL_EXECUTION_PORT,
  type AgentOsMcpExecutionContextPort,
  type AgentOsMcpToolExecutionPort,
} from '../agent-os/application/port/in/capability/agent-os-mcp-tool-execution.port';
import { AgentSessionDeletionFinalizerRecoveryService } from '../agent-os/application/service/session-control/agent-session-deletion-finalizer-recovery.service';
import { AgentSessionDeletionRecoveryService } from '../agent-os/application/service/session-control/agent-session-deletion-recovery.service';
import { AGENT_SESSION_DELETE_OPERATION } from '../agent-os/domain/operation/agent-session-deletion.operations';
import type { INestApplicationContext } from '@nestjs/common';
import type { AgentSessionOperationDefinitionSnapshot } from '../agent-os/application/port/out/operation/agent-session-operation-platform.port';

const organizationId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000021';
const deletionDefinition: AgentSessionOperationDefinitionSnapshot = {
  ...AGENT_SESSION_DELETE_OPERATION,
  successPersistence: 'ephemeral_on_success',
};

async function main(): Promise<void> {
  let api: INestApplicationContext | null = null;
  let worker: INestApplicationContext | null = null;
  let mcp: INestApplicationContext | null = null;
  let fencingApi: INestApplicationContext | null = null;
  let recreatedMcp: INestApplicationContext | null = null;
  try {
    api = await open(ApiApplicationModule);
    assertPresent(api, AgentSessionDeletionController, 'API deletion controller');
    assertPresent(api, AgentSessionDeletionOperationHandler, 'API deletion handler');
    assertPresent(api, AgentSessionDeletionFinalizerRecoveryService, 'API deletion finalizer recovery');
    assertPresent(api, AgentSessionDeletionRecoveryService, 'API deletion recovery');
    assertPresent(api, OperationRunWorkerService, 'API Operations worker');

    const executionContext = await seedMcpExecutionContext(api);
    await close(api);
    api = null;

    worker = await open(AgentWorkerApplicationModule);
    assertAbsent(worker, AgentSessionDeletionController, 'worker deletion controller');
    assertAbsent(worker, AgentSessionDeletionOperationHandler, 'worker deletion handler');
    assertAbsent(worker, AgentSessionDeletionFinalizerRecoveryService, 'worker deletion finalizer recovery');
    assertAbsent(worker, AgentSessionDeletionRecoveryService, 'worker deletion recovery');
    assertAbsent(worker, OperationRunWorkerService, 'worker Operations worker');
    await close(worker);
    worker = null;

    mcp = await open(AgentMcpApplicationModule);
    assertAbsent(mcp, AgentSessionDeletionController, 'MCP deletion controller');
    assertAbsent(mcp, AgentSessionDeletionOperationHandler, 'MCP deletion handler');
    assertAbsent(mcp, AgentSessionDeletionFinalizerRecoveryService, 'MCP deletion finalizer recovery');
    assertAbsent(mcp, AgentSessionDeletionRecoveryService, 'MCP deletion recovery');
    assertAbsent(mcp, OperationRunWorkerService, 'MCP Operations worker');
    const mcpExecutor = required<AgentOsMcpToolExecutionPort>(
      mcp,
      AGENT_OS_MCP_TOOL_EXECUTION_PORT,
      'MCP tool executor',
    );
    await mcpExecutor.listAvailableTools(executionContext);
    await close(mcp);
    mcp = null;

    fencingApi = await open(ApiApplicationModule);
    const deletion = required<PrismaAgentSessionDeletionCommandTransaction>(
      fencingApi,
      PrismaAgentSessionDeletionCommandTransaction,
      'API deletion command transaction',
    );
    await deletion.begin({
      signal: new AbortController().signal,
      organizationId,
      actorUserId: userId,
      session: formatAgentSessionName(
        OrganizationIdSchema.parse(organizationId),
        AgentSessionIdSchema.parse(executionContext.sessionId),
      ),
      definition: deletionDefinition,
      parsedInput: {
        session: formatAgentSessionName(
          OrganizationIdSchema.parse(organizationId),
          AgentSessionIdSchema.parse(executionContext.sessionId),
        ),
        retryGeneration: 1,
      },
    });
    await close(fencingApi);
    fencingApi = null;

    recreatedMcp = await open(AgentMcpApplicationModule);
    await rejectStaleContext(
      required<AgentOsMcpToolExecutionPort>(
        recreatedMcp,
        AGENT_OS_MCP_TOOL_EXECUTION_PORT,
        'recreated MCP tool executor',
      ),
      executionContext,
    );
    await close(recreatedMcp);
    recreatedMcp = null;
    console.log('agent-session-deletion-root-probe PASS');
  } finally {
    await Promise.allSettled([
      close(recreatedMcp), close(mcp), close(worker), close(api),
      close(fencingApi),
    ]);
  }
}

async function open(module: IEntryNestModule): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(module, { logger: false });
}

async function close(app: INestApplicationContext | null): Promise<void> {
  if (app) await app.close();
}

function required<T>(app: INestApplicationContext, token: unknown, label: string): T {
  try {
    return app.get(token as never, { strict: false }) as T;
  } catch {
    throw new Error(`missing ${label}`);
  }
}

function assertPresent(app: INestApplicationContext, token: unknown, label: string): void {
  required(app, token, label);
}

function assertAbsent(app: INestApplicationContext, token: unknown, label: string): void {
  try {
    app.get(token as never, { strict: false });
  } catch {
    return;
  }
  throw new Error(`unexpected ${label}`);
}

async function rejectStaleContext(
  executor: AgentOsMcpToolExecutionPort,
  context: AgentOsMcpExecutionContextPort,
): Promise<void> {
  try {
    await executor.listAvailableTools(context);
  } catch (error) {
    if (
      error
      && typeof error === 'object'
      && 'code' in error
      && error.code === 'MCP_EXECUTION_DENIED'
    ) return;
    throw error;
  }
  throw new Error('recreated MCP accepted a pre-fence execution context');
}

async function seedMcpExecutionContext(app: INestApplicationContext) {
  const prisma = required<PrismaService>(app, PrismaService, 'API Prisma service');
  const version = await prisma.agentVersion.findFirst({
    select: { id: true, agentDefinitionKey: true, modelIdentity: true },
    orderBy: { createdAt: 'asc' },
  });
  const authority = await prisma.agentAuthorityProfileVersion.findFirst({
    where: { organizationId },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!version || !authority) throw new Error('seeded AgentOS authority is missing');
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, email: 'deletion-proof-user@test.invalid', name: 'Deletion Proof User', role: 'owner', type: 'human' },
    update: {},
  });
  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    create: { organizationId, userId, role: 'owner', status: 'active' },
    update: { role: 'owner', status: 'active' },
  });
  const sessionId = randomUUID();
  const taskId = randomUUID();
  const executionId = randomUUID();
  const attemptId = randomUUID();
  const startIntentId = randomUUID();
  const policySnapshotId = randomUUID();
  const operationRunId = randomUUID();
  await prisma.agentSession.create({
    data: {
      id: sessionId,
      organizationId,
      createdByUserId: userId,
      copilotThreadId: `deletion-proof-${randomUUID()}`,
      primaryAgentVersionId: version.id,
      authorityProfileVersionId: authority.id,
    },
  });
  await prisma.agentSessionTask.create({
    data: {
      id: taskId,
      organizationId,
      sessionId,
      assignedAgentVersionId: version.id,
      isRoot: true,
      status: 'running',
      idempotencyKey: `deletion-proof-task-${taskId}`,
    },
  });
  await prisma.agentPolicySnapshot.create({
    data: {
      id: policySnapshotId,
      organizationId,
      sessionId,
      agentVersionId: version.id,
      authorityProfileVersionId: authority.id,
      capabilityKeys: [],
      policyHash: 'd'.repeat(64),
    },
  });
  await prisma.agentExecution.create({
    data: {
      id: executionId,
      organizationId,
      sessionId,
      sessionTaskId: taskId,
      copilotThreadId: `deletion-proof-run-${randomUUID()}`,
      aguiRunId: `deletion-proof-agui-${randomUUID()}`,
      agentVersionId: version.id,
      runtimeType: 'codex_cli',
      modelIdentity: version.modelIdentity,
      policySnapshotId,
      inputHash: 'e'.repeat(64),
      status: 'running',
    },
  });
  await prisma.agentExecutionAttempt.create({
    data: {
      id: attemptId,
      organizationId,
      sessionId,
      executionId,
      attemptNumber: 1,
      idempotencyKey: `deletion-proof-attempt-${attemptId}`,
      runtimeType: 'codex_cli',
      runtimeStartIntentId: startIntentId,
      runtimeCredentialGeneration: 0,
      state: 'running',
    },
  });
  await prisma.operationRun.create({
    data: {
      id: operationRunId,
      organizationId,
      operationKey: 'agent-os.mcp-context-proof',
      definitionVersion: 1,
      ownerDomain: 'agent-os',
      title: 'MCP context proof',
      engineType: 'agent_os',
      resourceClass: 'default',
      executionTimeoutMs: 60_000,
      status: 'running',
      triggerSource: 'agent',
      requestedByUserId: userId,
      input: {},
      maxAttempts: 1,
    },
  });
  await prisma.agentSessionOperationRunOwnership.create({
    data: { organizationId, sessionId, operationRunId },
  });
  await prisma.agentExecutionAttemptOperationBinding.create({
    data: {
      organizationId,
      sessionId,
      executionId,
      executionAttemptId: attemptId,
      operationRunId,
      continuationKey: `initial:${operationRunId}`,
    },
  });
  return {
    organizationId,
    sessionId,
    executionId,
    attemptId,
    startIntentId,
    runtimeCredentialGeneration: 0,
  };
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
