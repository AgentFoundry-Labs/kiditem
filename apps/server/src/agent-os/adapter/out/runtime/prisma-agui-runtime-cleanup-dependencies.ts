import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";
import { AgentAguiInProcessRunRegistry } from "../../../application/service/agent-agui-in-process-run-registry.service";
import { lockAgentSessionForDeletion } from "../transaction/session-control/internal/lock-writable-agent-session";
import type {
  AguiRuntimeCleanupDependencies,
  AguiStartIntent,
} from "../../../application/port/out/runtime/agent-agui-runtime-cleanup.port";
import type {
  RuntimeHandle,
  RuntimeInspection,
} from "../../../application/port/out/runtime/agent-durable-runtime.port";

const AGUI_RUNTIME_TYPE = "copilotkit_agui";

/**
 * Persists revocation before asking the current process to stop. A recreated
 * process has no local run to inspect, but the exact start-intent generation
 * and execution have already been invalidated in the database.
 */
@Injectable()
export class PrismaAguiRuntimeCleanupDependencies implements AguiRuntimeCleanupDependencies {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activeRuns: AgentAguiInProcessRunRegistry,
  ) {}

  async invalidate(input: AguiStartIntent): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const session = await lockAgentSessionForDeletion(tx, {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
      });
      if (
        !session ||
        session.lifecycle !== "deleting" ||
        session.deletionOperationRunId !== input.deletionOperationRunId
      )
        throw new Error("AGUI_RUNTIME_CLEANUP_DELETION_AUTHORITY_INVALID");
      const deletion = await tx.agentSessionDeletionOperationBinding.findUnique(
        {
          where: {
            operationRunId_organizationId: {
              operationRunId: input.deletionOperationRunId,
              organizationId: input.organizationId,
            },
          },
          select: {
            sessionId: true,
            operationRun: { select: { attemptToken: true } },
          },
        },
      );
      if (
        !deletion ||
        deletion.sessionId !== input.sessionId ||
        deletion.operationRun.attemptToken !== input.deletionAttemptToken
      )
        throw new Error("AGUI_RUNTIME_CLEANUP_DELETION_AUTHORITY_INVALID");
      const attempt = await tx.agentExecutionAttempt.findFirst({
        where: {
          id: input.attemptId,
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          executionId: input.executionId,
          runtimeType: AGUI_RUNTIME_TYPE,
          runtimeStartIntentId: input.startIntentId,
        },
        select: { id: true, state: true },
      });
      if (!attempt) throw new Error("AGUI_RUNTIME_CLEANUP_COORDINATE_INVALID");

      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>(
        Prisma.sql`
          SELECT CURRENT_TIMESTAMP AS "now"
          FROM agent_sessions
          WHERE id = ${input.sessionId}::uuid
            AND organization_id = ${input.organizationId}::uuid
        `,
      );
      if (!clock) throw new Error("AGUI_RUNTIME_CLEANUP_CLOCK_UNAVAILABLE");

      if (attempt.state !== "cancelled") {
        await tx.agentExecutionAttempt.update({
          where: { id: attempt.id },
          data: {
            state: "cancelled",
            finishedAt: clock.now,
            runtimeCredentialGeneration: { increment: 1 },
          },
        });
      }

      const execution = await tx.agentExecution.findFirst({
        where: {
          id: input.executionId,
          organizationId: input.organizationId,
          sessionId: input.sessionId,
        },
        select: { id: true, status: true },
      });
      if (!execution)
        throw new Error("AGUI_RUNTIME_CLEANUP_COORDINATE_INVALID");
      if (execution.status === "running") {
        await tx.agentExecution.update({
          where: { id: execution.id },
          data: {
            status: "cancelled",
            errorCode: "agent_session_deleting",
            finishedAt: clock.now,
          },
        });
      }
    });
    // Persisted revocation is complete. Seal before `stop()` so even a local
    // handle-shape failure cannot let a request paused before registration
    // begin with this exact, now-revoked start intent.
    this.activeRuns.seal(input);
  }

  async stop(
    input: AguiStartIntent & {
      handle: RuntimeHandle | null;
      signal: AbortSignal;
    },
  ): Promise<RuntimeInspection> {
    if (input.handle !== null) throw new Error("AGUI_RUNTIME_HANDLE_NOT_OWNED");
    return this.activeRuns.stopAndInspect(input, input.signal);
  }
}
