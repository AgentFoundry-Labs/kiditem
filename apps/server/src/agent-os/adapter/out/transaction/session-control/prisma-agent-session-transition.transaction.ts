import { createHash, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../../prisma/prisma.service";
import {
  projectAgentSessionRetentionDueAt,
  projectAgentSessionRetentionPolicy,
} from "../../../../domain/session/agent-session-retention.policy";
import { isOwnedAgentSessionArtifactReference } from "../../../../domain/session/agent-session-artifact-reference.policy";
import {
  AgentSessionControlRepositoryError,
  type SessionArtifactRecord,
} from "../../../../application/port/out/repository/session-control/agent-session-control.persistence.types";
import type { AgentSessionTransitionTransactionPort } from "../../../../application/port/out/transaction/session-control/agent-session-transition.transaction.port";
import { lockWritableAgentSession } from "./internal/lock-writable-agent-session";

const TERMINAL_STATES = new Set([
  "archived",
  "completed",
  "succeeded",
  "failed",
  "cancelled",
]);

@Injectable()
export class PrismaAgentSessionTransitionTransaction implements AgentSessionTransitionTransactionPort {
  constructor(private readonly prisma: PrismaService) {}

  async appendArtifact(
    input: Parameters<
      AgentSessionTransitionTransactionPort["appendArtifact"]
    >[0],
  ): Promise<SessionArtifactRecord> {
    return this.prisma
      .$transaction(async (tx: Prisma.TransactionClient) => {
        await lockWritableAgentSession(tx, input);
        await lock(tx, ["artifact", input.executionId, input.idempotencyKey]);
        const execution = await tx.agentExecution.findFirst({
          where: {
            id: input.executionId,
            sessionId: input.sessionId,
            sessionTaskId: input.taskId,
            organizationId: input.organizationId,
          },
        });
        if (!execution) throw scope();
        assertOwnedArtifactReference(input.organizationId, input.storageReference);
        const existing = await tx.agentSessionArtifact.findFirst({
          where: {
            executionId: input.executionId,
            idempotencyKey: input.idempotencyKey,
          },
          include: { storageObject: true },
        });
        if (existing) {
          if (
            existing.organizationId !== input.organizationId ||
            existing.sessionId !== input.sessionId ||
            existing.taskId !== input.taskId ||
            existing.artifactType !== input.artifactType ||
            !sameReference(existing.storageObject.storageReference, input.storageReference) ||
            existing.sha256 !== input.sha256 ||
            !canonicalEqual(existing.metadata, input.metadata)
          )
            throw conflict("AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT");
          return mapArtifact(existing);
        }
        const referenceHash = artifactReferenceHash(input.storageReference);
        await lock(tx, ["agent-session-artifact-object", referenceHash]);
        if (await tx.agentSessionArtifactObjectTombstone.findFirst({
          where: { referenceHash },
          select: { id: true },
        }))
          throw erasedReference();
        const object = await tx.agentSessionArtifactObject.findUnique({
          where: { referenceHash },
        });
        const storageObject = object
          ? await reuseArtifactObject(tx, object, input)
          : await tx.agentSessionArtifactObject.create({
              data: {
                organizationId: input.organizationId,
                storageReference: input.storageReference,
                referenceHash,
                status: "active",
                liveReferenceCount: 1,
              },
            });
        return mapArtifact(
          await tx.agentSessionArtifact.create({
            data: {
              organizationId: input.organizationId,
              sessionId: input.sessionId,
              taskId: input.taskId,
              executionId: input.executionId,
              artifactType: input.artifactType,
              storageObjectId: storageObject.id,
              sha256: input.sha256,
              metadata: input.metadata as Prisma.InputJsonValue,
              idempotencyKey: input.idempotencyKey,
            },
          }),
        );
      })
      .catch(rethrowStable);
  }

  async transitionTask(
    input: Parameters<
      AgentSessionTransitionTransactionPort["transitionTask"]
    >[0],
  ): Promise<{ id: string; status: string }> {
    if (
      TERMINAL_STATES.has(input.expectedState) &&
      input.expectedState !== input.state
    )
      throw state();
    return this.prisma.$transaction(async (tx) => {
      await lockWritableAgentSession(tx, input);
      const result = await tx.agentSessionTask.updateMany({
        where: {
          id: input.taskId,
          sessionId: input.sessionId,
          organizationId: input.organizationId,
          status: input.expectedState,
        },
        data: {
          status: input.state,
          finishedAt: TERMINAL_STATES.has(input.state) ? new Date() : null,
        },
      });
      if (result.count !== 1) await this.throwScopeOrStateForTask(input, tx);
      return (await this.findTask(input, tx))!;
    });
  }

  async transitionSession(
    input: Parameters<
      AgentSessionTransitionTransactionPort["transitionSession"]
    >[0],
  ): Promise<{ id: string; lifecycle: string }> {
    if (
      TERMINAL_STATES.has(input.expectedState) &&
      input.expectedState !== input.state
    )
      throw state();
    return this.prisma.$transaction(async (tx) => {
      await lockWritableAgentSession(tx, input);
      const terminalAt = TERMINAL_STATES.has(input.state) ? new Date() : null;
      const policy = terminalAt
        ? projectAgentSessionRetentionPolicy(
            await tx.agentInteractionRetentionPolicy.findUnique({
              where: { organizationId: input.organizationId },
              select: {
                sessionRetentionDays: true,
                residency: true,
                legalPolicyVersion: true,
              },
            }),
          )
        : null;
      const result = await tx.agentSession.updateMany({
        where: {
          id: input.sessionId,
          organizationId: input.organizationId,
          lifecycle: input.expectedState,
        },
        data: {
          lifecycle: input.state,
          completedAt: input.state === "completed" ? terminalAt : undefined,
          cancelledAt: input.state === "cancelled" ? terminalAt : undefined,
          archivedAt: input.state === "archived" ? terminalAt : undefined,
          retentionDueAt:
            terminalAt && policy
              ? projectAgentSessionRetentionDueAt(terminalAt, policy)
              : undefined,
        },
      });
      if (result.count !== 1) {
        const existing = await tx.agentSession.findFirst({
          where: { id: input.sessionId, organizationId: input.organizationId },
          select: { id: true },
        });
        if (!existing) throw scope();
        throw state();
      }
      return (await tx.agentSession.findFirst({
        where: { id: input.sessionId, organizationId: input.organizationId },
        select: { id: true, lifecycle: true },
      }))!;
    });
  }

  async createRetryExecution(
    input: Parameters<
      AgentSessionTransitionTransactionPort["createRetryExecution"]
    >[0],
  ) {
    return this.prisma
      .$transaction(async (tx: Prisma.TransactionClient) => {
        await lockWritableAgentSession(tx, input);
        await lock(tx, [
          "retry-task",
          input.organizationId,
          input.sessionId,
          input.taskId,
        ]);
        const task = await tx.agentSessionTask.findFirst({
          where: {
            id: input.taskId,
            sessionId: input.sessionId,
            organizationId: input.organizationId,
            session: { createdByUserId: input.actorId, lifecycle: "active" },
          },
          select: {
            id: true,
            organizationId: true,
            sessionId: true,
            status: true,
            session: {
              select: { createdByUserId: true, copilotThreadId: true },
            },
            executions: {
              orderBy: [{ startedAt: "desc" }, { id: "desc" }],
              take: 1,
              select: {
                id: true,
                agentVersionId: true,
                runtimeType: true,
                modelIdentity: true,
                policySnapshotId: true,
                inputHash: true,
                currentInput: true,
                resourceRefs: true,
                attempt: true,
              },
            },
          },
        });
        if (!task) {
          throw scope();
        }
        const aguiRunId = retryRunId(input.taskId, input.idempotencyKey);
        const existing = await tx.agentExecution.findFirst({
          where: {
            organizationId: input.organizationId,
            copilotThreadId: task.session.copilotThreadId,
            aguiRunId,
          },
          select: {
            id: true,
            status: true,
            runtimeType: true,
            attempts: {
              take: 1,
              select: {
                operationBindings: {
                  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                  take: 1,
                  select: { operationRunId: true },
                },
              },
            },
          },
        });
        if (existing) {
          return {
            organizationId: task.organizationId,
            sessionId: task.sessionId,
            taskId: task.id,
            taskStatus: task.status,
            executionId: existing.id,
            executionStatus: existing.status,
            runtimeType: existing.runtimeType,
            requestedByUserId: task.session.createdByUserId,
            operationRunId:
              existing.attempts[0]?.operationBindings[0]?.operationRunId ??
              null,
          };
        }
        if (task.status !== input.expectedStatus) throw state();
        const previous = task.executions[0];
        if (!previous) throw state();
        const execution = await tx.agentExecution.create({
          data: {
            organizationId: task.organizationId,
            sessionId: task.sessionId,
            sessionTaskId: task.id,
            copilotThreadId: task.session.copilotThreadId,
            aguiRunId,
            agentVersionId: previous.agentVersionId,
            runtimeType: previous.runtimeType,
            modelIdentity: previous.modelIdentity,
            policySnapshotId: previous.policySnapshotId,
            inputHash: previous.inputHash,
            currentInput: toInputJson(previous.currentInput),
            resourceRefs: toInputJson(previous.resourceRefs),
            attempt: previous.attempt + 1,
            status: "running",
          },
          select: { id: true, status: true, runtimeType: true },
        });
        await tx.agentSessionTask.update({
          where: { id: task.id },
          data: { status: "queued", finishedAt: null },
        });
        return {
          organizationId: task.organizationId,
          sessionId: task.sessionId,
          taskId: task.id,
          taskStatus: "queued",
          executionId: execution.id,
          executionStatus: execution.status,
          runtimeType: execution.runtimeType,
          requestedByUserId: task.session.createdByUserId,
          operationRunId: null,
        };
      })
      .catch(rethrowStable);
  }

  private findTask(
    input: {
      organizationId: string;
      sessionId: string;
      taskId: string;
    },
    client: Pick<Prisma.TransactionClient, "agentSessionTask"> = this.prisma,
  ) {
    return client.agentSessionTask.findFirst({
      where: {
        id: input.taskId,
        sessionId: input.sessionId,
        organizationId: input.organizationId,
      },
      select: { id: true, status: true },
    });
  }

  private findSession(input: { organizationId: string; sessionId: string }) {
    return this.prisma.agentSession.findFirst({
      where: { id: input.sessionId, organizationId: input.organizationId },
      select: { id: true, lifecycle: true },
    });
  }

  private async throwScopeOrStateForTask(
    input: { organizationId: string; sessionId: string; taskId: string },
    client: Pick<Prisma.TransactionClient, "agentSessionTask"> = this.prisma,
  ): Promise<never> {
    if (!(await this.findTask(input, client))) throw scope();
    throw state();
  }
}

async function reuseArtifactObject(
  tx: Prisma.TransactionClient,
  object: {
    id: string;
    organizationId: string;
    storageReference: string | null;
    status: string;
  },
  input: Parameters<AgentSessionTransitionTransactionPort["appendArtifact"]>[0],
) {
  if (
    object.organizationId !== input.organizationId ||
    !sameReference(object.storageReference, input.storageReference)
  )
    throw invalidReference();
  if (object.status === "erased") throw erasedReference();
  if (object.status !== "active") throw erasingReference();
  return tx.agentSessionArtifactObject.update({
    where: { id: object.id },
    data: { liveReferenceCount: { increment: 1 } },
  });
}

function mapArtifact(row: {
  id: string;
  sha256: string;
  lifecycle: string;
}): SessionArtifactRecord {
  return { id: row.id, sha256: row.sha256, lifecycle: row.lifecycle };
}

async function lock(
  tx: Prisma.TransactionClient,
  parts: string[],
): Promise<void> {
  const key = parts.join(":");
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function assertOwnedArtifactReference(
  organizationId: string,
  storageReference: string,
): void {
  if (!isOwnedAgentSessionArtifactReference(organizationId, storageReference))
    throw invalidReference();
}

function artifactReferenceHash(storageReference: string): string {
  return createHash("sha256")
    .update(`agent-session-artifact-object\u0000${storageReference}`, "utf8")
    .digest("hex");
}

function sameReference(left: string | null, right: string): boolean {
  if (left === null) return false;
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}

function invalidReference(): AgentSessionControlRepositoryError {
  return new AgentSessionControlRepositoryError(
    "AGENT_SESSION_ARTIFACT_REFERENCE_INVALID",
    "Artifact storage references must be immutable, organization-owned AgentOS keys.",
  );
}

function erasingReference(): AgentSessionControlRepositoryError {
  return new AgentSessionControlRepositoryError(
    "AGENT_SESSION_ARTIFACT_REFERENCE_ERASING",
    "The physical artifact object is being erased and cannot receive new references.",
  );
}

function erasedReference(): AgentSessionControlRepositoryError {
  return new AgentSessionControlRepositoryError(
    "AGENT_SESSION_ARTIFACT_REFERENCE_ERASED",
    "A previously erased immutable artifact key cannot be reused.",
  );
}
function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  )
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  throw conflict("AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT");
}
function retryRunId(taskId: string, idempotencyKey: string): string {
  return `retry-${createHash("sha256")
    .update(canonicalJson([taskId, idempotencyKey]))
    .digest("hex")}`;
}
function toInputJson(
  value: Prisma.JsonValue,
): Prisma.InputJsonValue | Prisma.JsonNullValueInput {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}
function scope(): AgentSessionControlRepositoryError {
  return conflict("AGENT_SESSION_CONTROL_SCOPE_INVALID");
}
function state(): AgentSessionControlRepositoryError {
  return conflict("AGENT_SESSION_CONTROL_STATE_CONFLICT");
}
function conflict(
  code: AgentSessionControlRepositoryError["code"],
): AgentSessionControlRepositoryError {
  return new AgentSessionControlRepositoryError(code, code);
}
function rethrowStable(error: unknown): never {
  if (error instanceof AgentSessionControlRepositoryError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002")
      throw conflict("AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT");
    if (error.code === "P2003") throw scope();
  }
  throw error;
}
