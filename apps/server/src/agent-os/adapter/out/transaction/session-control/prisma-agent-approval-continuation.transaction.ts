import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  CanonicalResourceRefSchema,
  UserMessageEventPayloadSchema,
} from "@kiditem/shared/agent-interaction";
import { z } from "zod";
import { PrismaService } from "../../../../../prisma/prisma.service";
import {
  AgentSessionControlRepositoryError,
  type DelegatedTaskRecord,
  type DelegationContextRecord,
  type ExecutionAttemptRecord,
  type SessionApprovalRecord,
  type SessionArtifactRecord,
} from "../../../../application/port/out/repository/session-control/agent-session-control.persistence.types";
import type { AgentApprovalContinuationTransactionPort } from "../../../../application/port/out/transaction/session-control/agent-approval-continuation.transaction.port";

const TERMINAL_STATES = new Set([
  "archived",
  "completed",
  "succeeded",
  "failed",
  "cancelled",
]);

type ApprovalContinuationAttemptInput = {
  signal: AbortSignal;
  organizationId: string;
  sessionId: string;
  taskId: string;
  executionId: string;
  attemptId: string;
  predecessorOperationRunId: string;
  continuationKey: string;
};

@Injectable()
export class PrismaAgentApprovalContinuationTransaction implements AgentApprovalContinuationTransactionPort {
  constructor(private readonly prisma: PrismaService) {}

  async requestApproval(
    input: Parameters<
      AgentApprovalContinuationTransactionPort["requestApproval"]
    >[0],
  ): Promise<SessionApprovalRecord> {
    return this.prisma
      .$transaction(async (tx: Prisma.TransactionClient) => {
        await lock(tx, [
          "approval-open",
          input.organizationId,
          input.executionId,
        ]);
        await lock(tx, ["approval", input.executionId, input.idempotencyKey]);
        const attempt = await tx.agentExecutionAttempt.findFirst({
          where: {
            id: input.attemptId,
            executionId: input.executionId,
            sessionId: input.sessionId,
            organizationId: input.organizationId,
            execution: { sessionTaskId: input.taskId },
          },
        });
        if (!attempt) throw scope();
        const operationBinding =
          await tx.agentExecutionAttemptOperationBinding.findFirst({
            where: {
              organizationId: input.organizationId,
              executionAttemptId: input.attemptId,
              operationRunId: input.operationRunId,
            },
            select: { id: true, operationRunId: true },
          });
        if (!operationBinding) throw scope();
        const existing = await tx.agentSessionApproval.findFirst({
          where: {
            executionId: input.executionId,
            idempotencyKey: input.idempotencyKey,
          },
        });
        if (existing) {
          if (
            existing.organizationId !== input.organizationId ||
            existing.sessionId !== input.sessionId ||
            existing.taskId !== input.taskId ||
            existing.attemptId !== input.attemptId ||
            existing.operationBindingId !== operationBinding.id ||
            existing.predecessorOperationRunId !==
              operationBinding.operationRunId ||
            existing.capabilityKey !== input.capabilityKey ||
            existing.argumentsHash !== input.argumentsHash ||
            !canonicalEqual(
              existing.resourceSnapshot,
              input.resourceSnapshot,
            ) ||
            existing.expiresAt.getTime() !== input.expiresAt.getTime()
          )
            throw conflict("AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT");
          return mapApproval(existing, false);
        }
        const pending = await tx.agentSessionApproval.findFirst({
          where: {
            organizationId: input.organizationId,
            sessionId: input.sessionId,
            executionId: input.executionId,
            state: "pending",
          },
          select: { id: true },
        });
        if (pending) throw state();
        if (attempt.state !== "running") throw state();
        return mapApproval(
          await tx.agentSessionApproval.create({
            data: {
              organizationId: input.organizationId,
              sessionId: input.sessionId,
              taskId: input.taskId,
              executionId: input.executionId,
              attemptId: input.attemptId,
              operationBindingId: operationBinding.id,
              predecessorOperationRunId: operationBinding.operationRunId,
              capabilityKey: input.capabilityKey,
              argumentsHash: input.argumentsHash,
              resourceSnapshot: input.resourceSnapshot as Prisma.InputJsonValue,
              state: "pending",
              expiresAt: input.expiresAt,
              idempotencyKey: input.idempotencyKey,
            },
          }),
          true,
        );
      })
      .catch(rethrowStable);
  }

  async decideApproval(
    input: Parameters<
      AgentApprovalContinuationTransactionPort["decideApproval"]
    >[0],
  ): Promise<SessionApprovalRecord> {
    return this.prisma
      .$transaction(async (tx: Prisma.TransactionClient) => {
        await lock(tx, [
          "approval-decision",
          input.organizationId,
          input.idempotencyKey,
        ]);
        const idempotent = await tx.agentSessionApproval.findFirst({
          where: {
            organizationId: input.organizationId,
            decisionIdempotencyKey: input.idempotencyKey,
          },
        });
        if (idempotent) {
          if (
            idempotent.id !== input.approvalId ||
            idempotent.sessionId !== input.sessionId ||
            idempotent.state !== input.decision ||
            idempotent.decidedByActorType !== input.actorType ||
            idempotent.decidedByActorId !== input.actorId
          )
            throw conflict("AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT");
          if (input.decision === "approved") {
            await ensureApprovalContinuation(tx, idempotent);
          }
          return mapApproval(idempotent, false);
        }
        const approval = await tx.agentSessionApproval.findFirst({
          where: {
            id: input.approvalId,
            sessionId: input.sessionId,
            organizationId: input.organizationId,
          },
        });
        if (!approval) throw scope();
        if (
          approval.state !== input.expectedState ||
          approval.expiresAt <= new Date()
        )
          throw state();
        const decided = await tx.agentSessionApproval.update({
          where: { id: approval.id },
          data: {
            state: input.decision,
            decisionIdempotencyKey: input.idempotencyKey,
            decidedByActorType: input.actorType,
            decidedByActorId: input.actorId,
            decidedAt: new Date(),
          },
        });
        if (input.decision === "approved") {
          await ensureApprovalContinuation(tx, decided);
        }
        return mapApproval(decided, true);
      })
      .catch(rethrowStable);
  }

  async loadApproval(
    input: Parameters<
      AgentApprovalContinuationTransactionPort["loadApproval"]
    >[0],
  ) {
    const approval = await this.prisma.agentSessionApproval.findFirst({
      where: {
        id: input.approvalId,
        organizationId: input.organizationId,
        sessionId: input.sessionId,
      },
      select: {
        id: true,
        organizationId: true,
        sessionId: true,
        taskId: true,
        executionId: true,
        attemptId: true,
        operationBindingId: true,
        predecessorOperationRunId: true,
        capabilityKey: true,
        argumentsHash: true,
        resourceSnapshot: true,
        state: true,
        decisionIdempotencyKey: true,
        expiresAt: true,
        execution: {
          select: {
            session: { select: { createdByUserId: true } },
          },
        },
        attempt: {
          select: {
            runtimeType: true,
            externalRunId: true,
            encryptedHandleRef: true,
            runtimeGeneration: true,
          },
        },
      },
    });
    if (!approval) return null;
    const resourceSnapshot = z
      .array(CanonicalResourceRefSchema)
      .max(50)
      .safeParse(approval.resourceSnapshot);
    if (!resourceSnapshot.success) throw state();
    return {
      id: approval.id,
      organizationId: approval.organizationId,
      sessionId: approval.sessionId,
      taskId: approval.taskId,
      executionId: approval.executionId,
      attemptId: approval.attemptId,
      operationBindingId: approval.operationBindingId,
      operationRunId: approval.predecessorOperationRunId,
      capabilityKey: approval.capabilityKey,
      argumentsHash: approval.argumentsHash,
      resourceSnapshot: resourceSnapshot.data,
      state: approval.state,
      decisionIdempotencyKey: approval.decisionIdempotencyKey,
      expiresAt: approval.expiresAt,
      requestedByUserId: approval.execution.session.createdByUserId,
      runtimeType: approval.attempt.runtimeType,
      externalRunId: approval.attempt.externalRunId,
      encryptedHandleRef: approval.attempt.encryptedHandleRef,
      runtimeGeneration: approval.attempt.runtimeGeneration,
    };
  }

  async expireApproval(
    input: Parameters<
      AgentApprovalContinuationTransactionPort["expireApproval"]
    >[0],
  ): Promise<SessionApprovalRecord> {
    return this.prisma
      .$transaction(async (tx: Prisma.TransactionClient) => {
        await lock(tx, [
          "approval-expire",
          input.organizationId,
          input.approvalId,
        ]);
        const approval = await tx.agentSessionApproval.findFirst({
          where: {
            id: input.approvalId,
            organizationId: input.organizationId,
            sessionId: input.sessionId,
          },
        });
        if (!approval) throw scope();
        if (approval.state === "expired") return mapApproval(approval, false);
        if (approval.state !== input.expectedState) throw state();
        const updated = await tx.agentSessionApproval.update({
          where: { id: approval.id },
          data: { state: "expired", decidedAt: new Date() },
        });
        return mapApproval(updated, true);
      })
      .catch(rethrowStable);
  }

  private async createApprovedContinuationOperation(
    input: ApprovalContinuationAttemptInput,
  ) {
    return this.prisma
      .$transaction(async (tx: Prisma.TransactionClient) => {
        input.signal.throwIfAborted();
        await lock(tx, [
          "attempt-operation-continuation",
          input.organizationId,
          input.attemptId,
          input.continuationKey,
        ]);
        const existing =
          await tx.agentExecutionAttemptOperationBinding.findFirst({
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
            existing.predecessorOperationRunId !==
            input.predecessorOperationRunId
          ) {
            throw conflict("AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT");
          }
          return {
            operationRunId: existing.operationRunId,
            attemptId: existing.executionAttemptId,
          };
        }
        const predecessor =
          await tx.agentExecutionAttemptOperationBinding.findFirst({
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
        const approvalBoundary =
          predecessor.operationRun.status === "attention_required";
        if (!lifecycleCancelled && !approvalBoundary) throw state();
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
        return {
          operationRunId: operationRun.id,
          attemptId: predecessor.attempt.id,
        };
      })
      .catch(rethrowStable);
  }

  async advanceApprovedContinuation(
    input: Parameters<
      AgentApprovalContinuationTransactionPort["advanceApprovedContinuation"]
    >[0],
  ) {
    input.signal.throwIfAborted();
    const approval = await this.prisma.agentSessionApproval.findFirst({
      where: {
        id: input.approvalId,
        organizationId: input.organizationId,
        sessionId: input.sessionId,
      },
      include: {
        continuation: true,
        operationBinding: {
          select: { id: true, operationRunId: true },
        },
        attempt: {
          select: {
            runtimeType: true,
            externalRunId: true,
            encryptedHandleRef: true,
            runtimeGeneration: true,
          },
        },
      },
    });
    if (!approval) throw scope();
    if (approval.state !== "approved" || !approval.continuation) throw state();
    if (
      approval.operationBinding.id !== approval.operationBindingId ||
      approval.operationBinding.operationRunId !==
        approval.predecessorOperationRunId ||
      !approval.attempt.externalRunId ||
      !approval.attempt.encryptedHandleRef
    )
      throw scope();
    if (approval.continuation.state === "interrupt_delivered") {
      if (!approval.continuation.successorOperationRunId) throw state();
      return mapApprovalContinuation(
        approval,
        approval.continuation.successorOperationRunId,
        "interrupt_delivered",
      );
    }
    const successor = await this.createApprovedContinuationOperation({
      signal: input.signal,
      organizationId: input.organizationId,
      sessionId: approval.sessionId,
      taskId: approval.taskId,
      executionId: approval.executionId,
      attemptId: approval.attemptId,
      predecessorOperationRunId: approval.predecessorOperationRunId,
      continuationKey: `approval:${approval.id}`,
    });
    await this.prisma
      .$transaction(async (tx: Prisma.TransactionClient) => {
        await lock(tx, [
          "approval-continuation",
          input.organizationId,
          input.approvalId,
        ]);
        const continuation =
          await tx.agentSessionApprovalContinuation.findFirst({
            where: {
              approvalId: input.approvalId,
              organizationId: input.organizationId,
            },
          });
        if (!continuation) throw state();
        if (
          continuation.successorOperationRunId !== null &&
          continuation.successorOperationRunId !== successor.operationRunId
        )
          throw conflict("AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT");
        if (continuation.state === "interrupt_delivered") return;
        await tx.agentSessionApprovalContinuation.update({
          where: { id: continuation.id },
          data: {
            successorOperationRunId: successor.operationRunId,
            state: "successor_created",
          },
        });
      })
      .catch(rethrowStable);
    return mapApprovalContinuation(
      approval,
      successor.operationRunId,
      "successor_created",
    );
  }

  async markApprovalContinuationInterruptDelivered(
    input: Parameters<
      AgentApprovalContinuationTransactionPort["markApprovalContinuationInterruptDelivered"]
    >[0],
  ): Promise<void> {
    const updated =
      await this.prisma.agentSessionApprovalContinuation.updateMany({
        where: {
          organizationId: input.organizationId,
          approvalId: input.approvalId,
          successorOperationRunId: input.operationRunId,
          state: { in: ["successor_created", "interrupt_delivered"] },
        },
        data: {
          state: "interrupt_delivered",
          interruptDeliveredAt: new Date(),
        },
      });
    if (updated.count !== 1) {
      const continuation =
        await this.prisma.agentSessionApprovalContinuation.findFirst({
          where: {
            organizationId: input.organizationId,
            approvalId: input.approvalId,
          },
          select: { successorOperationRunId: true, state: true },
        });
      if (
        !continuation ||
        continuation.successorOperationRunId !== input.operationRunId ||
        continuation.state !== "interrupt_delivered"
      )
        throw state();
    }
  }

  async listIncompleteApprovalContinuations(
    input: Parameters<
      AgentApprovalContinuationTransactionPort["listIncompleteApprovalContinuations"]
    >[0],
  ) {
    const continuations =
      await this.prisma.agentSessionApprovalContinuation.findMany({
        where: {
          ...(input.organizationId
            ? { organizationId: input.organizationId }
            : {}),
          state: { in: ["pending", "successor_created"] },
          approval: { state: "approved" },
        },
        select: {
          organizationId: true,
          approvalId: true,
          approval: { select: { sessionId: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: input.limit,
      });
    return continuations.map((continuation) => ({
      organizationId: continuation.organizationId,
      sessionId: continuation.approval.sessionId,
      approvalId: continuation.approvalId,
    }));
  }
}

function parseCanonicalUserEvent(
  value: Prisma.JsonValue,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw state();
  const userEvent = value.userEvent;
  if (!userEvent || typeof userEvent !== "object" || Array.isArray(userEvent)) {
    throw state();
  }
  if (
    typeof userEvent.externalEventId !== "string" ||
    userEvent.schemaVersion !== 1
  )
    throw state();
  return {
    externalEventId: userEvent.externalEventId,
    schemaVersion: 1,
    payload: UserMessageEventPayloadSchema.parse(userEvent.payload),
  };
}

function mapDelegation(
  row: { id: string; childTaskId: string; state: string },
  childExecutionId: string,
): DelegatedTaskRecord {
  return {
    delegationId: row.id,
    childTaskId: row.childTaskId,
    childExecutionId,
    state: row.state,
  };
}
function mapAttempt(row: {
  id: string;
  executionId: string;
  attemptNumber: number;
  runtimeType: string;
  externalRunId: string | null;
  encryptedHandleRef: string | null;
  runtimeGeneration: number;
  state: string;
}): ExecutionAttemptRecord {
  return {
    id: row.id,
    executionId: row.executionId,
    attemptNumber: row.attemptNumber,
    runtimeType: row.runtimeType,
    externalRunId: row.externalRunId,
    encryptedHandleRef: row.encryptedHandleRef,
    runtimeGeneration: row.runtimeGeneration,
    state: row.state,
  };
}
function mapApproval(
  row: { id: string; state: string; decisionIdempotencyKey: string | null },
  changed: boolean,
): SessionApprovalRecord {
  return {
    id: row.id,
    state: row.state,
    decisionIdempotencyKey: row.decisionIdempotencyKey,
    changed,
  };
}
async function ensureApprovalContinuation(
  tx: Prisma.TransactionClient,
  approval: { id: string; organizationId: string; state: string },
): Promise<void> {
  if (approval.state !== "approved") return;
  const existing = await tx.agentSessionApprovalContinuation.findFirst({
    where: { approvalId: approval.id, organizationId: approval.organizationId },
    select: { id: true },
  });
  if (existing) return;
  await tx.agentSessionApprovalContinuation.create({
    data: {
      organizationId: approval.organizationId,
      approvalId: approval.id,
      state: "pending",
    },
  });
}
function mapApprovalContinuation(
  approval: {
    id: string;
    attemptId: string;
    executionId: string;
    attempt: {
      runtimeType: string;
      externalRunId: string | null;
      encryptedHandleRef: string | null;
      runtimeGeneration: number;
    };
  },
  operationRunId: string,
  continuationState: "successor_created" | "interrupt_delivered",
) {
  if (!approval.attempt.externalRunId || !approval.attempt.encryptedHandleRef)
    throw state();
  return {
    approvalId: approval.id,
    operationRunId,
    attemptId: approval.attemptId,
    runtimeType: approval.attempt.runtimeType,
    executionId: approval.executionId,
    externalRunId: approval.attempt.externalRunId,
    encryptedHandleRef: approval.attempt.encryptedHandleRef,
    runtimeGeneration: approval.attempt.runtimeGeneration,
    state: continuationState,
  };
}
function mapArtifact(row: {
  id: string;
  sha256: string;
  lifecycle: string;
}): SessionArtifactRecord {
  return { id: row.id, sha256: row.sha256, lifecycle: row.lifecycle };
}

async function lock(
  tx: Prisma.TransactionClient,
  parts: string[],
): Promise<void> {
  const key = parts.join(":");
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}
function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  )
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  throw conflict("AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT");
}
function retryRunId(taskId: string, idempotencyKey: string): string {
  return `retry-${createHash("sha256")
    .update(canonicalJson([taskId, idempotencyKey]))
    .digest("hex")}`;
}
function toInputJson(
  value: Prisma.JsonValue,
): Prisma.InputJsonValue | Prisma.JsonNullValueInput {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}
function stringArray(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim()) ||
    new Set(value).size !== value.length
  )
    throw state();
  return value as string[];
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
function rethrowStable(error: unknown): never {
  if (error instanceof AgentSessionControlRepositoryError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002")
      throw conflict("AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT");
    if (error.code === "P2003") throw scope();
  }
  throw error;
}
