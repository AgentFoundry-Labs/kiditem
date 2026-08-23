import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../../prisma/prisma.service";
import type { AgentAguiStartupRecoveryTransactionPort } from "../../../../application/port/out/transaction/interaction/agent-agui-startup-recovery.transaction.port";
import { lockWritableAgentSession } from "../session-control/internal/lock-writable-agent-session";

const options = { maxWait: 10_000, timeout: 30_000 } as const;
const RUNTIME_TYPE = "copilotkit_agui";

/**
 * Same-process AG-UI has no process-independent runtime to reconnect to. At
 * API boot, atomically turn every running durable work record into one
 * canonical failed terminal envelope and outbox row.
 */
@Injectable()
export class PrismaAgentAguiStartupRecoveryTransaction
  implements AgentAguiStartupRecoveryTransactionPort
{
  constructor(private readonly prisma: PrismaService) {}

  async failInterruptedInlineAguiRuns(input: { limit: number }): Promise<number> {
    const candidates = await this.prisma.agentExecutionAttempt.findMany({
      where: {
        runtimeType: RUNTIME_TYPE,
        state: "running",
        runtimeStartIntentId: { not: null },
        execution: { status: "running" },
      },
      select: {
        id: true,
        organizationId: true,
        sessionId: true,
        executionId: true,
        runtimeStartIntentId: true,
      },
      orderBy: [{ startedAt: "asc" }, { id: "asc" }],
      take: input.limit,
    });
    let recovered = 0;
    for (const candidate of candidates) {
      const terminalized = await this.prisma.$transaction(async (tx) => {
        await lockWritableAgentSession(tx, candidate);
        const [clock] = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`
          SELECT CURRENT_TIMESTAMP AS "now"
          FROM agent_sessions
          WHERE id = ${candidate.sessionId}::uuid
            AND organization_id = ${candidate.organizationId}::uuid
        `);
        if (!clock) throw new Error("AGUI_STARTUP_RECOVERY_CLOCK_UNAVAILABLE");
        const execution = await tx.agentExecution.updateMany({
          where: {
            id: candidate.executionId,
            organizationId: candidate.organizationId,
            sessionId: candidate.sessionId,
            runtimeType: RUNTIME_TYPE,
            status: "running",
          },
          data: {
            status: "failed",
            errorCode: "process_interrupted",
            finishedAt: clock.now,
          },
        });
        if (execution.count === 0) return false;
        const attempt = await tx.agentExecutionAttempt.updateMany({
          where: {
            id: candidate.id,
            organizationId: candidate.organizationId,
            sessionId: candidate.sessionId,
            executionId: candidate.executionId,
            runtimeType: RUNTIME_TYPE,
            runtimeStartIntentId: candidate.runtimeStartIntentId,
            state: "running",
          },
          data: {
            state: "failed",
            errorCode: "process_interrupted",
            errorMessage: "The in-process AG-UI runtime was interrupted by API restart.",
            finishedAt: clock.now,
          },
        });
        if (attempt.count !== 1)
          throw new Error("AGUI_STARTUP_RECOVERY_ATTEMPT_FENCE_INVALID");
        const session = await tx.agentSession.update({
          where: { id_organizationId: { id: candidate.sessionId, organizationId: candidate.organizationId } },
          data: { lastEventSequence: { increment: 1 } },
          select: { lastEventSequence: true },
        });
        const event = await tx.agentConversationEvent.create({
          data: {
            organizationId: candidate.organizationId,
            sessionId: candidate.sessionId,
            executionId: candidate.executionId,
            externalEventId: `${candidate.executionId}:agui:process_interrupted`,
            sequence: session.lastEventSequence,
            eventType: "run_terminal",
            schemaVersion: 1,
            payload: { status: "failed", errorCode: "process_interrupted" },
          },
          select: { id: true },
        });
        await tx.agentConversationOutbox.create({
          data: { organizationId: candidate.organizationId, eventId: event.id },
        });
        return true;
      }, options);
      if (terminalized) recovered += 1;
    }
    return recovered;
  }
}
