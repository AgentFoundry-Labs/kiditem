import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../../../prisma/prisma.service";
import type { AgentSessionQueryRepositoryPort } from "../../../../application/port/out/repository/interaction/agent-session-query.repository.port";
import type {
  FindAccessibleAgentSessionInput,
  ListAgentSessionsInput,
  AgentSessionRecord,
  AgentSessionSummaryRecord,
} from "../../../../application/port/out/repository/interaction/agent-interaction.persistence.types";
import {
  boundedLimit,
  mapSession,
  mapSessionSummary,
  MAX_SESSION_LIST_LIMIT,
  sessionSelect,
} from "./internal/prisma-interaction.mapping";

@Injectable()
export class PrismaAgentSessionQueryRepository implements AgentSessionQueryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}
  async listSessions(
    input: ListAgentSessionsInput,
  ): Promise<AgentSessionSummaryRecord[]> {
    const rows = await this.prisma.agentSession.findMany({
      where: {
        organizationId: input.organizationId,
        createdByUserId: input.userId,
        lifecycle: { notIn: ["deleting", "delete_failed"] },
      },
      select: {
        id: true,
        organizationId: true,
        copilotThreadId: true,
        lifecycle: true,
        updatedAt: true,
        primaryAgentVersion: {
          select: { agentDefinitionKey: true, version: true },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: boundedLimit(input.limit, MAX_SESSION_LIST_LIMIT),
    });
    return rows.map(mapSessionSummary);
  }
  async findAccessibleSession(
    input: FindAccessibleAgentSessionInput,
  ): Promise<AgentSessionRecord | null> {
    const row = await this.prisma.agentSession.findFirst({
      where: {
        organizationId: input.organizationId,
        createdByUserId: input.userId,
        copilotThreadId: input.copilotThreadId,
        lifecycle: { notIn: ["deleting", "delete_failed"] },
      },
      select: sessionSelect,
    });
    return row ? mapSession(row) : null;
  }
}
