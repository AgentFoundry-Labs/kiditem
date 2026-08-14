import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import {
  parseAgentExecutionName,
  parseAgentSessionName,
  parseAgentSessionTaskName,
} from '@kiditem/shared/identifiers';
import type {
  OperationCancelContext,
  OperationHandler,
  OperationHandlerContext,
  OperationHandlerResult,
} from '../../../../common/operation-definition';
import {
  OPERATION_CHECKPOINT_REPOSITORY_PORT,
  type OperationCheckpointRepositoryPort,
} from '../../../../operations/application/port/out/repository/operation-checkpoint.repository.port';
import {
  OPERATION_REPOSITORY_PORT,
  type OperationRunRepositoryPort,
} from '../../../../operations/application/port/out/repository/operation.repository.port';
import { resolveOperationRunLeaseMs } from '../../../../operations/application/service/operation-runtime.config';
import {
  OPERATION_HANDLER_REGISTRY_PORT,
  type OperationHandlerRegistryPort,
} from '../../../../operations/application/port/in/operation-handler-registry.port';
import {
  AGENT_INTERACTION_REPOSITORY,
  type AgentInteractionRepositoryPort,
} from '../../../application/port/out/repository/agent-interaction-repository.port';
import {
  AGENT_SESSION_CONTROL_REPOSITORY,
  type AgentSessionControlRepositoryPort,
} from '../../../application/port/out/repository/agent-session-control.repository.port';
import type {
  AgentDurableRuntimeAdapter,
  NormalizedRuntimeEvent,
  RuntimeHandle,
} from '../../../application/port/out/runtime/agent-durable-runtime.port';
import { AgentExecutionContextBuilder } from '../../../application/service/agent-execution-context-builder.service';
import { AgentRuntimeAdapterRegistry } from '../../../application/service/agent-runtime-adapter.registry';
import {
  AGENT_OS_OPERATIONS,
  AgentSessionTaskOperationInputSchema,
} from '../../../domain/operation/agent-os.operations';

const durableRequirements = {
  detached: true,
  reconnect: true,
  interrupt: true,
  cancel: true,
  inspect: true,
} as const;

const RuntimeHandleSchema = z
  .object({
    runtimeType: z.string().min(1).max(128),
    executionId: z.string().min(1).max(128),
    attemptId: z.string().min(1).max(128),
    externalRunId: z.string().min(1).max(512),
    encryptedHandleRef: z.string().min(1).max(2_048),
    generation: z.number().int().nonnegative(),
  })
  .strict();
const TerminalCheckpointStateSchema = z
  .object({
    runtimeHandle: RuntimeHandleSchema,
    status: z.enum(['completed', 'failed', 'cancelled']),
    errorCode: z.string().min(1).max(256).nullable(),
  })
  .strict();

interface SessionTaskOperationInput {
  readonly organizationId: string;
  readonly sessionId: string;
  readonly taskId: string;
  readonly executionId: string;
}

@Injectable()
export class AgentSessionTaskOperationHandler
  implements OperationHandler, OnModuleInit
{
  private readonly leaseMs = resolveOperationRunLeaseMs();

  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly operationRegistry: OperationHandlerRegistryPort,
    private readonly contextBuilder: AgentExecutionContextBuilder,
    private readonly runtimes: AgentRuntimeAdapterRegistry,
    @Inject(OPERATION_CHECKPOINT_REPOSITORY_PORT)
    private readonly checkpoints: OperationCheckpointRepositoryPort,
    @Inject(AGENT_SESSION_CONTROL_REPOSITORY)
    private readonly controls: AgentSessionControlRepositoryPort,
    @Inject(AGENT_INTERACTION_REPOSITORY)
    private readonly executions: AgentInteractionRepositoryPort,
    @Inject(OPERATION_REPOSITORY_PORT)
    private readonly operations: OperationRunRepositoryPort,
  ) {}

  onModuleInit(): void {
    this.operationRegistry.register(AGENT_OS_OPERATIONS[0], this);
  }

  async execute(
    operation: OperationHandlerContext,
  ): Promise<OperationHandlerResult> {
    const input = parseOperationInput(operation.input);
    const execution = await this.executions.loadExecutionRuntimeContext({
      executionId: input.executionId,
    });
    if (
      !execution ||
      execution.organizationId !== operation.organizationId ||
      input.organizationId !== operation.organizationId ||
      execution.sessionId !== input.sessionId ||
      execution.sessionTaskId !== input.taskId
    ) {
      return failure('AGENT_EXECUTION_CONTEXT_INVALID');
    }
    const latest = await this.checkpoints.findLatest({
      organizationId: operation.organizationId,
      operationRunId: operation.runId,
    });
    if (latest?.kind === 'terminal') {
      return terminalCheckpointResult(
        latest.state,
        input,
        execution.runtimeType,
      );
    }
    const attempt = await this.controls.startAttempt({
      organizationId: operation.organizationId,
      sessionId: input.sessionId,
      executionId: input.executionId,
      runtimeType: execution.runtimeType,
      idempotencyKey: `operation:${operation.runId}`,
    });
    await this.ensureTaskRunning(operation.organizationId, input.sessionId, input.taskId);
    const context = await this.contextBuilder.build({
      organizationId: operation.organizationId,
      sessionId: input.sessionId,
      sessionTaskId: input.taskId,
      executionId: input.executionId,
      attemptId: attempt.id,
    });
    const runtime = this.runtimes.requireCompatible(
      context.runtimeType,
      durableRequirements,
    );
    const checkpointHandle = latest ? handleFromState(latest.state) : null;
    let handle: RuntimeHandle;
    if (checkpointHandle) {
      handle = assertHandleCorrelation(checkpointHandle, context);
      await this.controls.persistAttemptHandle({
        organizationId: operation.organizationId,
        sessionId: input.sessionId,
        executionId: input.executionId,
        attemptId: attempt.id,
        runtimeType: handle.runtimeType,
        externalRunId: handle.externalRunId,
        encryptedHandleRef: handle.encryptedHandleRef,
      });
      const inspection = await runtime.inspect(handle);
      if (inspection.status === 'unknown') {
        return this.finalize(
          operation,
          input,
          attempt.id,
          handle,
          'failed',
          'AGENT_RUNTIME_HANDLE_LOST',
        );
      }
      if (inspection.status === 'completed') {
        return this.finalize(operation, input, attempt.id, handle, 'completed');
      }
      if (inspection.status === 'cancelled') {
        return this.finalize(operation, input, attempt.id, handle, 'cancelled');
      }
    } else {
      await this.checkpoint(operation, 'runtime_starting', {
        attemptId: attempt.id,
        runtimeType: context.runtimeType,
      });
      handle = assertHandleCorrelation(await runtime.start(context), context);
      await this.checkpoint(operation, 'runtime_started', {
        runtimeHandle: checkpointRuntimeHandle(handle),
      });
      await this.controls.persistAttemptHandle({
        organizationId: operation.organizationId,
        sessionId: input.sessionId,
        executionId: input.executionId,
        attemptId: attempt.id,
        runtimeType: handle.runtimeType,
        externalRunId: handle.externalRunId,
        encryptedHandleRef: handle.encryptedHandleRef,
      });
      await this.checkpoint(operation, 'runtime_handle_persisted', {
        runtimeHandle: checkpointRuntimeHandle(handle),
      });
    }

    return this.consume(operation, input, attempt.id, runtime, handle);
  }

  async cancel(context: OperationCancelContext): Promise<void> {
    const latest = await this.checkpoints.findLatest({
      organizationId: context.organizationId,
      operationRunId: context.runId,
    });
    const handle = latest ? handleFromState(latest.state) : null;
    if (!handle) return;
    const runtime = this.runtimes.requireCompatible(
      handle.runtimeType,
      durableRequirements,
    );
    await runtime.cancel(handle);
    await this.checkpoints.append({
      organizationId: context.organizationId,
      operationRunId: context.runId,
      kind: 'cancellation_requested',
      state: {
        runtimeHandle: checkpointRuntimeHandle(handle),
        reason: context.reason ?? 'cancelled',
      },
    });
  }

  private async consume(
    operation: OperationHandlerContext,
    input: SessionTaskOperationInput,
    attemptId: string,
    runtime: AgentDurableRuntimeAdapter,
    handle: RuntimeHandle,
  ): Promise<OperationHandlerResult> {
    let eventCount = 0;
    let leaseLost = false;
    const heartbeat = async () => {
      if (!this.operations.heartbeatRun) return;
      const now = new Date();
      const ok = await this.operations.heartbeatRun({
        organizationId: operation.organizationId,
        runId: operation.runId,
        attemptToken: operation.attemptToken,
        now,
        leaseExpiresAt: new Date(now.getTime() + this.leaseMs),
      });
      if (!ok) leaseLost = true;
    };
    await heartbeat();
    const timer = setInterval(
      () => void heartbeat().catch(() => { leaseLost = true; }),
      Math.max(100, Math.floor(this.leaseMs / 3)),
    );
    timer.unref?.();
    try {
      for await (const unsafeEvent of runtime.connect(handle)) {
        if (leaseLost) return failure('AGENT_OPERATION_LEASE_LOST');
        const event = normalizedEvent(unsafeEvent);
        eventCount += 1;
        if (event.kind === 'interrupt') {
          await this.checkpoint(operation, 'interrupt_boundary', {
            runtimeHandle: checkpointRuntimeHandle(handle),
            eventCount,
            interruptId: event.interruptId,
          });
        } else if (event.kind === 'artifact') {
          await this.checkpoint(operation, 'artifact_boundary', {
            runtimeHandle: checkpointRuntimeHandle(handle),
            eventCount,
            artifactId: event.artifactId,
          });
        } else if (eventCount % 100 === 0) {
          await this.checkpoint(operation, 'event_batch', {
            runtimeHandle: checkpointRuntimeHandle(handle),
            eventCount,
          });
        }
        if (event.kind === 'terminal') {
          return this.finalize(
            operation,
            input,
            attemptId,
            handle,
            event.status,
            event.status === 'failed'
              ? event.errorCode ?? 'AGENT_RUNTIME_FAILED'
              : undefined,
          );
        }
      }
      return this.finalize(
        operation,
        input,
        attemptId,
        handle,
        'failed',
        'AGENT_RUNTIME_TERMINAL_MISSING',
      );
    } finally {
      clearInterval(timer);
    }
  }

  private async finalize(
    operation: OperationHandlerContext,
    input: SessionTaskOperationInput,
    attemptId: string,
    handle: RuntimeHandle,
    status: 'completed' | 'failed' | 'cancelled',
    errorCode?: string,
  ): Promise<OperationHandlerResult> {
    await this.controls.finishAttempt({
      organizationId: operation.organizationId,
      sessionId: input.sessionId,
      executionId: input.executionId,
      attemptId,
      expectedState: 'running',
      state: status === 'completed' ? 'succeeded' : status,
      errorCode: errorCode ?? null,
      errorMessage: errorCode ?? null,
    });
    const current = await this.executions.findCurrentExecution({
      executionId: input.executionId,
    });
    if (current?.status === 'running') {
      const terminalBase = {
        organizationId: operation.organizationId,
        id: input.executionId,
        finishedAt: new Date(),
      };
      await this.executions.markExecutionTerminal(
        status === 'completed'
          ? { ...terminalBase, status, errorCode: null }
          : { ...terminalBase, status, errorCode: errorCode ?? null },
      );
    }
    const task = await this.controls.findTask({
      organizationId: operation.organizationId,
      sessionId: input.sessionId,
      taskId: input.taskId,
    });
    if (task && !['completed', 'failed', 'cancelled'].includes(task.status)) {
      await this.controls.transitionTask({
        organizationId: operation.organizationId,
        sessionId: input.sessionId,
        taskId: input.taskId,
        expectedState: task.status,
        state: status,
      });
    }
    await this.checkpoint(operation, 'terminal', {
      runtimeHandle: checkpointRuntimeHandle(handle),
      status,
      errorCode: errorCode ?? null,
    });
    const result = {
      executionId: input.executionId,
      taskId: input.taskId,
      status,
    };
    if (status === 'completed') return { kind: 'completed', result };
    if (status === 'cancelled') return { kind: 'cancelled', result };
    return failure(errorCode ?? 'AGENT_RUNTIME_FAILED');
  }

  private async ensureTaskRunning(
    organizationId: string,
    sessionId: string,
    taskId: string,
  ): Promise<void> {
    const task = await this.controls.findTask({ organizationId, sessionId, taskId });
    if (!task) throw new Error('AGENT_SESSION_TASK_NOT_FOUND');
    if (task.status === 'running') return;
    if (['queued', 'paused', 'waiting_dependency'].includes(task.status)) {
      await this.controls.transitionTask({
        organizationId,
        sessionId,
        taskId,
        expectedState: task.status,
        state: 'running',
      });
      return;
    }
    throw new Error('AGENT_SESSION_TASK_NOT_RUNNABLE');
  }

  private checkpoint(
    operation: OperationHandlerContext,
    kind: string,
    state: Record<string, unknown>,
  ) {
    return this.checkpoints.append({
      organizationId: operation.organizationId,
      operationRunId: operation.runId,
      kind,
      state,
    });
  }
}

function parseOperationInput(value: unknown): SessionTaskOperationInput {
  const input = AgentSessionTaskOperationInputSchema.parse(value);
  const session = parseAgentSessionName(input.session);
  const task = parseAgentSessionTaskName(input.task, input.session);
  const execution = parseAgentExecutionName(input.execution, input.session);
  return {
    organizationId: session.organization,
    sessionId: session.session,
    taskId: task.task,
    executionId: execution.execution,
  };
}

function handleFromState(state: Record<string, unknown>): RuntimeHandle | null {
  const parsed = RuntimeHandleSchema.safeParse(state.runtimeHandle);
  return parsed.success ? parsed.data : null;
}

function checkpointRuntimeHandle(handle: RuntimeHandle): RuntimeHandle {
  return RuntimeHandleSchema.parse({
    runtimeType: handle.runtimeType,
    executionId: handle.executionId,
    attemptId: handle.attemptId,
    externalRunId: handle.externalRunId,
    encryptedHandleRef: handle.encryptedHandleRef,
    generation: handle.generation,
  });
}

function assertHandleCorrelation(
  handle: RuntimeHandle,
  context: {
    runtimeType: string;
    executionId: string;
    attemptId: string;
  },
): RuntimeHandle {
  const parsed = RuntimeHandleSchema.parse(handle);
  if (
    parsed.runtimeType !== context.runtimeType ||
    parsed.executionId !== context.executionId ||
    parsed.attemptId !== context.attemptId
  ) throw new Error('AGENT_RUNTIME_HANDLE_CORRELATION_INVALID');
  return parsed;
}

function normalizedEvent(event: NormalizedRuntimeEvent): NormalizedRuntimeEvent {
  if (!event || typeof event !== 'object' || !('kind' in event)) {
    throw new Error('AGENT_RUNTIME_EVENT_INVALID');
  }
  return event;
}

function failure(code: string): OperationHandlerResult {
  return { kind: 'failed', code, message: code };
}

function terminalCheckpointResult(
  state: Record<string, unknown>,
  input: SessionTaskOperationInput,
  runtimeType: string,
): OperationHandlerResult {
  const terminal = TerminalCheckpointStateSchema.parse(state);
  if (
    terminal.runtimeHandle.runtimeType !== runtimeType ||
    terminal.runtimeHandle.executionId !== input.executionId
  ) {
    return failure('AGENT_RUNTIME_HANDLE_CORRELATION_INVALID');
  }
  const result = {
    executionId: input.executionId,
    taskId: input.taskId,
    status: terminal.status,
  };
  if (terminal.status === 'completed') return { kind: 'completed', result };
  if (terminal.status === 'cancelled') return { kind: 'cancelled', result };
  return failure(terminal.errorCode ?? 'AGENT_RUNTIME_FAILED');
}
