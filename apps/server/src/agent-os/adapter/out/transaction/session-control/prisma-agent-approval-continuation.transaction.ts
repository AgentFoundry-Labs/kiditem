import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CanonicalResourceRefSchema } from "@kiditem/shared/agent-interaction";
import { z } from "zod";
import { PrismaService } from "../../../../../prisma/prisma.service";
import {
  AgentSessionControlRepositoryError,
  type SessionApprovalRecord,
} from "../../../../application/port/out/repository/session-control/agent-session-control.persistence.types";
import type { AgentApprovalContinuationTransactionPort } from "../../../../application/port/out/transaction/session-control/agent-approval-continuation.transaction.port";
import { continueOperationAttemptInTransaction } from "./internal/continue-operation-attempt";
import { lockWritableAgentSession } from "./internal/lock-writable-agent-session";

const TERMINAL_STATES = new Set([
  "archived",
  "completed",
  "succeeded",
  "failed",
  "cancelled",
]);

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
        await lockWritableAgentSession(tx, input);
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
        await lockWritableAgentSession(tx, input);
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
        await lockWritableAgentSession(tx, input);
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

  async advanceApprovedContinuation(
    input: Parameters<
      AgentApprovalContinuationTransactionPort["advanceApprovedContinuation"]
    >[0],
  ) {
    input.signal.throwIfAborted();
    return this.prisma
      .$transaction(async (tx: Prisma.TransactionClient) => {
        await lockWritableAgentSession(tx, input);
        const approval = await tx.agentSessionApproval.findFirst({
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
        if (approval.state !== "approved" || !approval.continuation)
          throw state();
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
        const successor = await continueOperationAttemptInTransaction(tx, {
          signal: input.signal,
          organizationId: input.organizationId,
          sessionId: approval.sessionId,
          taskId: approval.taskId,
          executionId: approval.executionId,
          attemptId: approval.attemptId,
          predecessorOperationRunId: approval.predecessorOperationRunId,
          continuationKey: `approval:${approval.id}`,
        });
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
        if (continuation.state !== "interrupt_delivered") {
          await tx.agentSessionApprovalContinuation.update({
            where: { id: continuation.id },
            data: {
              successorOperationRunId: successor.operationRunId,
              state: "successor_created",
            },
          });
        }
        return mapApprovalContinuation(
          approval,
          successor.operationRunId,
          "successor_created",
        );
      })
      .catch(rethrowStable);
  }

  async markApprovalContinuationInterruptDelivered(
    input: Parameters<
      AgentApprovalContinuationTransactionPort["markApprovalContinuationInterruptDelivered"]
    >[0],
  ): Promise<void> {
    await this.prisma
      .$transaction(async (tx: Prisma.TransactionClient) => {
        const current = await tx.agentSessionApprovalContinuation.findFirst({
          where: {
            organizationId: input.organizationId,
            approvalId: input.approvalId,
          },
          select: { approval: { select: { sessionId: true } } },
        });
        if (!current) throw state();
        await lockWritableAgentSession(tx, {
          organizationId: input.organizationId,
          sessionId: current.approval.sessionId,
        });
        const updated = await tx.agentSessionApprovalContinuation.updateMany({
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
            await tx.agentSessionApprovalContinuation.findFirst({
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
      })
      .catch(rethrowStable);
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
