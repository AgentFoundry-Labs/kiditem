import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AgentConversationEventContentSchema } from "@kiditem/shared/agent-interaction";
import { PrismaService } from "../../../../../prisma/prisma.service";
import { AgentOsBoundaryError } from "../../../../domain/agent-os.errors";
import type { AgentRunAuthorizationTransactionPort } from "../../../../application/port/out/transaction/interaction/agent-run-authorization.transaction.port";
import type {
  AuthorizeAgentExecutionInput,
  AuthorizedExecutionRecord,
} from "../../../../application/port/out/repository/interaction/agent-interaction.persistence.types";
import {
  eventSelect,
  executionSelect,
  mapEvent,
  mapExecution,
  mapPolicy,
  mapSession,
  mapTask,
  policySelect,
  sessionSelect,
  taskSelect,
  type ExecutionRow,
  type PolicyRow,
  type SessionRow,
  type TaskRow,
} from "../../repository/interaction/internal/prisma-interaction.mapping";
import { lockWritableAgentSession } from "../session-control/internal/lock-writable-agent-session";
const options = { maxWait: 10_000, timeout: 30_000 } as const;
const ROOT_TASK_IDEMPOTENCY_KEY = "root";
class SessionAppearedAfterAuthorizationLockError extends Error {}
@Injectable()
export class PrismaAgentRunAuthorizationTransaction implements AgentRunAuthorizationTransactionPort {
  constructor(private readonly prisma: PrismaService) {}
  async authorizeExecution(
    unsafeInput: AuthorizeAgentExecutionInput,
  ): Promise<AuthorizedExecutionRecord> {
    const parsed = AgentConversationEventContentSchema.safeParse({
      eventType: "user_message",
      schemaVersion: unsafeInput.userEvent.schemaVersion,
      payload: unsafeInput.userEvent.payload,
    });
    if (!parsed.success || parsed.data.eventType !== "user_message")
      throw envelopeInvalid();
    const input: AuthorizeAgentExecutionInput = {
      ...unsafeInput,
      capabilityKeys: [...unsafeInput.capabilityKeys],
      userEvent: {
        externalEventId: unsafeInput.userEvent.externalEventId,
        schemaVersion: parsed.data.schemaVersion,
        payload: parsed.data.payload,
      },
    };
    for (let retry = 0; retry < 3; retry += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
        let session = await sessionForThread(
          tx,
          input.organizationId,
          input.copilotThreadId,
        );
        if (session) {
          const lockedSessionId = session.id;
          await lockWritableAgentSession(tx, {
            organizationId: input.organizationId,
            sessionId: lockedSessionId,
          });
          await lock(tx, input);
          session = await sessionForThread(
            tx,
            input.organizationId,
            input.copilotThreadId,
          );
          if (!session || session.id !== lockedSessionId) throw scopeInvalid();
        } else {
          await lock(tx, input);
          session = await sessionForThread(
            tx,
            input.organizationId,
            input.copilotThreadId,
          );
          if (session) throw new SessionAppearedAfterAuthorizationLockError();
        }
        await principal(tx, input);
        let createdSession = false;
        let rootTask: TaskRow;
        if (session) {
          assertSession(session, input);
          rootTask = await root(tx, session.id, input.organizationId);
          const existing = await existingExecution(tx, input);
          if (existing)
            return existingAuthorization(
              tx,
              input,
              session,
              rootTask,
              existing,
            );
          await activeVersion(tx, input);
        } else {
          await activeVersion(tx, input);
          await authority(tx, input);
          session = await tx.agentSession.create({
            data: {
              organizationId: input.organizationId,
              createdByUserId: input.userId,
              copilotThreadId: input.copilotThreadId,
              primaryAgentVersionId: input.agentVersionId,
              authorityProfileVersionId: input.authorityProfileVersionId,
              contextEpoch: 1,
              lifecycle: "active",
            },
            select: sessionSelect,
          });
          createdSession = true;
          rootTask = await tx.agentSessionTask.create({
            data: {
              organizationId: input.organizationId,
              sessionId: session.id,
              assignedAgentVersionId: input.agentVersionId,
              objective: null,
              isRoot: true,
              status: "interpreting",
              idempotencyKey: ROOT_TASK_IDEMPOTENCY_KEY,
            },
            select: taskSelect,
          });
          await tx.agentContextEpoch.create({
            data: {
              organizationId: input.organizationId,
              sessionId: session.id,
              epoch: 1,
            },
          });
        }
        if (!session) throw scopeInvalid();
        const policy = await policySnapshot(tx, session.id, input);
        const execution = await tx.agentExecution.create({
          data: {
            organizationId: input.organizationId,
            sessionId: session.id,
            sessionTaskId: rootTask.id,
            copilotThreadId: input.copilotThreadId,
            aguiRunId: input.aguiRunId,
            agentVersionId: input.agentVersionId,
            runtimeType: input.runtimeType,
            modelIdentity: input.modelIdentity,
            policySnapshotId: policy.id,
            inputHash: input.inputHash,
            currentInput: (input.currentInput ?? {}) as Prisma.InputJsonValue,
            resourceRefs: (input.currentResourceRefs ??
              []) as Prisma.InputJsonValue,
            attempt: 1,
            status: "running",
          },
          select: executionSelect,
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
        const event = await tx.agentConversationEvent.create({
          data: {
            organizationId: input.organizationId,
            sessionId: session.id,
            executionId: execution.id,
            externalEventId: input.userEvent.externalEventId,
            sequence: session.lastEventSequence,
            eventType: "user_message",
            schemaVersion: input.userEvent.schemaVersion,
            payload: input.userEvent.payload as Prisma.InputJsonValue,
          },
          select: eventSelect,
        });
        await tx.agentConversationOutbox.create({
          data: { organizationId: input.organizationId, eventId: event.id },
        });
        return result(
          createdSession,
          session,
          rootTask,
          policy,
          execution,
          event,
        );
        }, options);
      } catch (error) {
        if (error instanceof SessionAppearedAfterAuthorizationLockError) {
          if (retry < 2) continue;
          throw runConflict();
        }
        if (known(error, "P2002")) throw runConflict();
        if (known(error, "P2003")) throw scopeInvalid();
        throw error;
      }
    }
    throw runConflict();
  }
}
async function lock(
  tx: Prisma.TransactionClient,
  input: AuthorizeAgentExecutionInput,
): Promise<void> {
  const key = JSON.stringify([
    "agent-interaction",
    "authorize-execution",
    input.organizationId,
    input.userId,
    input.copilotThreadId,
  ]);
  await tx.$queryRaw`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; transaction-only key includes organization, actor, and thread and reads no tenant row.
    SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text AS "lock"
  `;
}
async function principal(
  tx: Prisma.TransactionClient,
  input: AuthorizeAgentExecutionInput,
): Promise<void> {
  const found = await tx.organizationMembership.findFirst({
    where: {
      organizationId: input.organizationId,
      userId: input.userId,
      status: "active",
    },
    select: { id: true },
  });
  if (!found)
    throw new AgentOsBoundaryError(
      "INTERACTION_PRINCIPAL_NOT_ALLOWED",
      "The interaction principal is not an active organization member.",
    );
}
async function activeVersion(
  tx: Prisma.TransactionClient,
  input: AuthorizeAgentExecutionInput,
): Promise<void> {
  const row = await tx.agentVersion.findFirst({
    where: {
      id: input.agentVersionId,
      runtimeType: input.runtimeType,
      modelIdentity: input.modelIdentity,
      activatedAt: { not: null },
      retiredAt: null,
    },
    select: { id: true },
  });
  if (!row)
    throw new AgentOsBoundaryError(
      "INTERACTION_AGENT_NOT_ACTIVE",
      "The selected active agent version does not match runtime and model.",
    );
}
async function sessionForThread(
  tx: Prisma.TransactionClient,
  organizationId: string,
  copilotThreadId: string,
): Promise<SessionRow | null> {
  return tx.agentSession.findFirst({
    where: { organizationId, copilotThreadId },
    select: sessionSelect,
  });
}
function assertSession(
  session: SessionRow,
  input: AuthorizeAgentExecutionInput,
): void {
  if (
    session.createdByUserId !== input.userId ||
    session.primaryAgentVersionId !== input.agentVersionId ||
    session.authorityProfileVersionId !== input.authorityProfileVersionId
  )
    throw runConflict();
  if (session.lifecycle !== "active")
    throw new AgentOsBoundaryError(
      "INTERACTION_SESSION_NOT_ACTIVE",
      "The canonical interaction session is not active.",
    );
}
async function root(
  tx: Prisma.TransactionClient,
  sessionId: string,
  organizationId: string,
): Promise<TaskRow> {
  const row = await tx.agentSessionTask.findFirst({
    where: { sessionId, organizationId, isRoot: true },
    select: taskSelect,
  });
  if (!row)
    throw new AgentOsBoundaryError(
      "INTERACTION_ROOT_TASK_NOT_FOUND",
      "The canonical session root task is missing.",
    );
  return row;
}
function existingExecution(
  tx: Prisma.TransactionClient,
  input: AuthorizeAgentExecutionInput,
): Promise<ExecutionRow | null> {
  return tx.agentExecution.findFirst({
    where: {
      organizationId: input.organizationId,
      copilotThreadId: input.copilotThreadId,
      aguiRunId: input.aguiRunId,
    },
    select: executionSelect,
  });
}
async function existingAuthorization(
  tx: Prisma.TransactionClient,
  input: AuthorizeAgentExecutionInput,
  session: SessionRow,
  rootTask: TaskRow,
  execution: ExecutionRow,
): Promise<AuthorizedExecutionRecord> {
  const [policy, event] = await Promise.all([
    tx.agentPolicySnapshot.findFirst({
      where: {
        id: execution.policySnapshotId,
        organizationId: input.organizationId,
      },
      select: policySelect,
    }),
    tx.agentConversationEvent.findFirst({
      where: {
        organizationId: input.organizationId,
        sessionId: session.id,
        executionId: execution.id,
        eventType: "user_message",
      },
      select: eventSelect,
      orderBy: [{ sequence: "asc" }, { id: "asc" }],
    }),
  ]);
  if (
    !policy ||
    !event ||
    execution.sessionId !== session.id ||
    execution.sessionTaskId !== rootTask.id ||
    execution.copilotThreadId !== input.copilotThreadId ||
    execution.aguiRunId !== input.aguiRunId ||
    execution.agentVersionId !== input.agentVersionId ||
    execution.runtimeType !== input.runtimeType ||
    execution.modelIdentity !== input.modelIdentity ||
    execution.inputHash !== input.inputHash ||
    execution.attempt !== 1 ||
    policy.sessionId !== session.id ||
    policy.agentVersionId !== input.agentVersionId ||
    policy.authorityProfileVersionId !== input.authorityProfileVersionId ||
    policy.policyHash !== input.policyHash ||
    !equal(policy.capabilityKeys, input.capabilityKeys) ||
    event.executionId !== execution.id ||
    event.externalEventId !== input.userEvent.externalEventId ||
    event.eventType !== "user_message" ||
    event.schemaVersion !== input.userEvent.schemaVersion ||
    !equal(event.payload, input.userEvent.payload)
  )
    throw runConflict();
  return result(false, session, rootTask, policy, execution, event);
}
async function policySnapshot(
  tx: Prisma.TransactionClient,
  sessionId: string,
  input: AuthorizeAgentExecutionInput,
): Promise<PolicyRow> {
  const current = await tx.agentPolicySnapshot.findFirst({
    where: {
      organizationId: input.organizationId,
      sessionId,
      agentVersionId: input.agentVersionId,
      authorityProfileVersionId: input.authorityProfileVersionId,
      policyHash: input.policyHash,
    },
    select: policySelect,
  });
  if (current) {
    if (!equal(current.capabilityKeys, input.capabilityKeys))
      throw runConflict();
    return current;
  }
  return tx.agentPolicySnapshot.create({
    data: {
      id: uuid([
        "agent-policy-snapshot",
        input.organizationId,
        sessionId,
        input.agentVersionId,
        input.authorityProfileVersionId,
        input.policyHash,
        input.capabilityKeys,
      ]),
      organizationId: input.organizationId,
      sessionId,
      agentVersionId: input.agentVersionId,
      authorityProfileVersionId: input.authorityProfileVersionId,
      capabilityKeys: input.capabilityKeys,
      policyHash: input.policyHash,
    },
    select: policySelect,
  });
}
async function authority(
  tx: Prisma.TransactionClient,
  input: AuthorizeAgentExecutionInput,
): Promise<void> {
  const current = await tx.agentAuthorityProfileVersion.findFirst({
    where: {
      id: input.authorityProfileVersionId,
      organizationId: input.organizationId,
    },
  });
  if (!current) throw scopeInvalid();
  if (
    !equal(current.capabilityKeys, input.capabilityKeys) ||
    !equal(current.policyDocument, input.authorityProfilePolicyDocument) ||
    current.policyHash !== input.authorityProfilePolicyHash
  )
    throw runConflict();
}
function result(
  createdSession: boolean,
  session: SessionRow,
  rootTask: TaskRow,
  policy: PolicyRow,
  execution: ExecutionRow,
  userEvent: Parameters<typeof mapEvent>[0],
): AuthorizedExecutionRecord {
  return {
    createdSession,
    session: mapSession(session),
    rootTask: mapTask(rootTask),
    contextEpoch: session.contextEpoch,
    policy: mapPolicy(policy),
    execution: mapExecution(execution),
    userEvent: mapEvent(userEvent),
  };
}
function equal(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}
function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw runConflict();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  throw runConflict();
}
function uuid(value: unknown): string {
  const bytes = createHash("sha256").update(canonical(value)).digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function known(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}
function runConflict(): AgentOsBoundaryError {
  return new AgentOsBoundaryError(
    "INTERACTION_RUN_CONFLICT",
    "The interaction run identity already exists with different immutable input.",
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
