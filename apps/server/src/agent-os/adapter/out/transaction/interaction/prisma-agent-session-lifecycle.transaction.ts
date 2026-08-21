import { createHash, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../../prisma/prisma.service";
import {
  projectAgentSessionRetentionDueAt,
  projectAgentSessionRetentionPolicy,
} from "../../../../domain/session/agent-session-retention.policy";
import {
  AgentSessionIndependentLegalAuditClassificationSchema,
  AgentSessionLegalAuditProjectionSchema,
} from "../../../../domain/session/agent-session-retention-audit.policy";
import { AgentOsBoundaryError } from "../../../../domain/agent-os.errors";
import type {
  AgentSessionLifecycleSessionRecord,
  AgentSessionLifecycleTombstoneRecord,
  AgentSessionLifecycleTransactionPort,
} from "../../../../application/port/out/transaction/interaction/agent-session-lifecycle.transaction.port";
import type { AgentSessionTombstoneHash } from "../../../../application/port/out/crypto/agent-session-tombstone-hasher.port";

const transactionOptions = { maxWait: 10_000, timeout: 30_000 } as const;

@Injectable()
export class PrismaAgentSessionLifecycleTransaction
  implements AgentSessionLifecycleTransactionPort
{
  constructor(private readonly prisma: PrismaService) {}

  async readSession(input: {
    organizationId: string;
    sessionId: string;
  }): Promise<AgentSessionLifecycleSessionRecord | null> {
    const session = await this.prisma.agentSession.findFirst({
      where: { id: input.sessionId, organizationId: input.organizationId },
      select: sessionSelect,
    });
    return session ? mapSession(session) : null;
  }

  async findDeletedTombstone(input: {
    idempotencyKeyHash: AgentSessionTombstoneHash;
  }): Promise<AgentSessionLifecycleTombstoneRecord | null> {
    const tombstone = await this.prisma.agentSessionTombstone.findUnique({
      where: { idempotencyKeyHash: input.idempotencyKeyHash.hash },
      select: tombstoneSelect,
    });
    return tombstone ? mapTombstone(tombstone) : null;
  }

  async archiveSession(
    input: Parameters<AgentSessionLifecycleTransactionPort["archiveSession"]>[0],
  ): Promise<{ retentionDueAt: Date }> {
    return this.prisma.$transaction(async (tx) => {
      await lock(tx, ["agent-session-lifecycle-idempotency", input.organizationId, input.idempotencyKey]);
      await lock(tx, ["agent-session-lifecycle", input.organizationId, input.sessionId]);
      const session = await lockSession(tx, input);
      if (!session) throw scope();
      const request = await createOrReuseRequest(tx, {
        ...input,
        command: "archive",
        deletionDueAt: null,
      });
      if (request.status === "succeeded" && request.deletionDueAt) {
        return { retentionDueAt: request.deletionDueAt };
      }
      if (session.lifecycle !== "active") throw state();
      const policy = projectAgentSessionRetentionPolicy(
        await tx.agentInteractionRetentionPolicy.findUnique({
          where: { organizationId: input.organizationId },
          select: {
            sessionRetentionDays: true,
            residency: true,
            legalPolicyVersion: true,
          },
        }),
      );
      const retentionDueAt = projectAgentSessionRetentionDueAt(
        input.terminalAt,
        policy,
      );
      await tx.agentSession.update({
        where: { id_organizationId: { id: session.id, organizationId: session.organizationId } },
        data: {
          lifecycle: "archived",
          archivedAt: input.terminalAt,
          retentionDueAt,
        },
      });
      await completeRequest(tx, request.id, retentionDueAt);
      return { retentionDueAt };
    }, transactionOptions).catch(rethrow);
  }

  async setLegalHold(
    input: Parameters<AgentSessionLifecycleTransactionPort["setLegalHold"]>[0],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lock(tx, ["agent-session-lifecycle-idempotency", input.organizationId, input.idempotencyKey]);
      await lock(tx, ["agent-session-lifecycle", input.organizationId, input.sessionId]);
      const session = await lockSession(tx, input);
      if (!session) throw scope();
      const command = input.active ? "place_legal_hold" : "release_legal_hold";
      const request = await createOrReuseRequest(tx, {
        ...input,
        command,
        deletionDueAt: null,
      });
      if (request.status === "succeeded") return;
      if (!input.active && !session.legalHoldAt) throw state();
      await tx.agentSession.update({
        where: { id_organizationId: { id: session.id, organizationId: session.organizationId } },
        data: input.active
          ? { legalHoldAt: new Date(), legalHoldReason: input.reason }
          : { legalHoldAt: null, legalHoldReason: null },
      });
      await completeRequest(tx, request.id, null);
    }, transactionOptions).catch(rethrow);
  }

  async deleteSession(
    input: Parameters<AgentSessionLifecycleTransactionPort["deleteSession"]>[0],
  ): Promise<AgentSessionLifecycleTombstoneRecord> {
    return this.prisma.$transaction(async (tx) => {
      assertTombstoneInput(input.tombstone);
      await lock(tx, ["agent-session-lifecycle-idempotency", input.organizationId, input.idempotencyKey]);
      const prior = await tx.agentSessionTombstone.findUnique({
        where: { idempotencyKeyHash: input.tombstone.idempotencyKeyHash.hash },
        select: tombstoneSelect,
      });
      if (prior) return assertExactTombstoneRetry(prior, input.tombstone);

      await lock(tx, ["agent-session-lifecycle", input.organizationId, input.sessionId]);

      const session = await lockSession(tx, input);
      if (!session) throw scope();
      const now = new Date();
      if (session.legalHoldAt) throw legalHold();
      if (!isDeletableTerminalLifecycle(session.lifecycle)) throw state();
      if (!session.retentionDueAt || session.retentionDueAt > now)
        throw retentionNotDue();
      const policy = await lockRetentionPolicy(tx, input.organizationId);
      const request = await createOrReuseRequest(tx, {
        ...input,
        command: "delete",
        deletionDueAt: session.retentionDueAt,
      });
      if (request.status === "succeeded") throw idempotencyConflict();

      const tombstone = await tx.agentSessionTombstone.create({
        data: {
          organizationIdHash: input.tombstone.organizationIdHash.hash,
          copilotThreadIdHash: input.tombstone.copilotThreadIdHash.hash,
          idempotencyKeyHash: input.tombstone.idempotencyKeyHash.hash,
          requestFingerprintHash: input.tombstone.requestFingerprintHash.hash,
          hashKeyVersion: input.tombstone.organizationIdHash.hashKeyVersion,
          terminalLifecycle: "deleted",
          deletionReasonCode: "user_requested",
          deletedAt: now,
          legalPolicyVersion: policy.legalPolicyVersion,
        },
        select: tombstoneSelect,
      });
      await completeRequest(tx, request.id, session.retentionDueAt, now);
      await projectIndependentLegalAudits(
        tx,
        input.organizationId,
        input.sessionId,
        session.retentionDueAt,
        now,
      );
      await deleteSessionGraph(tx, input.organizationId, input.sessionId);
      return mapTombstone(tombstone);
    }, transactionOptions).catch(rethrow);
  }
}

const sessionSelect = {
  id: true,
  organizationId: true,
  copilotThreadId: true,
  lifecycle: true,
  legalHoldAt: true,
  legalHoldReason: true,
  retentionDueAt: true,
} as const;
const tombstoneSelect = {
  idempotencyKeyHash: true,
  requestFingerprintHash: true,
  hashKeyVersion: true,
  terminalLifecycle: true,
  deletedAt: true,
} as const;

async function lock(
  tx: Prisma.TransactionClient,
  parts: readonly string[],
): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${parts.join(":")}, 0))`,
  );
}

async function lockSession(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; sessionId: string },
) {
  const [locked] = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id::text AS "id" FROM agent_sessions WHERE id = ${input.sessionId}::uuid AND organization_id = ${input.organizationId}::uuid FOR UPDATE`,
  );
  if (!locked) return null;
  return tx.agentSession.findFirst({
    where: { id: locked.id, organizationId: input.organizationId },
    select: sessionSelect,
  });
}

async function lockRetentionPolicy(
  tx: Prisma.TransactionClient,
  organizationId: string,
) {
  const [policy] = await tx.$queryRaw<Array<{
    sessionRetentionDays: number;
    residency: string;
    legalPolicyVersion: string;
  }>>(
    Prisma.sql`
      SELECT session_retention_days AS "sessionRetentionDays",
             residency,
             legal_policy_version AS "legalPolicyVersion"
      FROM agent_interaction_retention_policies
      WHERE organization_id = ${organizationId}::uuid
      FOR SHARE
    `,
  );
  return projectAgentSessionRetentionPolicy(policy);
}

async function createOrReuseRequest(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    sessionId: string;
    actorId: string;
    command: string;
    reason: string;
    idempotencyKey: string;
    deletionDueAt: Date | null;
  },
) {
  const existing = await tx.agentSessionLifecycleRequest.findUnique({
    where: {
      organizationId_idempotencyKey: {
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (existing) {
    if (
      existing.sessionId !== input.sessionId ||
      existing.command !== input.command ||
      existing.reason !== input.reason ||
      existing.requestedByUserId !== input.actorId
    )
      throw idempotencyConflict();
    return existing;
  }
  return tx.agentSessionLifecycleRequest.create({
    data: {
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      command: input.command,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      status: "pending",
      requestedByUserId: input.actorId,
      deletionDueAt: input.deletionDueAt,
    },
  });
}

async function completeRequest(
  tx: Prisma.TransactionClient,
  requestId: string,
  deletionDueAt: Date | null,
  finishedAt: Date = new Date(),
): Promise<void> {
  await tx.agentSessionLifecycleRequest.update({
    where: { id: requestId },
    data: { status: "succeeded", deletionDueAt, finishedAt },
  });
}

async function deleteSessionGraph(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sessionId: string,
): Promise<void> {
  const events = await tx.agentConversationEvent.findMany({
    where: { organizationId, sessionId },
    select: { id: true },
  });
  if (events.length) {
    await tx.agentConversationOutbox.deleteMany({
      where: { organizationId, eventId: { in: events.map(({ id }) => id) } },
    });
  }
  await tx.agentSessionApproval.deleteMany({ where: { organizationId, sessionId } });
  await tx.agentSessionArtifact.deleteMany({ where: { organizationId, sessionId } });
  await tx.agentExecutionAttemptOperationBinding.deleteMany({
    where: { organizationId, sessionId },
  });
  await tx.agentExecutionAttempt.deleteMany({ where: { organizationId, sessionId } });
  await tx.agentConversationEvent.deleteMany({ where: { organizationId, sessionId } });
  const executions = await tx.agentExecution.findMany({
    where: { organizationId, sessionId },
    select: { id: true },
  });
  if (executions.length) {
    await tx.agentExecutionUsage.deleteMany({
      where: { organizationId, executionId: { in: executions.map(({ id }) => id) } },
    });
  }
  await tx.agentExecution.deleteMany({ where: { organizationId, sessionId } });
  await tx.agentSessionTaskDelegation.deleteMany({ where: { organizationId, sessionId } });
  await tx.agentPolicySnapshot.deleteMany({ where: { organizationId, sessionId } });
  await tx.agentContextEpoch.deleteMany({ where: { organizationId, sessionId } });
  await tx.$executeRaw(
    Prisma.sql`DELETE FROM agent_session_tasks WHERE organization_id = ${organizationId}::uuid AND session_id = ${sessionId}::uuid`,
  );
  await tx.agentSession.delete({
    where: { id_organizationId: { id: sessionId, organizationId } },
  });
}

async function projectIndependentLegalAudits(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sessionId: string,
  sessionRetentionDueAt: Date,
  deletionNow: Date,
): Promise<void> {
  const [artifacts, usage] = await Promise.all([
    tx.agentSessionArtifact.findMany({
      where: { organizationId, sessionId },
      select: {
        retentionClass: true,
        independentLegalBasisCode: true,
        independentRetentionDueAt: true,
        storageReference: true,
        createdAt: true,
      },
    }),
    tx.agentExecutionUsage.findMany({
      where: { organizationId, execution: { sessionId } },
      select: {
        retentionClass: true,
        independentLegalBasisCode: true,
        independentRetentionDueAt: true,
        inputTokens: true,
        outputTokens: true,
        costMicros: true,
        currency: true,
        recordedAt: true,
      },
    }),
  ]);
  const artifactPlans = artifacts.map((artifact) => ({
    artifact,
    classification: parseIndependentLegalAudit(
      artifact,
      sessionRetentionDueAt,
      deletionNow,
    ),
  }));
  const usagePlans = usage.map((record) => ({
    record,
    classification: parseIndependentLegalAudit(
      record,
      sessionRetentionDueAt,
      deletionNow,
    ),
  }));
  const projections = [
    ...artifactPlans.flatMap(({ artifact, classification }) => {
      return classification
        ? [AgentSessionLegalAuditProjectionSchema.parse({
            organizationId,
            recordKind: "artifact",
            legalBasisCode: classification.independentLegalBasisCode,
            retentionDueAt: classification.independentRetentionDueAt,
            sourceOccurredAt: artifact.createdAt,
            inputTokens: null,
            outputTokens: null,
            costMicros: null,
            currency: null,
            recordCount: 1,
          })]
        : [];
    }),
    ...usagePlans.flatMap(({ record, classification }) => {
      return classification
        ? [AgentSessionLegalAuditProjectionSchema.parse({
            organizationId,
            recordKind: "usage",
            legalBasisCode: classification.independentLegalBasisCode,
            retentionDueAt: classification.independentRetentionDueAt,
            sourceOccurredAt: record.recordedAt,
            inputTokens: record.inputTokens,
            outputTokens: record.outputTokens,
            costMicros: record.costMicros,
            currency: record.currency,
            recordCount: 1,
          })]
        : [];
    }),
  ];
  if (projections.length) {
    await tx.agentSessionLegalAuditProjection.createMany({ data: projections });
  }
  for (const { artifact, classification } of artifactPlans.sort((left, right) =>
    erasureClaimLockKey(left.artifact.storageReference, left.classification, deletionNow)
      .localeCompare(erasureClaimLockKey(right.artifact.storageReference, right.classification, deletionNow)),
  )) {
    await queueArtifactErasureClaim(tx, {
      organizationId,
      storageReference: artifact.storageReference,
      dueAt: classification
        ? classification.independentRetentionDueAt
        : deletionNow,
    });
  }
}

function parseIndependentLegalAudit(
  record: {
    retentionClass: string;
    independentLegalBasisCode: string | null;
    independentRetentionDueAt: Date | null;
  },
  sessionRetentionDueAt: Date,
  deletionNow: Date,
) {
  if (record.retentionClass === "session") return null;
  const parsed = AgentSessionIndependentLegalAuditClassificationSchema.safeParse({
    retentionClass: record.retentionClass,
    independentLegalBasisCode: record.independentLegalBasisCode,
    independentRetentionDueAt: record.independentRetentionDueAt,
  });
  if (
    !parsed.success ||
    parsed.data.independentRetentionDueAt <= sessionRetentionDueAt ||
    parsed.data.independentRetentionDueAt <= deletionNow
  )
    throw retentionAuditInvalid();
  return parsed.data;
}

async function queueArtifactErasureClaim(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    storageReference: string;
    dueAt: Date;
  },
): Promise<void> {
  const referenceHash = createHash("sha256")
    .update(input.storageReference)
    .digest("hex");
  await lock(tx, [
    "agent-session-artifact-erasure",
    input.organizationId,
    referenceHash,
  ]);
  const existing = await tx.agentSessionArtifactErasureClaim.findMany({
    where: {
      organizationId: input.organizationId,
      referenceHash,
    },
    select: { storageReference: true, dueAt: true },
  });
  for (const candidate of existing) {
    if (
      !candidate.storageReference ||
      !sameRawReference(candidate.storageReference, input.storageReference)
    )
      throw artifactErasureHashCollision();
    if (candidate.dueAt.getTime() === input.dueAt.getTime()) return;
  }
  await tx.agentSessionArtifactErasureClaim.create({
    data: {
      organizationId: input.organizationId,
      storageReference: input.storageReference,
      referenceHash,
      dueAt: input.dueAt,
      availableAt: input.dueAt,
      status: "pending",
    },
  });
}

function erasureClaimLockKey(
  storageReference: string,
  classification: { independentRetentionDueAt: Date } | null,
  deletionNow: Date,
): string {
  return `${createHash("sha256").update(storageReference).digest("hex")}:${(
    classification?.independentRetentionDueAt ?? deletionNow
  ).toISOString()}`;
}

function sameRawReference(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}

function isDeletableTerminalLifecycle(lifecycle: string): boolean {
  return lifecycle === "completed" || lifecycle === "cancelled" || lifecycle === "archived";
}

function mapSession(row: Prisma.AgentSessionGetPayload<{ select: typeof sessionSelect }>): AgentSessionLifecycleSessionRecord {
  return row;
}

function mapTombstone(
  row: Prisma.AgentSessionTombstoneGetPayload<{ select: typeof tombstoneSelect }>,
): AgentSessionLifecycleTombstoneRecord {
  return {
    idempotencyKeyHash: {
      hash: row.idempotencyKeyHash,
      hashKeyVersion: row.hashKeyVersion,
    },
    requestFingerprintHash: {
      hash: row.requestFingerprintHash,
      hashKeyVersion: row.hashKeyVersion,
    },
    terminalLifecycle: row.terminalLifecycle,
    deletedAt: row.deletedAt,
  };
}

function assertExactTombstoneRetry(
  row: Prisma.AgentSessionTombstoneGetPayload<{ select: typeof tombstoneSelect }>,
  input: {
    idempotencyKeyHash: AgentSessionTombstoneHash;
    requestFingerprintHash: AgentSessionTombstoneHash;
  },
): AgentSessionLifecycleTombstoneRecord {
  const existing = mapTombstone(row);
  if (
    !sameHash(existing.idempotencyKeyHash, input.idempotencyKeyHash) ||
    !sameHash(existing.requestFingerprintHash, input.requestFingerprintHash)
  )
    throw idempotencyConflict();
  return existing;
}

function sameHash(left: AgentSessionTombstoneHash, right: AgentSessionTombstoneHash): boolean {
  if (left.hashKeyVersion !== right.hashKeyVersion) return false;
  const leftBytes = Buffer.from(left.hash, "hex");
  const rightBytes = Buffer.from(right.hash, "hex");
  return (
    leftBytes.byteLength === 32 &&
    rightBytes.byteLength === 32 &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function assertTombstoneInput(input: {
  organizationIdHash: AgentSessionTombstoneHash;
  copilotThreadIdHash: AgentSessionTombstoneHash;
  idempotencyKeyHash: AgentSessionTombstoneHash;
  requestFingerprintHash: AgentSessionTombstoneHash;
}): void {
  const hashes = [
    input.organizationIdHash,
    input.copilotThreadIdHash,
    input.idempotencyKeyHash,
    input.requestFingerprintHash,
  ];
  if (
    !/^v[1-9][0-9]*$/.test(input.organizationIdHash.hashKeyVersion) ||
    hashes.some(
      (candidate) =>
        candidate.hashKeyVersion !== input.organizationIdHash.hashKeyVersion ||
        !/^[a-f0-9]{64}$/.test(candidate.hash),
    )
  )
    throw idempotencyConflict();
}

function scope(): AgentOsBoundaryError {
  return new AgentOsBoundaryError("THREAD_LIFECYCLE_SCOPE_INVALID");
}
function state(): AgentOsBoundaryError {
  return new AgentOsBoundaryError("THREAD_LIFECYCLE_STATE_INVALID");
}
function legalHold(): AgentOsBoundaryError {
  return new AgentOsBoundaryError("THREAD_LEGAL_HOLD");
}
function retentionNotDue(): AgentOsBoundaryError {
  return new AgentOsBoundaryError("THREAD_RETENTION_NOT_DUE");
}
function retentionAuditInvalid(): AgentOsBoundaryError {
  return new AgentOsBoundaryError("THREAD_RETENTION_AUDIT_INVALID");
}
function artifactErasureHashCollision(): AgentOsBoundaryError {
  return new AgentOsBoundaryError("THREAD_ARTIFACT_ERASURE_HASH_COLLISION");
}
function idempotencyConflict(): AgentOsBoundaryError {
  return new AgentOsBoundaryError("THREAD_LIFECYCLE_IDEMPOTENCY_CONFLICT");
}
function rethrow(error: unknown): never {
  if (error instanceof AgentOsBoundaryError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") throw idempotencyConflict();
    if (error.code === "P2003") throw scope();
  }
  throw error;
}
