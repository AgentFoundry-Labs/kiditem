import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../../../prisma/prisma.service";
import type { AgentConversationQueryRepositoryPort } from "../../../../application/port/out/repository/interaction/agent-conversation-query.repository.port";
import type {
  ConversationEventPage,
  ModelConversationPage,
  ReadConversationEventsInput,
} from "../../../../application/port/out/repository/interaction/agent-interaction.persistence.types";
import {
  boundedLimit,
  eventSelect,
  mapEvent,
  MAX_REPLAY_LIMIT,
} from "./internal/prisma-interaction.mapping";
@Injectable()
export class PrismaAgentConversationQueryRepository implements AgentConversationQueryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}
  async readConversationEvents(
    input: ReadConversationEventsInput,
  ): Promise<ConversationEventPage> {
    const session = await this.prisma.agentSession.findFirst({
      where: {
        id: input.sessionId,
        organizationId: input.organizationId,
        createdByUserId: input.userId,
      },
      select: { id: true },
    });
    if (!session) return { events: [], lastSequence: 0n, hasMore: false };
    const limit = boundedLimit(input.limit, MAX_REPLAY_LIMIT);
    const rows = await this.prisma.agentConversationEvent.findMany({
      where: {
        organizationId: input.organizationId,
        sessionId: session.id,
        sequence: { gt: input.afterSequence },
      },
      select: eventSelect,
      orderBy: [{ sequence: "asc" }, { id: "asc" }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      events: page.map(mapEvent),
      lastSequence: page.at(-1)?.sequence ?? input.afterSequence,
      hasMore: rows.length > limit,
    };
  }
  async readModelConversation(input: {
    organizationId: string;
    sessionId: string;
    throughSequence: bigint;
    limit: number;
  }): Promise<ModelConversationPage> {
    const limit = boundedLimit(input.limit, MAX_REPLAY_LIMIT);
    const rows = await this.prisma.agentConversationEvent.findMany({
      where: {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        sequence: { lte: input.throughSequence },
      },
      select: eventSelect,
      orderBy: [{ sequence: "asc" }, { id: "asc" }],
      take: limit + 1,
    });
    return {
      events: rows.slice(0, limit).map(mapEvent),
      hasMore: rows.length > limit,
    };
  }
}
