import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  AgentExecutionAttemptIdSchema,
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  OperationRunIdSchema,
  OrganizationIdSchema,
  formatAgentExecutionAttemptName,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  formatOperationRunName,
} from '@kiditem/shared/identifiers';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { OperationCheckpointRepositoryAdapter } from '../../operations/adapter/out/repository/operation-checkpoint.repository.adapter';
import { OperationRepositoryAdapter } from '../../operations/adapter/out/repository/operation.repository.adapter';
import { CompositeOperationCoordinatorService } from '../../operations/application/service/composite-operation-coordinator.service';
import { OperationDispatcherService } from '../../operations/application/service/operation-dispatcher.service';
import { OperationHandlerRegistryService } from '../../operations/application/service/operation-handler-registry.service';
import { OperationRunService } from '../../operations/application/service/operation-run.service';
import { OperationRunWorkerService } from '../../operations/application/service/operation-run-worker.service';
import { AgentSessionTaskOperationHandler } from '../adapter/in/operation/agent-session-task.operation-handler';
import { InProcessAgentConversationLivePublisher } from '../adapter/out/event/in-process-agent-conversation-live-publisher.adapter';
import { PrismaAgentInteractionRepository } from '../adapter/out/repository/prisma-agent-interaction.repository';
import { PrismaAgentSessionControlRepository } from '../adapter/out/repository/prisma-agent-session-control.repository';
import { AgentSessionApprovalService } from '../application/service/agent-session-approval.service';
import { AgentSessionCapabilityInvocationService } from '../application/service/agent-session-capability-invocation.service';
import { AgentCapabilityRegistry } from '../application/service/agent-capability-registry.service';
import { AgentSessionRuntimeControlService } from '../application/service/agent-session-runtime-control.service';
import { AgentSessionTaskOperationInputSchema } from '../domain/operation/agent-os.operations';

const VERSION_ID = '50000000-0000-4000-8000-000000000001';
const AUTHORITY_PROFILE_ID = 'foundation_read_only_probe:v1';
const APPROVAL_CAPABILITY = 'inventory.adjust';
const RECOVERY_CAPABILITY = 'inventory.readForRecovery';

let prisma: PrismaClient | null = null;

beforeAll(async () => {
  prisma = makeTestPrisma();
  await prisma.$connect();
});

afterAll(async () => prisma?.$disconnect());

beforeEach(async () => {
  if (!prisma) throw new Error('Prisma test client was not initialized');
  await resetDb(prisma);
  await seedBaseFixture(prisma);
});

describe('official durable runtime recovery', () => {
  it('correlates opaque transport IDs with canonical resource names and rejects them as operation input', async () => {
    const graph = await createRunningGraph();
    const operation = await createOperation(graph);
    const controls = new PrismaAgentSessionControlRepository(prisma as never);
    const attempt = await controls.startAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: graph.sessionId,
      executionId: graph.executionId,
      runtimeType: 'hermes_http',
      operationRunId: operation.runId,
      idempotencyKey: `operation:${operation.runId}`,
    });
    const organization = OrganizationIdSchema.parse(TEST_ORGANIZATION_ID);
    const session = formatAgentSessionName(
      organization,
      AgentSessionIdSchema.parse(graph.sessionId),
    );
    const task = formatAgentSessionTaskName(
      organization,
      AgentSessionIdSchema.parse(graph.sessionId),
      AgentSessionTaskIdSchema.parse(graph.taskId),
    );
    const execution = formatAgentExecutionName(
      organization,
      AgentSessionIdSchema.parse(graph.sessionId),
      AgentExecutionIdSchema.parse(graph.executionId),
    );

    expect(operation.input).toEqual({ session, task, execution });
    expect(formatAgentExecutionAttemptName(
      organization,
      AgentSessionIdSchema.parse(graph.sessionId),
      AgentExecutionIdSchema.parse(graph.executionId),
      AgentExecutionAttemptIdSchema.parse(attempt.id),
    )).toContain(`/attempts/${attempt.id}`);
    expect(formatOperationRunName(
      organization,
      OperationRunIdSchema.parse(operation.runId),
    )).toContain(`/operations/${operation.runId}`);
    const canonicalInput = { session, task, execution };
    expect(AgentSessionTaskOperationInputSchema.safeParse(canonicalInput).success).toBe(true);
    for (const [field, opaque] of [
      ['session', graph.threadId],
      ['task', graph.taskId],
      ['execution', graph.executionId],
    ] as const) {
      expect(AgentSessionTaskOperationInputSchema.safeParse({
        ...canonicalInput,
        [field]: opaque,
      }).success).toBe(false);
    }
    for (const [field, opaque] of [
      ['requestId', 'approval-request-id'],
      ['encryptedHandleRef', 'vault://opaque-handle-1'],
      ['aguiRunId', graph.aguiRunId],
    ] as const) {
      expect(AgentSessionTaskOperationInputSchema.safeParse({
        ...canonicalInput,
        [field]: opaque,
      }).success).toBe(false);
    }
  });

  it('reuses one persisted opaque handle after a handler restart and terminalizes once', async () => {
    const graph = await createRunningGraph();
    const operation = await createOperation(graph);
    const checkpoints = new OperationCheckpointRepositoryAdapter(prisma as never);
    const controls = new PrismaAgentSessionControlRepository(prisma as never);
    const backend = new DurableFakeRuntimeBackend(graph, 'crash');
    const first = makeWorker({
      graph,
      operation,
      controls,
      checkpoints,
      backend,
    });

    await first.worker.tick();
    expect(first.runtime.start).toHaveBeenCalledTimes(1);
    expect(await prisma!.agentConversationEvent.count({
      where: { organizationId: TEST_ORGANIZATION_ID, executionId: graph.executionId },
    })).toBe(4);
    expect(await prisma!.operationRun.findUniqueOrThrow({ where: { id: operation.runId } })).toMatchObject({
      status: 'queued',
    });
    expect((await checkpoints.findLatest({
      organizationId: TEST_ORGANIZATION_ID,
      operationRunId: operation.runId,
    }))?.kind).toBe('runtime_handle_persisted');

    const recovered = makeWorker({
      graph,
      operation,
      controls,
      checkpoints,
      backend,
    });

    await recovered.worker.tick();

    expect(recovered.runtime).not.toBe(first.runtime);
    expect(recovered.runtime.start).not.toHaveBeenCalled();
    expect(recovered.runtime.inspect).toHaveBeenCalledTimes(1);
    expect(recovered.runtime.connect).toHaveBeenCalledTimes(1);
    expect(await prisma!.agentConversationEvent.count({
      where: { organizationId: TEST_ORGANIZATION_ID, executionId: graph.executionId },
    })).toBe(5);
    const [attempt, task, terminal, operationRun] = await Promise.all([
      prisma!.agentExecutionAttempt.findFirstOrThrow({
        where: { executionId: graph.executionId, operationRunId: operation.runId },
      }),
      prisma!.agentSessionTask.findUniqueOrThrow({ where: { id: graph.taskId } }),
      checkpoints.findLatest({ organizationId: TEST_ORGANIZATION_ID, operationRunId: operation.runId }),
      prisma!.operationRun.findUniqueOrThrow({ where: { id: operation.runId } }),
    ]);
    expect(attempt).toMatchObject({
      state: 'succeeded',
      externalRunId: 'external-durable-run-1',
      encryptedHandleRef: 'vault://opaque-handle-1',
    });
    expect(task.status).toBe('completed');
    expect(terminal).toMatchObject({ kind: 'terminal' });
    expect(operationRun).toMatchObject({ status: 'succeeded' });
  });

  it('persists an approval before worker recreation, resumes the same handle, and completes once', async () => {
    const graph = await createRunningGraph([APPROVAL_CAPABILITY, RECOVERY_CAPABILITY]);
    const operation = await createOperation(graph);
    const checkpoints = new OperationCheckpointRepositoryAdapter(prisma as never);
    const controls = new PrismaAgentSessionControlRepository(prisma as never);
    const invocation = recoveryCapabilityInvocation(controls);
    const backend = new DurableFakeRuntimeBackend(
      graph,
      'approval',
      async () => {
        const organization = OrganizationIdSchema.parse(TEST_ORGANIZATION_ID);
        await invocation.service.invoke({
          session: formatAgentSessionName(
            organization,
            AgentSessionIdSchema.parse(graph.sessionId),
          ),
          task: formatAgentSessionTaskName(
            organization,
            AgentSessionIdSchema.parse(graph.sessionId),
            AgentSessionTaskIdSchema.parse(graph.taskId),
          ),
          execution: formatAgentExecutionName(
            organization,
            AgentSessionIdSchema.parse(graph.sessionId),
            AgentExecutionIdSchema.parse(graph.executionId),
          ),
          capabilityKey: RECOVERY_CAPABILITY,
          input: { reason: 'approval_recovery' },
        });
      },
    );
    const first = makeWorker({
      graph,
      operation,
      controls,
      checkpoints,
      backend,
    });

    await first.worker.tick();
    const [approval, attempt] = await Promise.all([
      prisma!.agentSessionApproval.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, executionId: graph.executionId },
      }),
      prisma!.agentExecutionAttempt.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, executionId: graph.executionId },
      }),
    ]);
    expect(approval.state).toBe('pending');
    expect(await prisma!.agentConversationEvent.count({
      where: { organizationId: TEST_ORGANIZATION_ID, executionId: graph.executionId },
    })).toBe(3);

    const organization = OrganizationIdSchema.parse(TEST_ORGANIZATION_ID);
    const session = formatAgentSessionName(
      organization,
      AgentSessionIdSchema.parse(graph.sessionId),
    );
    await expect(first.approvals.decide({
      organizationId: TEST_ORGANIZATION_ID,
      session,
      approvalId: approval.id,
      actorId: TEST_USER_ID,
      decision: 'approved',
      idempotencyKey: 'approval:recovery:approved',
    })).resolves.toEqual({ state: 'approved' });
    expect(first.runtime.interrupt).toHaveBeenCalledTimes(1);
    expect(invocation.execute).toHaveBeenCalledTimes(1);
    expect(await prisma!.operationRun.findUniqueOrThrow({ where: { id: operation.runId } })).toMatchObject({
      status: 'queued',
    });

    const resumed = makeWorker({
      graph,
      operation,
      controls,
      checkpoints,
      backend,
    });
    await resumed.worker.tick();
    expect(resumed.runtime).not.toBe(first.runtime);
    expect(resumed.runtime.start).not.toHaveBeenCalled();
    expect(resumed.runtime.inspect).toHaveBeenCalledTimes(1);
    expect(resumed.runtime.connect).toHaveBeenCalledTimes(1);
    expect(await prisma!.agentSessionApproval.findUniqueOrThrow({
      where: { id: approval.id },
    })).toMatchObject({ state: 'approved' });
    expect(await prisma!.agentExecutionAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    })).toMatchObject({ state: 'succeeded', externalRunId: 'external-durable-run-1' });
    expect(await prisma!.operationRun.findUniqueOrThrow({ where: { id: operation.runId } })).toMatchObject({
      status: 'succeeded',
    });
    expect(invocation.execute).toHaveBeenCalledTimes(1);
  });

  it('fails a detached attempt with an unknown handle without starting a replacement run', async () => {
    const graph = await createRunningGraph();
    const operation = await createOperation(graph);
    const checkpoints = new OperationCheckpointRepositoryAdapter(prisma as never);
    const controls = new PrismaAgentSessionControlRepository(prisma as never);
    const runtime = runtimeFor(new DurableFakeRuntimeBackend(graph, 'unknown'));
    const attempt = await controls.startAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: graph.sessionId,
      executionId: graph.executionId,
      runtimeType: 'hermes_http',
      operationRunId: operation.runId,
      idempotencyKey: `operation:${operation.runId}`,
    });
    await controls.persistAttemptHandle({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: graph.sessionId,
      executionId: graph.executionId,
      attemptId: attempt.id,
      runtimeType: 'hermes_http',
      externalRunId: 'external-durable-run-1',
      encryptedHandleRef: 'vault://opaque-handle-1',
      runtimeGeneration: 1,
    });
    await checkpoints.append({
      organizationId: TEST_ORGANIZATION_ID,
      operationRunId: operation.runId,
      kind: 'runtime_handle_persisted',
      state: {
        runtimeHandle: {
          runtimeType: 'hermes_http',
          executionId: graph.executionId,
          attemptId: attempt.id,
          externalRunId: 'external-durable-run-1',
          encryptedHandleRef: 'vault://opaque-handle-1',
          generation: 1,
        },
      },
    });

    const recovered = makeHandler({ graph, operation, controls, checkpoints, runtime, records: [] });
    await expect(recovered.handler.execute(operation)).resolves.toMatchObject({
      kind: 'failed',
      code: 'AGENT_RUNTIME_HANDLE_LOST',
    });
    expect(runtime.start).not.toHaveBeenCalled();
    expect(runtime.connect).not.toHaveBeenCalled();
    expect(runtime.inspect).toHaveBeenCalledTimes(1);
    expect(await prisma!.agentExecutionAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    })).toMatchObject({ state: 'failed', errorCode: 'AGENT_RUNTIME_HANDLE_LOST' });
  });

  it('makes repeated detached cancellation idempotent without a second external cancel', async () => {
    const graph = await createRunningGraph();
    const operation = await createOperation(graph);
    const checkpoints = new OperationCheckpointRepositoryAdapter(prisma as never);
    const controls = new PrismaAgentSessionControlRepository(prisma as never);
    const runtime = runtimeFor(new DurableFakeRuntimeBackend(graph, 'complete'));
    const attempt = await controls.startAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: graph.sessionId,
      executionId: graph.executionId,
      runtimeType: 'hermes_http',
      operationRunId: operation.runId,
      idempotencyKey: `operation:${operation.runId}`,
    });
    await controls.persistAttemptHandle({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: graph.sessionId,
      executionId: graph.executionId,
      attemptId: attempt.id,
      runtimeType: 'hermes_http',
      externalRunId: 'external-durable-run-1',
      encryptedHandleRef: 'vault://opaque-handle-1',
      runtimeGeneration: 1,
    });
    await checkpoints.append({
      organizationId: TEST_ORGANIZATION_ID,
      operationRunId: operation.runId,
      kind: 'runtime_handle_persisted',
      state: {
        runtimeHandle: {
          runtimeType: 'hermes_http',
          executionId: graph.executionId,
          attemptId: attempt.id,
          externalRunId: 'external-durable-run-1',
          encryptedHandleRef: 'vault://opaque-handle-1',
          generation: 1,
        },
      },
    });
    const handler = makeHandler({
      graph,
      operation,
      controls,
      checkpoints,
      runtime,
      records: [],
      operations: {
        heartbeatRun: vi.fn().mockResolvedValue(true),
        findRunById: vi.fn(async () => operation),
      },
    });
    const cancellation = {
      organizationId: TEST_ORGANIZATION_ID,
      runId: operation.runId,
      requestedByUserId: TEST_USER_ID,
      reason: 'user_cancelled',
    };

    await handler.handler.cancel(cancellation);
    await handler.handler.cancel(cancellation);

    expect(runtime.start).not.toHaveBeenCalled();
    expect(runtime.cancel).toHaveBeenCalledTimes(1);
    expect(await prisma!.agentExecutionAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    })).toMatchObject({ state: 'cancelled' });
    expect(await prisma!.agentExecution.findUniqueOrThrow({
      where: { id: graph.executionId },
    })).toMatchObject({ status: 'cancelled' });
  });
});

function makeHandler(input: {
  graph: DurableGraph;
  operation: Record<string, unknown>;
  controls: PrismaAgentSessionControlRepository;
  checkpoints: OperationCheckpointRepositoryAdapter;
  runtime: ReturnType<typeof runtimeFor>;
  records: Array<Record<string, unknown>>;
  runtimeControl?: AgentSessionRuntimeControlService;
  approvals?: AgentSessionApprovalService;
  operations?: Record<string, unknown>;
  registry?: OperationHandlerRegistryService;
}) {
  const contextBuilder = {
    build: vi.fn(async ({ attemptId }: { attemptId: string }) => ({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: input.graph.sessionId,
      sessionTaskId: input.graph.taskId,
      executionId: input.graph.executionId,
      attemptId,
      runtimeType: 'hermes_http',
    })),
  };
  const executions = {
    loadExecutionRuntimeContext: vi.fn(async () => ({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: input.graph.sessionId,
      sessionTaskId: input.graph.taskId,
      executionId: input.graph.executionId,
      runtimeType: 'hermes_http',
    })),
    findCurrentExecution: vi.fn(async () => {
      const row = await prisma!.agentExecution.findUnique({
        where: { id: input.graph.executionId },
        select: { status: true },
      });
      return row;
    }),
    markExecutionTerminal: vi.fn(async (terminal: { status: string; errorCode: string | null }) => {
      await prisma!.agentExecution.update({
        where: { id: input.graph.executionId },
        data: {
          status: terminal.status,
          finishedAt: new Date(),
          errorCode: terminal.errorCode,
        },
      });
    }),
  };
  const runtimeControl = input.runtimeControl ?? {
    record: vi.fn(async (event: { event: Record<string, unknown> }) => {
      input.records.push(event.event);
      return { event: { id: `event-${input.records.length}`, sequence: BigInt(input.records.length) }, pointer: {} };
    }),
    publish: vi.fn(),
  };
  const approvals = input.approvals ?? { request: vi.fn() };
  const operations = input.operations ?? { heartbeatRun: vi.fn().mockResolvedValue(true) };
  const handler = new AgentSessionTaskOperationHandler(
    input.registry ?? { register: vi.fn() } as never,
    contextBuilder as never,
    { requireCompatible: vi.fn(() => input.runtime) } as never,
    input.checkpoints as never,
    input.controls as never,
    runtimeControl as never,
    approvals as never,
    executions as never,
    operations as never,
  );
  return { handler, executions, runtimeControl, approvals, operations };
}

function makeWorker(input: {
  graph: DurableGraph;
  operation: Record<string, unknown>;
  controls: PrismaAgentSessionControlRepository;
  checkpoints: OperationCheckpointRepositoryAdapter;
  backend: DurableFakeRuntimeBackend;
}) {
  const runtime = runtimeFor(input.backend);
  const repository = new OperationRepositoryAdapter(prisma as never);
  const registry = new OperationHandlerRegistryService();
  const coordinator = new CompositeOperationCoordinatorService(registry, repository);
  const operations = new OperationRunService(registry, repository, coordinator);
  const runtimeControl = new AgentSessionRuntimeControlService(
    new PrismaAgentInteractionRepository(prisma as never),
    new InProcessAgentConversationLivePublisher(),
    () => new Date(),
  );
  const approvals = new AgentSessionApprovalService(
    input.controls,
    runtimeControl,
    { areCurrent: vi.fn().mockResolvedValue(true) } as never,
    { requireCompatible: vi.fn(() => runtime) } as never,
    operations,
    () => new Date(),
  );
  const handler = makeHandler({
    ...input,
    runtime,
    records: [],
    runtimeControl,
    approvals,
    operations: repository,
    registry,
  });
  handler.handler.onModuleInit();
  const dispatcher = new OperationDispatcherService(registry, repository, coordinator);
  return {
    worker: new OperationRunWorkerService(dispatcher, repository, coordinator),
    runtime,
    approvals,
  };
}

function recoveryCapabilityInvocation(
  controls: PrismaAgentSessionControlRepository,
) {
  const execute = vi.fn(async () => ({ outputSummary: { recovered: true } }));
  const capabilities = new AgentCapabilityRegistry();
  capabilities.register({
    key: RECOVERY_CAPABILITY,
    ownerDomain: 'inventory',
    executionKind: 'tool',
    inputSchema: z.object({ reason: z.literal('approval_recovery') }).strict(),
    outputSchema: z.object({ recovered: z.literal(true) }).strict(),
    sideEffects: ['read'],
    approvalRisk: 'none',
    idempotencyKey: () => null,
    execute,
  });
  return {
    execute,
    service: new AgentSessionCapabilityInvocationService(
      new PrismaAgentInteractionRepository(prisma as never),
      controls,
      capabilities,
    ),
  };
}

function runtimeFor(
  backend: DurableFakeRuntimeBackend,
) {
  return {
    runtimeType: 'hermes_http',
    capabilities: { detached: true, reconnect: true, interrupt: true, cancel: true, inspect: true },
    start: vi.fn((context: { attemptId: string }) => backend.start(context.attemptId)),
    inspect: vi.fn(() => backend.inspect()),
    connect: vi.fn(() => backend.connect()),
    interrupt: vi.fn((_handle, input) => backend.interrupt(input)),
    cancel: vi.fn(() => backend.cancel()),
  };
}

class DurableFakeRuntimeBackend {
  private crashed = false;
  private approved = false;
  private cancelled = false;

  constructor(
    private readonly graph: DurableGraph,
    private readonly mode: 'crash' | 'complete' | 'approval' | 'unknown',
    private readonly onApprovalResolved?: () => Promise<void>,
  ) {}

  async start(attemptId: string) {
    return this.handle(attemptId);
  }

  async inspect() {
    if (this.mode === 'unknown') return { status: 'unknown' as const };
    if (this.cancelled) return { status: 'cancelled' as const };
    return { status: 'running' as const };
  }

  async *connect() {
    if (this.mode === 'crash' && !this.crashed) {
      this.crashed = true;
      yield { kind: 'progress' as const, progress: 0.1, label: 'checkpoint 1' };
      yield { kind: 'progress' as const, progress: 0.5, label: 'checkpoint 2' };
      yield { kind: 'progress' as const, progress: 0.9, label: 'checkpoint 3' };
      throw new Error('simulated worker interruption');
    }
    if (this.mode === 'approval' && !this.approved) {
      yield {
        kind: 'interrupt' as const,
        interruptId: 'approval-recovery',
        payload: {
          capabilityKey: APPROVAL_CAPABILITY,
          arguments: { adjustment: 1 },
          summary: '재고 조정을 승인해야 합니다.',
          resourceVersions: [],
          expiresAt: '2099-08-14T00:00:00.000Z',
        },
      };
      return;
    }
    yield {
      kind: 'terminal' as const,
      status: this.cancelled ? 'cancelled' as const : 'completed' as const,
      output: { ok: true },
    };
  }

  async interrupt(): Promise<void> {
    if (this.approved) return;
    this.approved = true;
    await this.onApprovalResolved?.();
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
  }

  private handle(attemptId: string) {
    return {
      runtimeType: 'hermes_http',
      executionId: this.graph.executionId,
      attemptId,
      externalRunId: 'external-durable-run-1',
      encryptedHandleRef: 'vault://opaque-handle-1',
      generation: 1,
    };
  }
}

interface DurableGraph {
  sessionId: string;
  taskId: string;
  executionId: string;
  threadId: string;
  aguiRunId: string;
}

async function createRunningGraph(
  capabilityKeys: string[] = [],
): Promise<DurableGraph> {
  const assets = {
    prompt: { path: 'agent-config/prompts/agents/manager.md', sha256: 'a'.repeat(64) },
    summaryPrompt: { path: 'agent-config/prompts/system/session-summary.md', sha256: 'b'.repeat(64) },
    skills: [],
    outputSchema: null,
  };
  await prisma!.agentVersion.create({
    data: {
      id: VERSION_ID,
      agentDefinitionKey: 'operator',
      version: 1,
      displayName: 'Operator',
      description: 'Operator',
      runtimeType: 'hermes_http',
      modelIdentity: 'gpt-test',
      capabilityKeys,
      policyDocument: {},
      manifestHash: 'a'.repeat(64),
      runtimeManifest: {
        schemaVersion: 1,
        agentDefinitionKey: 'operator',
        runtimeKind: 'coordinator',
        runtimeType: 'hermes_http',
        modelIdentity: 'gpt-test',
        capabilityKeys,
        policyDocument: {},
        delegation: { role: 'leaf', allowedAgentDefinitionKeys: [], maxDepth: 0, maxChildrenPerTask: 0 },
        limits: { maxTurns: 20, maxContextTokens: 8_192, summaryTargetTokens: 512 },
        assets,
      },
      activatedAt: new Date(),
    },
  });
  await prisma!.agentAuthorityProfileVersion.create({
    data: {
      id: AUTHORITY_PROFILE_ID,
      organizationId: TEST_ORGANIZATION_ID,
      profileKey: 'foundation_read_only_probe',
      version: 1,
      capabilityKeys,
      policyDocument: {},
      policyHash: 'b'.repeat(64),
    },
  });
  const session = await prisma!.agentSession.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      createdByUserId: TEST_USER_ID,
      copilotThreadId: crypto.randomUUID(),
      primaryAgentVersionId: VERSION_ID,
      authorityProfileVersionId: AUTHORITY_PROFILE_ID,
      lifecycle: 'active',
    },
  });
  const task = await prisma!.agentSessionTask.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      assignedAgentVersionId: VERSION_ID,
      isRoot: true,
      status: 'running',
      idempotencyKey: 'recovery-root',
    },
  });
  const policy = await prisma!.agentPolicySnapshot.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      agentVersionId: VERSION_ID,
      authorityProfileVersionId: AUTHORITY_PROFILE_ID,
      capabilityKeys,
      policyHash: 'c'.repeat(64),
    },
  });
  const currentInput = {
    userEvent: {
      externalEventId: 'user-event:recovery',
      schemaVersion: 1,
      payload: { phase: 'complete', messageId: 'message-recovery', content: 'recover' },
    },
  };
  const execution = await prisma!.agentExecution.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      sessionTaskId: task.id,
      copilotThreadId: session.copilotThreadId,
      aguiRunId: 'run-recovery',
      agentVersionId: VERSION_ID,
      runtimeType: 'hermes_http',
      modelIdentity: 'gpt-test',
      policySnapshotId: policy.id,
      inputHash: createHash('sha256').update(JSON.stringify(currentInput)).digest('hex'),
      currentInput,
      resourceRefs: [],
      status: 'running',
    },
  });
  await prisma!.agentConversationEvent.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      executionId: execution.id,
      externalEventId: currentInput.userEvent.externalEventId,
      sequence: 1n,
      eventType: 'user_message',
      schemaVersion: currentInput.userEvent.schemaVersion,
      payload: currentInput.userEvent.payload,
    },
  });
  await prisma!.agentSession.update({
    where: { id: session.id },
    data: { lastEventSequence: 1n },
  });
  return {
    sessionId: session.id,
    taskId: task.id,
    executionId: execution.id,
    threadId: session.copilotThreadId,
    aguiRunId: execution.aguiRunId,
  };
}

async function createOperation(graph: DurableGraph) {
  const organization = OrganizationIdSchema.parse(TEST_ORGANIZATION_ID);
  const session = formatAgentSessionName(organization, AgentSessionIdSchema.parse(graph.sessionId));
  const task = formatAgentSessionTaskName(
    organization,
    AgentSessionIdSchema.parse(graph.sessionId),
    AgentSessionTaskIdSchema.parse(graph.taskId),
  );
  const execution = formatAgentExecutionName(
    organization,
    AgentSessionIdSchema.parse(graph.sessionId),
    AgentExecutionIdSchema.parse(graph.executionId),
  );
  const row = await prisma!.operationRun.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      operationKey: 'agent-os.execute-session-task',
      definitionVersion: 1,
      ownerDomain: 'agent-os',
      title: 'Durable recovery',
      engineType: 'agent-os',
      triggerSource: 'agent',
      input: { session, task, execution },
    },
  });
  return {
    runId: row.id,
    organizationId: TEST_ORGANIZATION_ID,
    operationKey: row.operationKey,
    input: { session, task, execution },
    requestedByUserId: null,
    scheduleId: null,
    parentRunId: null,
    attemptToken: 'durable-recovery-token',
  };
}
