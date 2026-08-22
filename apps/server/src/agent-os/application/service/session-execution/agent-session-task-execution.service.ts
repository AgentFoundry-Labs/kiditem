import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { CanonicalResourceRefSchema } from "@kiditem/shared/agent-interaction";
import {
  AgentExecutionAttemptIdSchema,
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  OrganizationIdSchema,
  formatAgentExecutionAttemptName,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  parseOperationRunName,
  parseAgentExecutionName,
  parseAgentSessionName,
  parseAgentSessionTaskName,
} from "@kiditem/shared/identifiers";
import {
  AGENT_EXECUTION_QUERY_REPOSITORY,
  type AgentExecutionQueryRepositoryPort,
} from "../../../application/port/out/repository/interaction/agent-execution-query.repository.port";
import {
  AGENT_CONVERSATION_EVENT_TRANSACTION,
  type AgentConversationEventTransactionPort,
} from "../../../application/port/out/transaction/interaction/agent-conversation-event.transaction.port";
import {
  AGENT_SESSION_CONTROL_QUERY_REPOSITORY,
  type AgentSessionControlQueryRepositoryPort,
} from "../../../application/port/out/repository/session-control/agent-session-control-query.repository.port";
import {
  AGENT_ATTEMPT_OPERATION_TRANSACTION,
  type AgentAttemptOperationTransactionPort,
} from "../../../application/port/out/transaction/session-control/agent-attempt-operation.transaction.port";
import {
  AGENT_SESSION_TRANSITION_TRANSACTION,
  type AgentSessionTransitionTransactionPort,
} from "../../../application/port/out/transaction/session-control/agent-session-transition.transaction.port";
import {
  AGENT_SESSION_ARTIFACT_WRITER_PORT,
  type AgentSessionArtifactWriterPort,
} from "../../../application/port/in/session-execution/agent-session-artifact-writer.port";
import { AgentExecutionContextBuilder } from "../../../application/service/agent-execution-context-builder.service";
import { AgentRuntimeAdapterRegistry } from "../../../application/service/agent-runtime-adapter.registry";
import { AgentSessionApprovalService } from "../../../application/service/session-control/agent-session-approval.service";
import { AgentSessionRuntimeControlService } from "../../../application/service/session-control/agent-session-runtime-control.service";
import { AgentSessionTaskOperationInputSchema } from "../../../domain/operation/agent-os.operations";
import { assertExecutionTransition } from "../../../domain/execution/agent-execution-lifecycle.policy";
import { assertSessionTaskTransition } from "../../../domain/session/agent-session-lifecycle.policy";
import {
  AGENT_SESSION_TASK_EXECUTION_PORT,
  type AgentSessionTaskExecutionPort,
  type AgentSessionTaskExecutionResult,
  type CancelAgentSessionTaskCommand,
  type ExecuteAgentSessionTaskCommand,
} from "../../port/in/session-execution/agent-session-task-execution.port";
import {
  OPERATIONS_SESSION_EXECUTION_PORT,
  type OperationsSessionExecutionPort,
} from "../../port/out/cross-domain/operations-session-execution.port";
import type {
  AgentDurableRuntimeAdapter,
  DurableRuntimeAdapterEvent,
  NormalizedRuntimeEvent,
  RuntimeHandle,
} from "../../../application/port/out/runtime/agent-durable-runtime.port";

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
    runtimeHandle: RuntimeHandleSchema.nullable(),
    status: z.enum(["completed", "failed", "cancelled"]),
    errorCode: z.string().min(1).max(256).nullable(),
  })
  .strict();
const RuntimeApprovalPayloadSchema = z
  .object({
    capabilityKey: z.string().min(1).max(128),
    arguments: z.record(z.string(), z.unknown()),
    summary: z.string().min(1).max(500),
    resourceVersions: z.array(CanonicalResourceRefSchema).max(50),
    expiresAt: z.string().datetime(),
  })
  .strict();
const RuntimeArtifactCandidateSchema = z
  .object({
    externalArtifactId: z.string().min(1).max(256),
    artifactType: z.string().min(1).max(128),
    label: z.string().min(1).max(500),
    bytes: z.instanceof(Uint8Array),
    mimeType: z.string().min(1).max(128),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    navigationActionId: z.string().uuid(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

const RUNTIME_CANCEL_TIMEOUT_MS = 250;

interface SessionTaskOperationInput {
  readonly organizationId: string;
  readonly sessionId: string;
  readonly taskId: string;
  readonly executionId: string;
}

interface SessionExecutionOperation {
  organizationId: string;
  runId: string;
  operation: import("@kiditem/shared/identifiers").OperationRunName;
  attemptToken: string;
  input: Record<string, unknown>;
  signal: AbortSignal;
}

interface SessionExecutionCancel {
  organizationId: string;
  runId: string;
  operation: import("@kiditem/shared/identifiers").OperationRunName;
  requestedByUserId: string | null;
  reason: string | null;
}

type SessionExecutionOperationResult =
  | { kind: "completed"; result: Record<string, unknown> }
  | {
      kind: "attention_required";
      reason: string;
      result: Record<string, unknown>;
    }
  | { kind: "cancelled"; result: Record<string, unknown> }
  | { kind: "failed"; code: string; message: string };

@Injectable()
export class AgentSessionTaskExecutionService implements AgentSessionTaskExecutionPort {
  constructor(
    private readonly contextBuilder: AgentExecutionContextBuilder,
    private readonly runtimes: AgentRuntimeAdapterRegistry,
    @Inject(OPERATIONS_SESSION_EXECUTION_PORT)
    private readonly operationExecution: OperationsSessionExecutionPort,
    @Inject(AGENT_SESSION_CONTROL_QUERY_REPOSITORY)
    private readonly queries: AgentSessionControlQueryRepositoryPort,
    @Inject(AGENT_ATTEMPT_OPERATION_TRANSACTION)
    private readonly attempts: AgentAttemptOperationTransactionPort,
    @Inject(AGENT_SESSION_TRANSITION_TRANSACTION)
    private readonly transitions: AgentSessionTransitionTransactionPort,
    @Inject(AGENT_SESSION_ARTIFACT_WRITER_PORT)
    private readonly artifacts: AgentSessionArtifactWriterPort,
    private readonly runtimeControl: AgentSessionRuntimeControlService,
    private readonly approvals: AgentSessionApprovalService,
    @Inject(AGENT_EXECUTION_QUERY_REPOSITORY)
    private readonly executions: AgentExecutionQueryRepositoryPort,
    @Inject(AGENT_CONVERSATION_EVENT_TRANSACTION)
    private readonly executionEvents: AgentConversationEventTransactionPort,
  ) {}

  async execute(
    command: ExecuteAgentSessionTaskCommand,
  ): Promise<AgentSessionTaskExecutionResult> {
    const graph = parseExecutionCommand(command);
    const result = await this.executeOperation({
      organizationId: graph.organizationId,
      runId: graph.operationRunId,
      operation: command.operation,
      attemptToken: command.operationAttemptToken,
      input: {
        session: command.session,
        task: command.task,
        execution: command.execution,
      },
      signal: command.signal,
    });
    return mapExecutionResult(result);
  }

  private async executeOperation(
    operation: SessionExecutionOperation,
  ): Promise<SessionExecutionOperationResult> {
    operation.signal.throwIfAborted();
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
      return failure("AGENT_EXECUTION_CONTEXT_INVALID");
    }
    const latest = await this.operationExecution.findLatestCheckpoint({
      organizationId: operation.organizationId,
      operation: operation.operation,
    });
    if (latest?.kind === "terminal") {
      return terminalCheckpointResult(
        latest.state,
        input,
        execution.runtimeType,
      );
    }
    const attempt = await this.attempts.activateAttemptForOperation({
      organizationId: operation.organizationId,
      sessionId: input.sessionId,
      executionId: input.executionId,
      operationRunId: operation.runId,
    });
    await this.ensureTaskRunning(
      operation.organizationId,
      input.sessionId,
      input.taskId,
    );
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
      await this.attempts.persistAttemptHandle({
        organizationId: operation.organizationId,
        sessionId: input.sessionId,
        executionId: input.executionId,
        attemptId: attempt.id,
        runtimeType: handle.runtimeType,
        externalRunId: handle.externalRunId,
        encryptedHandleRef: handle.encryptedHandleRef,
        runtimeGeneration: handle.generation,
      });
      const inspection = await runtime.inspect(handle);
      if (inspection.status === "unknown") {
        return this.finalize(
          operation,
          input,
          attempt.id,
          handle,
          "failed",
          "AGENT_RUNTIME_HANDLE_LOST",
        );
      }
      if (inspection.status === "completed") {
        return this.finalize(operation, input, attempt.id, handle, "completed");
      }
      if (inspection.status === "cancelled") {
        return this.finalize(operation, input, attempt.id, handle, "cancelled");
      }
    } else {
      await this.checkpoint(operation, "runtime_starting", {
        attemptId: attempt.id,
        runtimeType: context.runtimeType,
      });
      handle = assertHandleCorrelation(await runtime.start(context), context);
      await this.checkpoint(operation, "runtime_started", {
        runtimeHandle: checkpointRuntimeHandle(handle),
      });
      await this.attempts.persistAttemptHandle({
        organizationId: operation.organizationId,
        sessionId: input.sessionId,
        executionId: input.executionId,
        attemptId: attempt.id,
        runtimeType: handle.runtimeType,
        externalRunId: handle.externalRunId,
        encryptedHandleRef: handle.encryptedHandleRef,
        runtimeGeneration: handle.generation,
      });
      await this.checkpoint(operation, "runtime_handle_persisted", {
        runtimeHandle: checkpointRuntimeHandle(handle),
      });
    }

    return this.consume(operation, input, attempt.id, runtime, handle);
  }

  async cancel(command: CancelAgentSessionTaskCommand): Promise<void> {
    const graph = parseCancelCommand(command);
    const run = await this.operationExecution.findOperation({
      organizationId: graph.organizationId,
      operation: command.operation,
    });
    if (!run) throw new Error("AGENT_SESSION_OPERATION_NOT_FOUND");
    const input = parseOperationInput(run.input);
    const context: SessionExecutionCancel = {
      organizationId: graph.organizationId,
      runId: graph.operationRunId,
      operation: command.operation,
      requestedByUserId: command.requestedByUserId,
      reason: command.reason,
    };
    if (input.organizationId !== context.organizationId) {
      throw new Error("AGENT_SESSION_OPERATION_SCOPE_INVALID");
    }
    const attempt = await this.attempts.findAttemptForOperation({
      organizationId: context.organizationId,
      operationRunId: context.runId,
    });
    if (!attempt || attempt.executionId !== input.executionId) {
      throw new Error("AGENT_SESSION_OPERATION_ATTEMPT_NOT_FOUND");
    }
    const latest = await this.operationExecution.findLatestCheckpoint({
      organizationId: context.organizationId,
      operation: context.operation,
    });
    if (latest?.kind === "terminal") return;
    const handle = latest ? handleFromState(latest.state) : null;
    if (handle) {
      if (
        handle.executionId !== input.executionId ||
        handle.attemptId !== attempt.id
      )
        throw new Error("AGENT_RUNTIME_HANDLE_CORRELATION_INVALID");
      const runtime = this.runtimes.requireCompatible(
        handle.runtimeType,
        durableRequirements,
      );
      await runtime.cancel(handle);
    }
    await this.operationExecution.appendCheckpoint({
      organizationId: context.organizationId,
      operation: context.operation,
      kind: "cancellation_requested",
      state: {
        runtimeHandle: handle ? checkpointRuntimeHandle(handle) : null,
        reason: context.reason ?? "cancelled",
      },
    });
    await this.recordRuntimeEvent(context, input, attempt.id, 0, {
      kind: "terminal",
      status: "cancelled",
    });
    await this.finalize(
      context,
      input,
      attempt.id,
      handle,
      "cancelled",
      undefined,
      attempt.state,
    );
  }

  private async consume(
    operation: SessionExecutionOperation,
    input: SessionTaskOperationInput,
    attemptId: string,
    runtime: AgentDurableRuntimeAdapter,
    handle: RuntimeHandle,
  ): Promise<SessionExecutionOperationResult> {
    let eventCount = 0;
    let assistantOpen = false;
    const iterator = runtime.connect(handle)[Symbol.asyncIterator]();
    try {
      while (true) {
        const next = await nextRuntimeEvent(iterator, operation.signal);
        operation.signal.throwIfAborted();
        if (next.done) {
          return this.finalize(
            operation,
            input,
            attemptId,
            handle,
            "failed",
            "AGENT_RUNTIME_TERMINAL_MISSING",
          );
        }
        const unsafeEvent = next.value;
        const event = adapterEvent(unsafeEvent);
        eventCount += 1;
        if (event.kind === "interrupt") {
          if (assistantOpen) {
            await this.recordRuntimeEvent(
              operation,
              input,
              attemptId,
              eventCount,
              {
                kind: "text_end",
              },
            );
            assistantOpen = false;
          }
          return this.persistApprovalBoundary(
            operation,
            input,
            attemptId,
            handle,
            eventCount,
            event,
          );
        }
        if (event.kind === "text_start") {
          if (assistantOpen)
            throw new Error("AGENT_RUNTIME_TEXT_SEQUENCE_INVALID");
          await this.recordRuntimeEvent(
            operation,
            input,
            attemptId,
            eventCount,
            event,
          );
          assistantOpen = true;
          continue;
        }
        if (event.kind === "text_end") {
          if (!assistantOpen)
            throw new Error("AGENT_RUNTIME_TEXT_SEQUENCE_INVALID");
          await this.recordRuntimeEvent(
            operation,
            input,
            attemptId,
            eventCount,
            event,
          );
          assistantOpen = false;
          continue;
        }
        if (event.kind === "text_delta" && !assistantOpen) {
          await this.recordRuntimeEvent(
            operation,
            input,
            attemptId,
            eventCount,
            {
              kind: "text_start",
            },
          );
          assistantOpen = true;
        }
        if (event.kind === "terminal" && assistantOpen) {
          await this.recordRuntimeEvent(
            operation,
            input,
            attemptId,
            eventCount,
            {
              kind: "text_end",
            },
          );
          assistantOpen = false;
        }
        const nonInterruptEvent = event as Exclude<
          DurableRuntimeAdapterEvent,
          { kind: "interrupt" }
        >;
        const durableEvent =
          nonInterruptEvent.kind === "artifact_candidate"
            ? await this.persistArtifact(operation, input, nonInterruptEvent)
            : nonInterruptEvent;
        await this.recordRuntimeEvent(
          operation,
          input,
          attemptId,
          eventCount,
          durableEvent,
        );
        if (durableEvent.kind === "artifact") {
          await this.checkpoint(operation, "artifact_boundary", {
            runtimeHandle: checkpointRuntimeHandle(handle),
            eventCount,
            artifactId: durableEvent.artifactId,
          });
        } else if (eventCount % 100 === 0) {
          await this.checkpoint(operation, "event_batch", {
            runtimeHandle: checkpointRuntimeHandle(handle),
            eventCount,
          });
        }
        if (event.kind === "terminal") {
          operation.signal.throwIfAborted();
          return this.finalize(
            operation,
            input,
            attemptId,
            handle,
            event.status,
            event.status === "failed"
              ? (event.errorCode ?? "AGENT_RUNTIME_FAILED")
              : undefined,
          );
        }
      }
    } catch (error) {
      if (!operation.signal.aborted) throw error;
      await this.stopAbortedConsumption(
        operation,
        input,
        attemptId,
        runtime,
        handle,
      );
      throw abortReason(operation.signal);
    } finally {
      void iterator.return?.().catch(() => undefined);
    }
  }

  private async stopAbortedConsumption(
    operation: SessionExecutionOperation,
    input: SessionTaskOperationInput,
    attemptId: string,
    runtime: AgentDurableRuntimeAdapter,
    handle: RuntimeHandle,
  ): Promise<void> {
    if (!isDeadlineAbort(operation.signal.reason)) return;
    const errorCode = "OPERATION_DEADLINE_EXCEEDED";
    try {
      await cancelRuntimeWithinDeadline(runtime, handle);
    } catch {
      // The operation deadline is authoritative. A broken adapter cancel must
      // not leave the canonical AgentOS graph nonterminal.
    } finally {
      await this.recordRuntimeEvent(operation, input, attemptId, 0, {
        kind: "terminal",
        status: "failed",
        errorCode,
      });
      await this.finalize(
        operation,
        input,
        attemptId,
        handle,
        "failed",
        errorCode,
        "running",
        true,
      );
    }
  }

  private async persistApprovalBoundary(
    operation: Pick<
      SessionExecutionOperation,
      "organizationId" | "runId" | "operation"
    >,
    input: SessionTaskOperationInput,
    attemptId: string,
    handle: RuntimeHandle,
    eventCount: number,
    event: Extract<NormalizedRuntimeEvent, { kind: "interrupt" }>,
  ): Promise<SessionExecutionOperationResult> {
    const payload = RuntimeApprovalPayloadSchema.parse(event.payload);
    const names = canonicalNames(input, attemptId);
    const approval = await this.approvals.request({
      organizationId: operation.organizationId,
      session: names.session,
      task: names.task,
      execution: names.execution,
      attempt: names.attempt,
      operationRunId: operation.runId,
      capabilityKey: payload.capabilityKey,
      arguments: payload.arguments,
      summary: payload.summary,
      resourceVersions: payload.resourceVersions,
      expiresAt: payload.expiresAt,
      idempotencyKey: `runtime:${attemptId}:interrupt:${event.interruptId}`,
    });
    const task = await this.queries.findTask({
      organizationId: operation.organizationId,
      sessionId: input.sessionId,
      taskId: input.taskId,
    });
    if (!task) return failure("AGENT_SESSION_TASK_NOT_FOUND");
    if (task.status === "running") {
      assertSessionTaskTransition(task.status, "waiting_approval");
      await this.transitions.transitionTask({
        organizationId: operation.organizationId,
        sessionId: input.sessionId,
        taskId: input.taskId,
        expectedState: "running",
        state: "waiting_approval",
      });
    } else if (task.status !== "waiting_approval") {
      return failure("AGENT_SESSION_TASK_NOT_RUNNABLE");
    }
    await this.checkpoint(operation, "interrupt_boundary", {
      runtimeHandle: checkpointRuntimeHandle(handle),
      eventCount,
      interruptId: event.interruptId,
      approvalId: approval.approvalId,
    });
    for (const persisted of approval.persistedEvents) {
      await this.runtimeControl.publish(persisted);
    }
    return {
      kind: "attention_required",
      reason: "agent_session_approval_required",
      result: { approvalId: approval.approvalId },
    };
  }

  private async persistArtifact(
    operation: SessionExecutionOperation,
    input: SessionTaskOperationInput,
    event: Extract<DurableRuntimeAdapterEvent, { kind: "artifact_candidate" }>,
  ): Promise<Extract<NormalizedRuntimeEvent, { kind: "artifact" }>> {
    const { kind: _kind, ...candidate } = event;
    const payload = RuntimeArtifactCandidateSchema.parse(candidate);
    return this.artifacts.materialize({
      signal: operation.signal,
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      executionId: input.executionId,
      operationRunId: operation.runId,
      attemptToken: operation.attemptToken,
      externalArtifactId: payload.externalArtifactId,
      artifactType: payload.artifactType,
      bytes: payload.bytes,
      mimeType: payload.mimeType,
      sha256: payload.sha256,
      label: payload.label,
      navigationActionId: payload.navigationActionId,
      metadata: payload.metadata,
    });
  }

  private recordRuntimeEvent(
    operation: Pick<
      SessionExecutionOperation,
      "organizationId" | "runId" | "operation"
    >,
    input: SessionTaskOperationInput,
    attemptId: string,
    ordinal: number,
    event: Exclude<NormalizedRuntimeEvent, { kind: "interrupt" }>,
  ) {
    const names = canonicalNames(input, attemptId);
    return this.runtimeControl.record({
      organizationId: operation.organizationId,
      session: names.session,
      task: names.task,
      execution: names.execution,
      attemptId,
      ordinal,
      event,
    });
  }

  private async finalize(
    operation: Pick<
      SessionExecutionOperation,
      "organizationId" | "runId" | "operation"
    > & {
      signal?: AbortSignal;
    },
    input: SessionTaskOperationInput,
    attemptId: string,
    handle: RuntimeHandle | null,
    status: "completed" | "failed" | "cancelled",
    errorCode?: string,
    expectedAttemptState = "running",
    allowAborted = false,
  ): Promise<SessionExecutionOperationResult> {
    if (!allowAborted) operation.signal?.throwIfAborted();
    await this.attempts.finishAttempt({
      organizationId: operation.organizationId,
      sessionId: input.sessionId,
      executionId: input.executionId,
      attemptId,
      expectedState: expectedAttemptState,
      state: status === "completed" ? "succeeded" : status,
      errorCode: errorCode ?? null,
      errorMessage: errorCode ?? null,
    });
    const current = await this.executions.findCurrentExecution({
      executionId: input.executionId,
    });
    if (current?.status === "running") {
      assertExecutionTransition(current.status, status);
      const terminalBase = {
        organizationId: operation.organizationId,
        sessionId: input.sessionId,
        id: input.executionId,
        finishedAt: new Date(),
      };
      await this.executionEvents.markExecutionTerminal(
        status === "completed"
          ? { ...terminalBase, status, errorCode: null }
          : { ...terminalBase, status, errorCode: errorCode ?? null },
      );
    }
    const task = await this.queries.findTask({
      organizationId: operation.organizationId,
      sessionId: input.sessionId,
      taskId: input.taskId,
    });
    if (task && !["completed", "failed", "cancelled"].includes(task.status)) {
      assertSessionTaskTransition(task.status, status);
      await this.transitions.transitionTask({
        organizationId: operation.organizationId,
        sessionId: input.sessionId,
        taskId: input.taskId,
        expectedState: task.status,
        state: status,
      });
    }
    await this.checkpoint(operation, "terminal", {
      runtimeHandle: handle ? checkpointRuntimeHandle(handle) : null,
      status,
      errorCode: errorCode ?? null,
    });
    const result = {
      executionId: input.executionId,
      taskId: input.taskId,
      status,
    };
    if (status === "completed") return { kind: "completed", result };
    if (status === "cancelled") return { kind: "cancelled", result };
    return failure(errorCode ?? "AGENT_RUNTIME_FAILED");
  }

  private async ensureTaskRunning(
    organizationId: string,
    sessionId: string,
    taskId: string,
  ): Promise<void> {
    const task = await this.queries.findTask({
      organizationId,
      sessionId,
      taskId,
    });
    if (!task) throw new Error("AGENT_SESSION_TASK_NOT_FOUND");
    if (task.status === "running") return;
    if (
      ["queued", "paused", "waiting_dependency", "waiting_approval"].includes(
        task.status,
      )
    ) {
      assertSessionTaskTransition(task.status, "running");
      await this.transitions.transitionTask({
        organizationId,
        sessionId,
        taskId,
        expectedState: task.status,
        state: "running",
      });
      return;
    }
    throw new Error("AGENT_SESSION_TASK_NOT_RUNNABLE");
  }

  private checkpoint(
    operation: Pick<SessionExecutionOperation, "organizationId" | "operation">,
    kind: string,
    state: Record<string, unknown>,
  ) {
    return this.operationExecution.appendCheckpoint({
      organizationId: operation.organizationId,
      operation: operation.operation,
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

function canonicalNames(input: SessionTaskOperationInput, attemptId: string) {
  const organization = OrganizationIdSchema.parse(input.organizationId);
  const sessionId = AgentSessionIdSchema.parse(input.sessionId);
  const taskId = AgentSessionTaskIdSchema.parse(input.taskId);
  const executionId = AgentExecutionIdSchema.parse(input.executionId);
  const attempt = AgentExecutionAttemptIdSchema.parse(attemptId);
  const session = formatAgentSessionName(organization, sessionId);
  const execution = formatAgentExecutionName(
    organization,
    sessionId,
    executionId,
  );
  return {
    session,
    task: formatAgentSessionTaskName(organization, sessionId, taskId),
    execution,
    attempt: formatAgentExecutionAttemptName(
      organization,
      sessionId,
      executionId,
      attempt,
    ),
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
  )
    throw new Error("AGENT_RUNTIME_HANDLE_CORRELATION_INVALID");
  return parsed;
}

function adapterEvent(
  event: DurableRuntimeAdapterEvent,
): DurableRuntimeAdapterEvent {
  if (!event || typeof event !== "object" || !("kind" in event)) {
    throw new Error("AGENT_RUNTIME_EVENT_INVALID");
  }
  return event;
}

function nextRuntimeEvent(
  iterator: AsyncIterator<DurableRuntimeAdapterEvent>,
  signal: AbortSignal,
): Promise<IteratorResult<DurableRuntimeAdapterEvent>> {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void iterator.next().then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("operation_attempt_aborted");
}

function isDeadlineAbort(reason: unknown): boolean {
  return (
    reason instanceof Error && reason.message === "operation_deadline_exceeded"
  );
}

async function cancelRuntimeWithinDeadline(
  runtime: AgentDurableRuntimeAdapter,
  handle: RuntimeHandle,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<void>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error("agent_runtime_cancel_timeout"));
    }, RUNTIME_CANCEL_TIMEOUT_MS);
    timeout.unref?.();
  });
  try {
    await Promise.race([runtime.cancel(handle), deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function failure(code: string): SessionExecutionOperationResult {
  return { kind: "failed", code, message: code };
}

function terminalCheckpointResult(
  state: Record<string, unknown>,
  input: SessionTaskOperationInput,
  runtimeType: string,
): SessionExecutionOperationResult {
  const terminal = TerminalCheckpointStateSchema.parse(state);
  if (
    terminal.runtimeHandle &&
    (terminal.runtimeHandle.runtimeType !== runtimeType ||
      terminal.runtimeHandle.executionId !== input.executionId)
  ) {
    return failure("AGENT_RUNTIME_HANDLE_CORRELATION_INVALID");
  }
  const result = {
    executionId: input.executionId,
    taskId: input.taskId,
    status: terminal.status,
  };
  if (terminal.status === "completed") return { kind: "completed", result };
  if (terminal.status === "cancelled") return { kind: "cancelled", result };
  return failure(terminal.errorCode ?? "AGENT_RUNTIME_FAILED");
}

function parseExecutionCommand(command: ExecuteAgentSessionTaskCommand): {
  organizationId: string;
  operationRunId: string;
  attemptToken: string;
} {
  try {
    const input = parseOperationInput({
      session: command.session,
      task: command.task,
      execution: command.execution,
    });
    const operation = parseOperationRunName(command.operation);
    if (
      !command.operationAttemptToken ||
      input.organizationId !== command.organizationId ||
      operation.organization !== command.organizationId
    )
      throw new Error("invalid execution command");
    return {
      organizationId: input.organizationId,
      operationRunId: operation.operation,
      attemptToken: command.operationAttemptToken,
    };
  } catch {
    throw new Error("AGENT_SESSION_OPERATION_SCOPE_INVALID");
  }
}

function parseCancelCommand(command: CancelAgentSessionTaskCommand): {
  organizationId: string;
  operationRunId: string;
} {
  try {
    const operation = parseOperationRunName(command.operation);
    if (operation.organization !== command.organizationId) {
      throw new Error("operation organization mismatch");
    }
    return {
      organizationId: operation.organization,
      operationRunId: operation.operation,
    };
  } catch {
    throw new Error("AGENT_SESSION_OPERATION_SCOPE_INVALID");
  }
}

function mapExecutionResult(
  result: SessionExecutionOperationResult,
): AgentSessionTaskExecutionResult {
  switch (result.kind) {
    case "completed":
      return { status: "completed", output: result.result };
    case "attention_required":
      return {
        status: "attention_required",
        reason: result.reason,
        output: result.result,
      };
    case "cancelled":
      return { status: "cancelled", output: result.result };
    case "failed":
      return { status: "failed", code: result.code, message: result.message };
  }
}
