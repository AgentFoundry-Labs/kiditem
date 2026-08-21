import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../../../prisma/prisma.service";
import { AgentOsBoundaryError } from "../../../../domain/agent-os.errors";
import { lockWritableAgentSession } from "../session-control/internal/lock-writable-agent-session";
import type { AgentExecutionUsageTransactionPort } from "../../../../application/port/out/transaction/interaction/agent-execution-usage.transaction.port";
import type { RecordAgentExecutionUsageInput } from "../../../../application/port/out/repository/interaction/agent-interaction.persistence.types";
@Injectable()
export class PrismaAgentExecutionUsageTransaction implements AgentExecutionUsageTransactionPort {
  constructor(private readonly prisma: PrismaService) {}
  async recordExecutionUsage(
    input: RecordAgentExecutionUsageInput,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const session = await tx.agentSession.findFirst({
          where: {
            organizationId: input.organizationId,
            executions: { some: { id: input.executionId } },
          },
          select: { id: true },
        });
        if (!session)
          throw new AgentOsBoundaryError(
            "INTERACTION_USAGE_EXECUTION_NOT_FOUND",
            "Interaction execution was not found in the requested organization.",
          );
        await lockWritableAgentSession(tx, {
          organizationId: input.organizationId,
          sessionId: session.id,
        });
        const execution = await tx.agentExecution.findFirst({
          where: {
            id: input.executionId,
            organizationId: input.organizationId,
            sessionId: session.id,
          },
          select: { id: true, modelIdentity: true },
        });
        if (!execution)
          throw new AgentOsBoundaryError(
            "INTERACTION_USAGE_EXECUTION_NOT_FOUND",
            "Interaction execution was not found in the requested organization.",
          );
        if (input.modelIdentity !== execution.modelIdentity)
          throw new AgentOsBoundaryError(
            "INTERACTION_USAGE_MODEL_MISMATCH",
            "Usage model identity does not match the canonical execution model.",
          );
        await tx.agentExecutionUsage.create({
          data: {
            organizationId: input.organizationId,
            executionId: execution.id,
            modelIdentity: execution.modelIdentity,
            provider: input.provider,
            inputTokens: input.inputTokens,
            outputTokens: input.outputTokens,
            costMicros: input.costMicros,
            currency: input.currency,
          },
        });
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  }
}
