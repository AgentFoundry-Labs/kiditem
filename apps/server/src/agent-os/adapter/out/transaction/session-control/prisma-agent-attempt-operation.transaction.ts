import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../../prisma/prisma.service";
import {
  AgentSessionControlRepositoryError,
  type ExecutionAttemptRecord,
} from "../../../../application/port/out/repository/session-control/agent-session-control.persistence.types";
import type { AgentAttemptOperationTransactionPort } from "../../../../application/port/out/transaction/session-control/agent-attempt-operation.transaction.port";
import { continueOperationAttemptInTransaction } from "./internal/continue-operation-attempt";

const TERMINAL_STATES = new Set([
  "archived",
  "completed",
  "succeeded",
  "failed",
  "cancelled",
]);

@Injectable()
export class PrismaAgentAttemptOperationTransaction implements AgentAttemptOperationTransactionPort {
  constructor(private readonly prisma: PrismaService) {}

  async startAttempt(
    input: Parameters<AgentAttemptOperationTransactionPort["startAttempt"]>[0],
  ): Promise<ExecutionAttemptRecord> {
    return this.prisma
      .$transaction(async (tx: Prisma.TransactionClient) => {
        await lock(tx, ["attempt", input.executionId]);
        const execution = await tx.agentExecution.findFirst({
          where: {
            id: input.executionId,
            sessionId: input.sessionId,
            organizationId: input.organizationId,
          },
          select: { id: true },
        });
        if (!execution) throw scope();
        const existing = await tx.agentExecutionAttempt.findFirst({
          where: {
            executionId: input.executionId,
            idempotencyKey: input.idempotencyKey,
          },
        });
        if (existing) {
          if (
            existing.runtimeType !== input.runtimeType ||
            (input.externalRunId !== undefined &&
              existing.externalRunId !== input.externalRunId) ||
            (input.encryptedHandleRef !== undefined &&
              existing.encryptedHandleRef !== input.encryptedHandleRef)
          ) {
            throw conflict("AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT");
          }
          if (existing.state === "queued") {
            return mapAttempt(
              await tx.agentExecutionAttempt.update({
                where: { id: existing.id },
                data: { state: "running", startedAt: new Date() },
              }),
            );
          }
          return mapAttempt(existing);
        }
        const latest = await tx.agentExecutionAttempt.aggregate({
          where: { executionId: input.executionId },
          _max: { attemptNumber: true },
        });
        return mapAttempt(
          await tx.agentExecutionAttempt.create({
            data: {
              organizationId: input.organizationId,
              sessionId: input.sessionId,
              executionId: input.executionId,
              attemptNumber: (latest._max.attemptNumber ?? 0) + 1,
              idempotencyKey: input.idempotencyKey,
              runtimeType: input.runtimeType,
              externalRunId: input.externalRunId ?? null,
              encryptedHandleRef: input.encryptedHandleRef ?? null,
              runtimeGeneration: 0,
              state: "running",
            },
          }),
        );
      })
      .catch(rethrowStable);
  }

  async reserveAttemptForOperation(
    input: Parameters<
      AgentAttemptOperationTransactionPort["reserveAttemptForOperation"]
    >[0],
  ): Promise<ExecutionAttemptRecord> {
    return this.prisma
      .$transaction(async (tx: Prisma.TransactionClient) => {
        await lock(tx, ["attempt", input.executionId]);
        await lock(tx, [
          "attempt-operation",
          input.organizationId,
          input.operationRunId,
        ]);
        const execution = await tx.agentExecution.findFirst({
          where: {
            id: input.executionId,
            organizationId: input.organizationId,
            sessionId: input.sessionId,
            sessionTaskId: input.taskId,
            status: "running",
          },
          select: { id: true, runtimeType: true },
        });
        if (!execution) throw scope();
        const existing = await tx.agentExecutionAttempt.findFirst({
          where: {
            executionId: input.executionId,
            idempotencyKey: input.idempotencyKey,
          },
        });
        if (existing) {
          if (
            existing.organizationId !== input.organizationId ||
            existing.sessionId !== input.sessionId ||
            existing.executionId !== input.executionId ||
            existing.runtimeType !== execution.runtimeType
          )
            throw conflict("AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT");
          const binding =
            await tx.agentExecutionAttemptOperationBinding.findFirst({
              where: {
                organizationId: input.organizationId,
                executionAttemptId: existing.id,
                operationRunId: input.operationRunId,
              },
            });
          if (!binding)
            throw conflict("AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT");
          return mapAttempt(existing);
        }
        const existingOperation =
          await tx.agentExecutionAttemptOperationBinding.findFirst({
            where: {
              organizationId: input.organizationId,
              operationRunId: input.operationRunId,
            },
            include: { attempt: true },
          });
        if (existingOperation) {
          if (
            existingOperation.attempt.executionId !== input.executionId ||
            existingOperation.attempt.sessionId !== input.sessionId
          )
            throw conflict("AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT");
          return mapAttempt(existingOperation.attempt);
        }
        const latest = await tx.agentExecutionAttempt.aggregate({
          where: { executionId: input.executionId },
          _max: { attemptNumber: true },
        });
        const attempt = await tx.agentExecutionAttempt.create({
          data: {
            organizationId: input.organizationId,
            sessionId: input.sessionId,
            executionId: input.executionId,
            attemptNumber: (latest._max.attemptNumber ?? 0) + 1,
            idempotencyKey: input.idempotencyKey,
            runtimeType: execution.runtimeType,
            state: "queued",
          },
        });
        const operation = await tx.operationRun.findFirst({
          where: {
            id: input.operationRunId,
            organizationId: input.organizationId,
          },
          select: { id: true },
        });
        if (!operation) throw scope();
        await tx.agentExecutionAttemptOperationBinding.create({
          data: {
            organizationId: input.organizationId,
            executionAttemptId: attempt.id,
            executionId: attempt.executionId,
            sessionId: attempt.sessionId,
            operationRunId: operation.id,
            continuationKey: `initial:${operation.id}`,
          },
        });
        return mapAttempt(attempt);
      })
      .catch(rethrowStable);
  }

  async findAttemptForOperation(
    input: Parameters<
      AgentAttemptOperationTransactionPort["findAttemptForOperation"]
    >[0],
  ): Promise<ExecutionAttemptRecord | null> {
    const binding =
      await this.prisma.agentExecutionAttemptOperationBinding.findFirst({
        where: {
          organizationId: input.organizationId,
          operationRunId: input.operationRunId,
        },
        include: { attempt: true },
      });
    return binding ? mapAttempt(binding.attempt) : null;
  }

  async activateAttemptForOperation(
    input: Parameters<
      AgentAttemptOperationTransactionPort["activateAttemptForOperation"]
    >[0],
  ): Promise<ExecutionAttemptRecord> {
    return this.prisma
      .$transaction(async (tx: Prisma.TransactionClient) => {
        await lock(tx, [
          "attempt-operation-activate",
          input.organizationId,
          input.operationRunId,
        ]);
        const binding =
          await tx.agentExecutionAttemptOperationBinding.findFirst({
            where: {
              organizationId: input.organizationId,
              operationRunId: input.operationRunId,
            },
            include: { attempt: true },
          });
        if (
          !binding ||
          binding.attempt.sessionId !== input.sessionId ||
          binding.attempt.executionId !== input.executionId
        )
          throw scope();
        if (binding.attempt.state === "running")
          return mapAttempt(binding.attempt);
        if (binding.attempt.state !== "queued") throw state();
        return mapAttempt(
          await tx.agentExecutionAttempt.update({
            where: { id: binding.attempt.id },
            data: { state: "running", startedAt: new Date() },
          }),
        );
      })
      .catch(rethrowStable);
  }

  async finishAttempt(
    input: Parameters<AgentAttemptOperationTransactionPort["finishAttempt"]>[0],
  ): Promise<ExecutionAttemptRecord> {
    const current = await this.prisma.agentExecutionAttempt.findFirst({
      where: {
        id: input.attemptId,
        executionId: input.executionId,
        sessionId: input.sessionId,
        organizationId: input.organizationId,
      },
    });
    if (!current) throw scope();
    if (current.state === input.state) return mapAttempt(current);
    if (
      current.state !== input.expectedState ||
      TERMINAL_STATES.has(current.state)
    )
      throw state();
    const result = await this.prisma.agentExecutionAttempt.updateMany({
      where: { id: input.attemptId, state: input.expectedState },
      data: {
        state: input.state,
        finishedAt: new Date(),
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
      },
    });
    if (result.count !== 1) throw state();
    return mapAttempt(
      (await this.prisma.agentExecutionAttempt.findFirst({
        where: { id: input.attemptId, organizationId: input.organizationId },
      }))!,
    );
  }

  async persistAttemptHandle(
    input: Parameters<
      AgentAttemptOperationTransactionPort["persistAttemptHandle"]
    >[0],
  ): Promise<ExecutionAttemptRecord> {
    return this.prisma
      .$transaction(async (tx) => {
        await lock(tx, ["attempt-handle", input.executionId, input.attemptId]);
        const attempt = await tx.agentExecutionAttempt.findFirst({
          where: {
            id: input.attemptId,
            executionId: input.executionId,
            sessionId: input.sessionId,
            organizationId: input.organizationId,
          },
        });
        if (!attempt) throw scope();
        if (
          attempt.externalRunId === input.externalRunId &&
          attempt.encryptedHandleRef === input.encryptedHandleRef &&
          attempt.runtimeGeneration === input.runtimeGeneration &&
          attempt.runtimeType === input.runtimeType
        )
          return mapAttempt(attempt);
        if (
          attempt.state !== "running" ||
          attempt.runtimeType !== input.runtimeType ||
          attempt.externalRunId !== null ||
          attempt.encryptedHandleRef !== null
        )
          throw state();
        return mapAttempt(
          await tx.agentExecutionAttempt.update({
            where: { id: attempt.id },
            data: {
              externalRunId: input.externalRunId,
              encryptedHandleRef: input.encryptedHandleRef,
              runtimeGeneration: input.runtimeGeneration,
            },
          }),
        );
      })
      .catch(rethrowStable);
  }

  async continueOperationAttempt(
    input: Parameters<
      AgentAttemptOperationTransactionPort["continueOperationAttempt"]
    >[0],
  ) {
    return this.prisma
      .$transaction((tx: Prisma.TransactionClient) =>
        continueOperationAttemptInTransaction(tx, input),
      )
      .catch(rethrowStable);
  }
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
async function lock(
  tx: Prisma.TransactionClient,
  parts: string[],
): Promise<void> {
  const key = parts.join(":");
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
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
function rethrowStable(error: unknown): never {
  if (error instanceof AgentSessionControlRepositoryError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002")
      throw conflict("AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT");
    if (error.code === "P2003") throw scope();
  }
  throw error;
}
