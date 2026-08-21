import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  AgentConversationEventContentSchema,
  type AgentConversationEventContent,
} from "@kiditem/shared/agent-interaction";
import { PrismaService } from "../../../../../prisma/prisma.service";
import { AgentOsBoundaryError } from "../../../../domain/agent-os.errors";
import type { AgentConversationEventTransactionPort } from "../../../../application/port/out/transaction/interaction/agent-conversation-event.transaction.port";
import type {
  AgentConversationEventRecord,
  AppendExecutionEventInput,
  MarkAgentExecutionTerminalInput,
} from "../../../../application/port/out/repository/interaction/agent-interaction.persistence.types";
import {
  eventSelect,
  mapEvent,
  sessionSelect,
  type EventRow,
  type SessionRow,
} from "../../repository/interaction/internal/prisma-interaction.mapping";
const options = { maxWait: 10_000, timeout: 30_000 } as const;
@Injectable()
export class PrismaAgentConversationEventTransaction implements AgentConversationEventTransactionPort {
  constructor(private readonly prisma: PrismaService) {}
  async appendExecutionEvent(
    unsafeInput: AppendExecutionEventInput,
  ): Promise<AgentConversationEventRecord> {
    const content = parseContent(unsafeInput);
    const input: AppendExecutionEventInput = {
      ...unsafeInput,
      ...content,
      terminal: unsafeInput.terminal
        ? {
            ...unsafeInput.terminal,
            finishedAt: new Date(unsafeInput.terminal.finishedAt),
          }
        : undefined,
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        let session = await lockSession(
          tx,
          input.organizationId,
          input.sessionId,
        );
        if (!session) throw sessionNotFound();
        validateTerminalEnvelope(input);
        const existing = await findEvent(tx, input);
        if (existing) {
          await assertMatch(tx, existing, input);
          return mapEvent(existing);
        }
        const execution = input.executionId
          ? await tx.agentExecution.findFirst({
              where: {
                id: input.executionId,
                organizationId: input.organizationId,
                sessionId: input.sessionId,
              },
              select: { id: true },
            })
          : null;
        if (input.executionId && !execution) throw scopeInvalid();
        if (input.terminal && execution)
          await terminal(tx, {
            organizationId: input.organizationId,
            id: execution.id,
            ...input.terminal,
          });
        session = await tx.agentSession.update({
          where: {
            id_organizationId: {
              id: session.id,
              organizationId: session.organizationId,
            },
          },
          data: { lastEventSequence: { increment: 1 } },
          select: sessionSelect,
        });
        if (!session) throw sessionNotFound();
        const event = await tx.agentConversationEvent.create({
          data: {
            organizationId: input.organizationId,
            sessionId: input.sessionId,
            executionId: input.executionId,
            externalEventId: input.externalEventId,
            sequence: session.lastEventSequence,
            eventType: input.eventType,
            schemaVersion: input.schemaVersion,
            payload: input.payload as Prisma.InputJsonValue,
          },
          select: eventSelect,
        });
        await tx.agentConversationOutbox.create({
          data: { organizationId: input.organizationId, eventId: event.id },
        });
        return mapEvent(event);
      }, options);
    } catch (error) {
      if (known(error, "P2002")) {
        const existing = await findEvent(this.prisma, input);
        if (!existing) throw conflict();
        await assertMatch(this.prisma, existing, input);
        return mapEvent(existing);
      }
      if (known(error, "P2003")) throw scopeInvalid();
      throw error;
    }
  }
  async markExecutionTerminal(
    input: MarkAgentExecutionTerminalInput,
  ): Promise<void> {
    validateTerminal(input.status, input.errorCode);
    await this.prisma.$transaction((tx) => terminal(tx, input), options);
  }
}
async function lockSession(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sessionId: string,
): Promise<SessionRow | null> {
  const [locked] = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id::text AS "id" FROM agent_sessions WHERE id = ${sessionId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
  return locked
    ? tx.agentSession.findFirst({
        where: { id: locked.id, organizationId },
        select: sessionSelect,
      })
    : null;
}
function findEvent(
  client: Pick<PrismaService, "agentConversationEvent">,
  input: Pick<AppendExecutionEventInput, "organizationId" | "externalEventId">,
): Promise<EventRow | null> {
  return client.agentConversationEvent.findFirst({
    where: {
      organizationId: input.organizationId,
      externalEventId: input.externalEventId,
    },
    select: eventSelect,
  });
}
function parseContent(
  input: Pick<
    AppendExecutionEventInput,
    "eventType" | "schemaVersion" | "payload"
  >,
): AgentConversationEventContent {
  const result = AgentConversationEventContentSchema.safeParse({
    eventType: input.eventType,
    schemaVersion: input.schemaVersion,
    payload: input.payload,
  });
  if (!result.success) throw envelopeInvalid();
  return result.data;
}
function validateTerminalEnvelope(input: AppendExecutionEventInput): void {
  if (!input.terminal) {
    if (input.eventType === "run_terminal") throw terminalInvalid();
    return;
  }
  if (!input.executionId || input.eventType !== "run_terminal")
    throw terminalInvalid();
  validateTerminal(input.terminal.status, input.terminal.errorCode);
  const payload = input.payload as Record<string, unknown>;
  if (
    payload.status !== input.terminal.status ||
    payload.errorCode !== input.terminal.errorCode
  )
    throw terminalInvalid();
}
async function assertMatch(
  client: Pick<PrismaService, "agentExecution">,
  existing: EventRow,
  input: AppendExecutionEventInput,
): Promise<void> {
  if (
    existing.organizationId !== input.organizationId ||
    existing.sessionId !== input.sessionId ||
    existing.executionId !== input.executionId ||
    existing.externalEventId !== input.externalEventId ||
    existing.eventType !== input.eventType ||
    existing.schemaVersion !== input.schemaVersion ||
    !equal(existing.payload, input.payload)
  )
    throw conflict();
  if (!input.terminal) return;
  const execution = await client.agentExecution.findFirst({
    where: {
      id: input.executionId ?? undefined,
      organizationId: input.organizationId,
      sessionId: input.sessionId,
    },
    select: { status: true, errorCode: true },
  });
  if (
    !execution ||
    execution.status !== input.terminal.status ||
    execution.errorCode !== input.terminal.errorCode
  )
    throw conflict();
}
async function terminal(
  tx: Pick<Prisma.TransactionClient, "agentExecution">,
  input: {
    organizationId: string;
    id: string;
    status: "completed" | "failed" | "cancelled";
    errorCode: string | null;
    finishedAt: Date;
  },
): Promise<void> {
  validateTerminal(input.status, input.errorCode);
  const result = await tx.agentExecution.updateMany({
    where: {
      id: input.id,
      organizationId: input.organizationId,
      status: "running",
    },
    data: {
      status: input.status,
      errorCode: input.errorCode,
      finishedAt: input.finishedAt,
    },
  });
  if (result.count !== 1)
    throw new AgentOsBoundaryError(
      "INTERACTION_EXECUTION_NOT_RUNNING",
      "Interaction execution was not found in scope or is already terminal.",
    );
}
function validateTerminal(status: string, errorCode: string | null): void {
  if (
    !["completed", "failed", "cancelled"].includes(status) ||
    (status === "completed" && errorCode !== null)
  )
    throw terminalInvalid();
}
function equal(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}
function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw conflict();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  throw conflict();
}
function known(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}
function conflict(): AgentOsBoundaryError {
  return new AgentOsBoundaryError(
    "INTERACTION_EVENT_CONFLICT",
    "The external event identity already exists with different immutable input.",
  );
}
function envelopeInvalid(): AgentOsBoundaryError {
  return new AgentOsBoundaryError(
    "INTERACTION_EVENT_ENVELOPE_INVALID",
    "Interaction event type, schema version, and payload must match.",
  );
}
function scopeInvalid(): AgentOsBoundaryError {
  return new AgentOsBoundaryError(
    "INTERACTION_SCOPE_INVALID",
    "Interaction graph references do not belong to the requested organization and session.",
  );
}
function sessionNotFound(): AgentOsBoundaryError {
  return new AgentOsBoundaryError(
    "INTERACTION_SESSION_NOT_FOUND",
    "The interaction session was not found in the requested organization.",
  );
}
function terminalInvalid(): AgentOsBoundaryError {
  return new AgentOsBoundaryError(
    "INTERACTION_EXECUTION_TERMINAL_INVALID",
    "Terminal status, error, event payload, and execution identity must agree.",
  );
}
