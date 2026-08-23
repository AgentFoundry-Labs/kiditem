import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  AdmitRootTaskInput,
  AdmitRootTaskResult,
  AgentWorkTransactionPort,
} from "../../../../application/port/out/work/agent-work-transaction.port";

export class PrismaAgentWorkTransaction implements Pick<
  AgentWorkTransactionPort,
  "admitRootTask"
> {
  constructor(private readonly prisma: PrismaClient) {}

  async admitRootTask(input: AdmitRootTaskInput): Promise<AdmitRootTaskResult> {
    return this.prisma.$transaction(async (tx) => {
      const session = input.sessionId
        ? await tx.agentWorkSession.findFirstOrThrow({
            where: {
              id: input.sessionId,
              organizationId: input.organizationId,
            },
          })
        : await tx.agentWorkSession.create({
            data: {
              organizationId: input.organizationId,
              createdByUserId: input.createdByUserId,
            },
          });
      const task = await tx.agentWorkTask.create({
        data: {
          organizationId: input.organizationId,
          sessionId: session.id,
          assignedAgentVersionId: input.assignedAgentVersionId,
          objective: input.objective,
          completionCriteria: input.completionCriteria,
          inputResourceRefs: input.inputResourceRefs as Prisma.InputJsonValue,
        },
      });
      return {
        session: { id: session.id, organizationId: session.organizationId },
        task: {
          id: task.id,
          organizationId: task.organizationId,
          sessionId: task.sessionId,
        },
      };
    });
  }
}
