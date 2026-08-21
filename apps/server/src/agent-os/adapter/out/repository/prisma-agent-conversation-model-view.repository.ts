import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { AgentConversationEventContentSchema } from "@kiditem/shared/agent-interaction";
import { PrismaService } from "../../../../prisma/prisma.service";
import {
  AGENT_CONVERSATION_EVENT_TRANSACTION,
  type AgentConversationEventTransactionPort,
} from "../../../application/port/out/transaction/interaction/agent-conversation-event.transaction.port";
import type {
  AgentConversationModelViewRepositoryPort,
  CanonicalModelEventRecord,
} from "../../../application/port/out/repository/agent-conversation-model-view.repository.port";
import type { VersionedConversationSummary } from "../../../application/port/out/runtime/agent-durable-runtime.port";

@Injectable()
export class PrismaAgentConversationModelViewRepository implements AgentConversationModelViewRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AGENT_CONVERSATION_EVENT_TRANSACTION)
    private readonly interaction: AgentConversationEventTransactionPort,
  ) {}

  async listCanonicalEvents(input: {
    organizationId: string;
    sessionId: string;
  }): Promise<CanonicalModelEventRecord[]> {
    const rows = await this.prisma.agentConversationEvent.findMany({
      where: {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
      },
      select: {
        id: true,
        sequence: true,
        eventType: true,
        schemaVersion: true,
        payload: true,
      },
      orderBy: [{ sequence: "asc" }, { id: "asc" }],
    });
    return rows as CanonicalModelEventRecord[];
  }

  async findConversationSummary(input: {
    organizationId: string;
    sessionId: string;
    sourceFromSequence: bigint;
    sourceThroughSequence: bigint;
    sourceHash: string;
    summarizerModelIdentity: string;
    summaryPromptHash: string;
  }): Promise<VersionedConversationSummary | null> {
    const rows = await this.prisma.agentConversationEvent.findMany({
      where: {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        eventType: "state_snapshot",
      },
      select: { eventType: true, schemaVersion: true, payload: true },
      orderBy: [{ sequence: "desc" }, { id: "desc" }],
    });
    for (const row of rows) {
      const parsed = AgentConversationEventContentSchema.safeParse(row);
      if (
        !parsed.success ||
        parsed.data.eventType !== "state_snapshot" ||
        parsed.data.payload.snapshotType !== "conversation_summary"
      )
        continue;
      const data = parsed.data.payload.data;
      if (!("sourceFromSequence" in data)) continue;
      if (
        data.sourceFromSequence === input.sourceFromSequence.toString() &&
        data.sourceThroughSequence === input.sourceThroughSequence.toString() &&
        data.sourceHash === input.sourceHash &&
        data.summarizerModelIdentity === input.summarizerModelIdentity &&
        data.summaryPromptHash === input.summaryPromptHash
      )
        return data;
    }
    return null;
  }

  async createConversationSummary(input: {
    organizationId: string;
    sessionId: string;
    executionId: string;
    summary: VersionedConversationSummary;
  }): Promise<VersionedConversationSummary> {
    const identity = createHash("sha256")
      .update(JSON.stringify(input.summary))
      .digest("hex");
    const saved = await this.interaction.appendExecutionEvent({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      executionId: input.executionId,
      externalEventId: `conversation-summary:${identity}`,
      eventType: "state_snapshot",
      schemaVersion: 1,
      payload: {
        snapshotType: "conversation_summary",
        snapshotVersion: 1,
        data: input.summary,
      },
    });
    const parsed = AgentConversationEventContentSchema.parse(saved);
    if (
      parsed.eventType !== "state_snapshot" ||
      parsed.payload.snapshotType !== "conversation_summary" ||
      !("sourceFromSequence" in parsed.payload.data)
    )
      throw new Error("AGENT_CONTEXT_SUMMARY_PERSISTENCE_INVALID");
    return parsed.payload.data;
  }
}
