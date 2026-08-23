import { AgentWorkTaskStatusSchema } from "@kiditem/shared/agent-interaction";
import type { PrismaClient } from "@prisma/client";
import type {
  AgentWorkProjection,
  AgentWorkRepositoryPort,
  OrganizationScopedId,
} from "../../../../application/port/out/work/agent-work-repository.port";

export class PrismaAgentWorkRepository implements AgentWorkRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async loadProjection(
    input: OrganizationScopedId,
  ): Promise<AgentWorkProjection | null> {
    const session = await this.prisma.agentWorkSession.findFirst({
      where: input,
      include: { tasks: true },
    });
    if (!session) return null;
    return {
      session: { id: session.id, organizationId: session.organizationId },
      tasks: session.tasks.map((task) => ({
        id: task.id,
        organizationId: task.organizationId,
        sessionId: task.sessionId,
        status: AgentWorkTaskStatusSchema.parse(task.status),
      })),
    };
  }
}
