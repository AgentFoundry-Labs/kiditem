import { Prisma } from "@prisma/client";
import {
  AgentSessionControlRepositoryError,
  type AgentSessionOperationContinuationRecord,
} from "../../../../../application/port/out/repository/session-control/agent-session-control.persistence.types";
import { lockWritableAgentSession } from "./lock-writable-agent-session";

export interface ContinueOperationAttemptInput {
  signal: AbortSignal;
  organizationId: string;
  sessionId: string;
  taskId: string;
  executionId: string;
  attemptId: string;
  predecessorOperationRunId: string;
  continuationKey: string;
}

/**
 * Creates or returns the idempotent successor Operation while remaining inside
 * the caller's existing Prisma transaction. Approval continuation uses this
 * same owner so its state transition and Operation binding stay atomic.
 */
export async function continueOperationAttemptInTransaction(
  tx: Prisma.TransactionClient,
  input: ContinueOperationAttemptInput,
): Promise<AgentSessionOperationContinuationRecord> {
  input.signal.throwIfAborted();
  await lockWritableAgentSession(tx, input);
  await lock(tx, [
    "attempt-operation-continuation",
    input.organizationId,
    input.attemptId,
    input.continuationKey,
  ]);
  const existing = await tx.agentExecutionAttemptOperationBinding.findFirst({
    where: {
      organizationId: input.organizationId,
      executionAttemptId: input.attemptId,
      continuationKey: input.continuationKey,
    },
    select: {
      executionAttemptId: true,
      operationRunId: true,
      predecessorOperationRunId: true,
    },
  });
  if (existing) {
    if (
      existing.predecessorOperationRunId !== input.predecessorOperationRunId
    ) {
      throw conflict("AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT");
    }
    return {
      operationRunId: existing.operationRunId,
      attemptId: existing.executionAttemptId,
    };
  }

  const predecessor = await tx.agentExecutionAttemptOperationBinding.findFirst({
    where: {
      organizationId: input.organizationId,
      executionAttemptId: input.attemptId,
      operationRunId: input.predecessorOperationRunId,
    },
    include: {
      attempt: {
        include: {
          execution: {
            select: {
              id: true,
              status: true,
              sessionTaskId: true,
              sessionTask: { select: { status: true } },
            },
          },
        },
      },
      operationRun: true,
    },
  });
  if (!predecessor) throw scope();
  if (
    predecessor.attempt.executionId !== input.executionId ||
    predecessor.attempt.sessionId !== input.sessionId ||
    predecessor.attempt.execution.sessionTaskId !== input.taskId ||
    predecessor.attempt.state !== "running" ||
    predecessor.attempt.execution.status !== "running" ||
    !["running", "waiting_approval"].includes(
      predecessor.attempt.execution.sessionTask.status,
    ) ||
    !predecessor.attempt.externalRunId ||
    !predecessor.attempt.encryptedHandleRef
  )
    throw state();
  const lifecycleCancelled =
    predecessor.operationRun.status === "cancelled" &&
    [
      "operation_server_shutdown",
      "operation_server_lifecycle_expired",
    ].includes(predecessor.operationRun.errorCode ?? "");
  if (
    !lifecycleCancelled &&
    predecessor.operationRun.status !== "attention_required"
  )
    throw state();

  const predecessorOwnership =
    await tx.agentSessionOperationRunOwnership.findFirst({
      where: {
        organizationId: input.organizationId,
        operationRunId: input.predecessorOperationRunId,
      },
      select: { sessionId: true },
    });
  if (!predecessorOwnership || predecessorOwnership.sessionId !== input.sessionId) {
    throw scope();
  }

  input.signal.throwIfAborted();
  const operationRun = await tx.operationRun.create({
    data: {
      organizationId: input.organizationId,
      operationKey: predecessor.operationRun.operationKey,
      definitionVersion: predecessor.operationRun.definitionVersion,
      ownerDomain: predecessor.operationRun.ownerDomain,
      title: predecessor.operationRun.title,
      engineType: predecessor.operationRun.engineType,
      resourceClass: predecessor.operationRun.resourceClass,
      executionTimeoutMs: predecessor.operationRun.executionTimeoutMs,
      triggerSource: predecessor.operationRun.triggerSource,
      requestedByUserId: predecessor.operationRun.requestedByUserId,
      parentRunId: predecessor.operationRun.parentRunId,
      scheduleId: predecessor.operationRun.scheduleId,
      idempotencyKey: `agent-session-continuation:${input.attemptId}:${input.continuationKey}`,
      input: predecessor.operationRun.input as Prisma.InputJsonValue,
      maxAttempts: predecessor.operationRun.maxAttempts,
    },
    select: { id: true },
  });
  await tx.agentSessionOperationRunOwnership.create({
    data: {
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      operationRunId: operationRun.id,
    },
  });
  await tx.agentExecutionAttemptOperationBinding.create({
    data: {
      organizationId: input.organizationId,
      executionAttemptId: predecessor.attempt.id,
      executionId: predecessor.attempt.executionId,
      sessionId: predecessor.attempt.sessionId,
      operationRunId: operationRun.id,
      predecessorOperationRunId: predecessor.operationRunId,
      continuationKey: input.continuationKey,
    },
  });
  await tx.operationRunCheckpoint.create({
    data: {
      organizationId: input.organizationId,
      operationRunId: operationRun.id,
      sequence: 1n,
      kind: "runtime_handle_continuation",
      state: {
        runtimeHandle: {
          runtimeType: predecessor.attempt.runtimeType,
          executionId: predecessor.attempt.executionId,
          attemptId: predecessor.attempt.id,
          externalRunId: predecessor.attempt.externalRunId,
          encryptedHandleRef: predecessor.attempt.encryptedHandleRef,
          generation: predecessor.attempt.runtimeGeneration,
        },
      } as Prisma.InputJsonValue,
    },
  });
  return { operationRunId: operationRun.id, attemptId: predecessor.attempt.id };
}

async function lock(
  tx: Prisma.TransactionClient,
  parts: string[],
): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${parts.join(":")}, 0))`,
  );
}
function scope(): AgentSessionControlRepositoryError {
  return conflict("AGENT_SESSION_CONTROL_SCOPE_INVALID");
}
function state(): AgentSessionControlRepositoryError {
  return conflict("AGENT_SESSION_CONTROL_STATE_CONFLICT");
}
function conflict(
  code: AgentSessionControlRepositoryError["code"],
): AgentSessionControlRepositoryError {
  return new AgentSessionControlRepositoryError(code, code);
}
