import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { PrismaService } from "../../../../../prisma/prisma.service";
import type {
  AgentSessionDeletionExecutionSnapshot,
  AgentSessionDeletionExecutionTransactionPort,
} from "../../../../application/port/out/transaction/session-deletion/agent-session-deletion-execution.transaction.port";

/**
 * A short ownership snapshot transaction. Provider cancellation and storage IO
 * intentionally happen in the application service after this transaction ends.
 */
@Injectable()
export class PrismaAgentSessionDeletionExecutionTransaction
  implements AgentSessionDeletionExecutionTransactionPort
{
  constructor(private readonly prisma: PrismaService) {}

  async loadFencedSnapshot(input: {
    signal: AbortSignal; organizationId: string; sessionId: string;
    operationRunId: string; attemptToken: string;
  }): Promise<AgentSessionDeletionExecutionSnapshot | { kind: "retryable"; code: string; consumedAttempts: number }> {
    input.signal.throwIfAborted();
    return this.prisma.$transaction(async (tx: PrismaClient) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-session-delete:${input.organizationId}:${input.sessionId}`}, 0))`);
      const session = await tx.agentSession.findFirst({
        where: {
          id: input.sessionId, organizationId: input.organizationId,
          lifecycle: "deleting", deletionOperationRunId: input.operationRunId,
        },
        select: {
          deletionOperationRunId: true,
        },
      });
      const deletion = await tx.agentSessionDeletionOperationBinding.findFirst({
        where: {
          organizationId: input.organizationId, sessionId: input.sessionId,
          operationRunId: input.operationRunId,
        },
        select: { retryGeneration: true, operationRun: { select: { attemptToken: true, attempts: true } } },
      });
      if (!session || !deletion || deletion.operationRun.attemptToken !== input.attemptToken) {
        return { kind: "retryable" as const, code: "SESSION_OPERATION_OWNERSHIP_INVALID", consumedAttempts: 1 };
      }
      const operations = await tx.agentSessionOperationRunOwnership.findMany({
        where: { organizationId: input.organizationId, sessionId: input.sessionId },
        select: { operationRunId: true, operationRun: { select: { operationKey: true, attemptToken: true } } },
        orderBy: { operationRunId: "asc" },
      });
      const attempts = await tx.agentExecutionAttempt.findMany({
        where: { organizationId: input.organizationId, sessionId: input.sessionId },
        select: {
          id: true, executionId: true, runtimeType: true, runtimeStartIntentId: true,
          externalRunId: true, encryptedHandleRef: true, runtimeGeneration: true,
        },
        orderBy: { id: "asc" },
      });
      const runtimeAttempts = attempts.map((attempt) => {
        const started = Boolean(attempt.runtimeStartIntentId || attempt.externalRunId || attempt.encryptedHandleRef);
        if (started && !attempt.runtimeStartIntentId) {
          throw new Error("SESSION_DELETION_INVARIANT");
        }
        if (!started) return {
          executionId: attempt.executionId, attemptId: attempt.id,
          runtimeType: attempt.runtimeType, state: "never_started" as const,
        };
        const handle = attempt.externalRunId && attempt.encryptedHandleRef ? {
          runtimeType: attempt.runtimeType, executionId: attempt.executionId,
          attemptId: attempt.id, externalRunId: attempt.externalRunId,
          encryptedHandleRef: attempt.encryptedHandleRef,
          generation: attempt.runtimeGeneration,
        } : null;
        return {
          executionId: attempt.executionId, attemptId: attempt.id,
          runtimeType: attempt.runtimeType, state: "started" as const,
          startIntentId: attempt.runtimeStartIntentId!, handle,
        };
      });
      const artifacts = await tx.agentSessionArtifact.findMany({
        where: { organizationId: input.organizationId, sessionId: input.sessionId },
        select: {
          id: true, materializationOperationRunId: true,
          materialization: { select: { providerUploadId: true } },
        },
        orderBy: { id: "asc" },
      });
      const operationRunIds = operations.map((entry) => entry.operationRunId);
      const closure = {
        deletionOperationRunId: session.deletionOperationRunId,
        operationRunIds,
        attempts: runtimeAttempts.map(({ handle: _handle, ...attempt }) => attempt),
        artifactIds: artifacts.map((artifact) => artifact.id),
      };
      return {
        retryGeneration: deletion.retryGeneration,
        consumedAttempts: deletion.operationRun.attempts,
        runtimeAttempts,
        operationRuns: operations,
        operationRunIds,
        artifacts: artifacts.map((artifact) => ({
          artifactId: artifact.id,
          materializationOperationRunId: artifact.materializationOperationRunId,
          providerUploadId: artifact.materialization?.providerUploadId ?? null,
        })),
        closureDigest: createHash("sha256").update(JSON.stringify(closure)).digest("hex"),
      };
    });
  }

  async terminalizeOwnedRun(input: { organizationId: string; sessionId: string; operationRunId: string; deletionOperationRunId: string; attemptToken: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const deletion = await tx.agentSessionDeletionOperationBinding.findFirst({
        where: {
          organizationId: input.organizationId, sessionId: input.sessionId,
          operationRunId: input.deletionOperationRunId,
          operationRun: { attemptToken: input.attemptToken },
        },
        select: { id: true },
      });
      const deleting = await tx.agentSession.findFirst({
        where: {
          id: input.sessionId, organizationId: input.organizationId,
          lifecycle: "deleting", deletionOperationRunId: input.deletionOperationRunId,
        }, select: { id: true },
      });
      if (!deletion || !deleting) throw new Error("SESSION_OPERATION_OWNERSHIP_INVALID");
      const result = await tx.operationRun.updateMany({
      where: {
        id: input.operationRunId, organizationId: input.organizationId,
        agentSessionOperationRunOwnership: { sessionId: input.sessionId, organizationId: input.organizationId },
      },
      data: { status: "cancelled", finishedAt: new Date(), errorCode: "agent_session_deleting" },
      });
      if (result.count !== 1) throw new Error("SESSION_OPERATION_OWNERSHIP_INVALID");
    });
  }
}
