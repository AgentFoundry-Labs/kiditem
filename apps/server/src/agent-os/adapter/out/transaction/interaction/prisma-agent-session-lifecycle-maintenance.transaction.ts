import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../../prisma/prisma.service";
import {
  projectAgentSessionRetentionDueAt,
  projectAgentSessionRetentionPolicy,
} from "../../../../domain/session/agent-session-retention.policy";
import type {
  AgentSessionArtifactObjectErasureClaimRecord,
  AgentSessionRetentionDeletionClaimRecord,
  AgentSessionLifecycleMaintenanceTransactionPort,
} from "../../../../application/port/out/transaction/interaction/agent-session-lifecycle-maintenance.transaction.port";

@Injectable()
export class PrismaAgentSessionLifecycleMaintenanceTransaction
  implements AgentSessionLifecycleMaintenanceTransactionPort
{
  constructor(private readonly prisma: PrismaService) {}

  async claimDueArtifactErasures(input: {
    now: Date;
    claimToken: string;
    leaseExpiredBefore: Date;
    limit: number;
  }): Promise<AgentSessionArtifactObjectErasureClaimRecord[]> {
    return this.prisma.$transaction(async (tx) => {
      // Do not take a row lock before the global physical-object lock. Append
      // takes the global lock first, so this scan is deliberately nonlocking.
      const candidates = await tx.$queryRaw<Array<{
        id: string;
        referenceHash: string;
      }>>(
        Prisma.sql`
          -- Global lifecycle maintenance deliberately claims across every
          -- organization_id; each claimed object still returns its fenced owner.
          SELECT id::text AS id, reference_hash AS "referenceHash"
          FROM agent_session_artifact_objects
          WHERE (
            status = 'active'
            AND live_reference_count = 0
            AND erasure_due_at IS NOT NULL
            AND erasure_due_at <= ${input.now}
          ) OR (
            status = 'erasing'
            AND claimed_at <= ${input.leaseExpiredBefore}
          )
          ORDER BY erasure_due_at ASC NULLS LAST, id ASC
          LIMIT ${Math.min(input.limit * 4, 400)}
        `,
      );
      const claimed: AgentSessionArtifactObjectErasureClaimRecord[] = [];
      for (const candidate of candidates.sort((left, right) =>
        left.referenceHash.localeCompare(right.referenceHash),
      )) {
        if (claimed.length >= input.limit) break;
        if (!await tryLock(tx, ["agent-session-artifact-object", candidate.referenceHash]))
          continue;
        await lockObjectRow(tx, candidate.id);
        const object = await tx.agentSessionArtifactObject.findUnique({
          where: { id: candidate.id },
          select: {
            id: true,
            organizationId: true,
            storageReference: true,
            referenceHash: true,
            status: true,
            liveReferenceCount: true,
            erasureDueAt: true,
            claimedAt: true,
          },
        });
        if (!object || object.referenceHash !== candidate.referenceHash) continue;
        const activeDue =
          object.status === "active" &&
          object.liveReferenceCount === 0 &&
          object.erasureDueAt !== null &&
          object.erasureDueAt <= input.now;
        const expiredLease =
          object.status === "erasing" &&
          (!object.claimedAt || object.claimedAt <= input.leaseExpiredBefore);
        if (!activeDue && !expiredLease) continue;
        if (!object.storageReference) {
          await tx.agentSessionArtifactObject.update({
            where: {
              id_organizationId: {
                id: object.id,
                organizationId: object.organizationId,
              },
            },
            data: {
              status: "quarantined",
              claimToken: null,
              claimedAt: null,
              lastErrorCode: "invalid_reference",
            },
          });
          continue;
        }
        if (object.status === "active") {
          await tx.agentSessionArtifactObjectRetentionHold.deleteMany({
            where: {
              artifactObjectId: object.id,
              retentionDueAt: { lte: input.now },
            },
          });
          const nextHold = await tx.agentSessionArtifactObjectRetentionHold.findFirst({
            where: { artifactObjectId: object.id },
            orderBy: { retentionDueAt: "asc" },
            select: { retentionDueAt: true },
          });
          if (nextHold) {
            await tx.agentSessionArtifactObject.update({
              where: {
                id_organizationId: {
                  id: object.id,
                  organizationId: object.organizationId,
                },
              },
              data: { erasureDueAt: nextHold.retentionDueAt },
            });
            continue;
          }
        }
        const updated = await tx.agentSessionArtifactObject.updateMany({
          where: {
            id: object.id,
            liveReferenceCount: 0,
            status: object.status === "active" ? "active" : "erasing",
          },
          data: {
            status: "erasing",
            claimToken: input.claimToken,
            claimedAt: input.now,
            attemptCount: { increment: 1 },
            lastErrorCode: null,
          },
        });
        if (updated.count !== 1) continue;
        claimed.push({
          id: object.id,
          organizationId: object.organizationId,
          storageReference: object.storageReference,
        });
      }
      return claimed;
    });
  }

  async completeArtifactErasure(input: {
    id: string;
    organizationId: string;
    claimToken: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const candidate = await tx.agentSessionArtifactObject.findFirst({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          status: "erasing",
          claimToken: input.claimToken,
        },
        select: { id: true, referenceHash: true },
      });
      if (!candidate) return;
      if (!await tryLock(tx, ["agent-session-artifact-object", candidate.referenceHash])) return;
      await lockObjectRow(tx, candidate.id);
      const object = await tx.agentSessionArtifactObject.findFirst({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          status: "erasing",
          claimToken: input.claimToken,
          referenceHash: candidate.referenceHash,
        },
        select: { id: true, referenceHash: true },
      });
      if (!object) return;
      const [artifactCount, holdCount] = await Promise.all([
        tx.agentSessionArtifact.count({ where: { storageObjectId: object.id } }),
        tx.agentSessionArtifactObjectRetentionHold.count({
          where: { artifactObjectId: object.id },
        }),
      ]);
      if (artifactCount !== 0 || holdCount !== 0) return;
      await tx.agentSessionArtifactObjectTombstone.createMany({
        data: { referenceHash: object.referenceHash, erasedAt: new Date() },
        skipDuplicates: true,
      });
      await tx.agentSessionArtifactObject.delete({
        where: {
          id_organizationId: {
            id: object.id,
            organizationId: input.organizationId,
          },
        },
      });
    });
  }

  async retryArtifactErasure(input: {
    id: string;
    organizationId: string;
    claimToken: string;
    errorCode: "storage_delete_failed";
    availableAt: Date;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const candidate = await tx.agentSessionArtifactObject.findFirst({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          status: "erasing",
          claimToken: input.claimToken,
        },
        select: { id: true, referenceHash: true },
      });
      if (!candidate) return;
      if (!await tryLock(tx, ["agent-session-artifact-object", candidate.referenceHash])) return;
      await lockObjectRow(tx, candidate.id);
      await tx.agentSessionArtifactObject.updateMany({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          status: "erasing",
          claimToken: input.claimToken,
          referenceHash: candidate.referenceHash,
        },
        data: {
          status: "active",
          claimToken: null,
          claimedAt: null,
          erasureDueAt: input.availableAt,
          lastErrorCode: input.errorCode,
        },
      });
    });
  }

  async quarantineArtifactErasure(input: {
    id: string;
    organizationId: string;
    claimToken: string;
    errorCode: "invalid_reference";
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const candidate = await tx.agentSessionArtifactObject.findFirst({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          status: "erasing",
          claimToken: input.claimToken,
        },
        select: { id: true, referenceHash: true },
      });
      if (!candidate) return;
      if (!await tryLock(tx, ["agent-session-artifact-object", candidate.referenceHash])) return;
      await lockObjectRow(tx, candidate.id);
      await tx.agentSessionArtifactObject.updateMany({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          status: "erasing",
          claimToken: input.claimToken,
          referenceHash: candidate.referenceHash,
        },
        data: {
          status: "quarantined",
          storageReference: null,
          claimToken: null,
          claimedAt: null,
          erasureDueAt: null,
          lastErrorCode: input.errorCode,
        },
      });
    });
  }

  async claimDueSessionDeletions(input: {
    now: Date;
    claimToken: string;
    leaseExpiredBefore: Date;
    limit: number;
  }): Promise<AgentSessionRetentionDeletionClaimRecord[]> {
    return this.prisma.$queryRaw<AgentSessionRetentionDeletionClaimRecord[]>(
      Prisma.sql`
        -- Global lifecycle maintenance deliberately claims across every
        -- organization_id; deletion rechecks the returned fenced owner.
        WITH due_sessions AS (
          SELECT id
          FROM agent_sessions
          WHERE lifecycle IN ('completed', 'cancelled', 'archived')
            AND legal_hold_at IS NULL
            AND retention_due_at IS NOT NULL
            AND retention_due_at <= ${input.now}
            AND (
              retention_delete_claim_token IS NULL
              OR retention_delete_claimed_at IS NULL
              OR retention_delete_claimed_at <= ${input.leaseExpiredBefore}
            )
          ORDER BY retention_due_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${input.limit}
        )
        UPDATE agent_sessions AS sessions
        SET retention_delete_claim_token = ${input.claimToken}::uuid,
            retention_delete_claimed_at = ${input.now}
        FROM due_sessions
        WHERE sessions.id = due_sessions.id
        RETURNING sessions.organization_id::text AS "organizationId",
                  sessions.id::text AS "sessionId",
                  sessions.created_by_user_id::text AS "actorId",
                  sessions.copilot_thread_id AS "copilotThreadId",
                  sessions.retention_due_at AS "retentionDueAt"
      `,
    );
  }

  async releaseRetentionDeletionClaim(input: {
    organizationId: string;
    sessionId: string;
    claimToken: string;
  }): Promise<void> {
    await this.prisma.agentSession.updateMany({
      where: {
        id: input.sessionId,
        organizationId: input.organizationId,
        retentionDeleteClaimToken: input.claimToken,
      },
      data: {
        retentionDeleteClaimToken: null,
        retentionDeleteClaimedAt: null,
      },
    });
  }

  async scheduleOrganizationRemoval(input: {
    organizationId: string;
    now: Date;
  }): Promise<{ archived: number; terminal: number; held: number }> {
    return this.prisma.$transaction(async (tx) => {
      const [organization] = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id::text AS id FROM organizations WHERE id = ${input.organizationId}::uuid FOR UPDATE`,
      );
      if (!organization) return { archived: 0, terminal: 0, held: 0 };
      const [storedPolicy] = await tx.$queryRaw<Array<{
        sessionRetentionDays: number;
        residency: string;
        legalPolicyVersion: string;
      }>>(
        Prisma.sql`
          SELECT session_retention_days AS "sessionRetentionDays",
                 residency,
                 legal_policy_version AS "legalPolicyVersion"
          FROM agent_interaction_retention_policies
          WHERE organization_id = ${input.organizationId}::uuid
          FOR SHARE
        `,
      );
      const policy = projectAgentSessionRetentionPolicy(storedPolicy);
      const retentionDueAt = projectAgentSessionRetentionDueAt(input.now, policy);
      const sessions = await tx.$queryRaw<Array<{
        id: string;
        lifecycle: string;
        legalHoldAt: Date | null;
        retentionDueAt: Date | null;
        completedAt: Date | null;
        cancelledAt: Date | null;
        archivedAt: Date | null;
      }>>(
        Prisma.sql`
          SELECT id::text AS id,
                 lifecycle,
                 legal_hold_at AS "legalHoldAt",
                 retention_due_at AS "retentionDueAt",
                 completed_at AS "completedAt",
                 cancelled_at AS "cancelledAt",
                 archived_at AS "archivedAt"
          FROM agent_sessions
          WHERE organization_id = ${input.organizationId}::uuid
          FOR UPDATE
        `,
      );
      const activeIds = sessions
        .filter((session) => session.lifecycle === "active")
        .map((session) => session.id);
      if (activeIds.length) {
        await tx.agentSession.updateMany({
          where: {
            organizationId: input.organizationId,
            id: { in: activeIds },
            lifecycle: "active",
          },
          data: {
            lifecycle: "archived",
            archivedAt: input.now,
            retentionDueAt,
          },
        });
      }
      const terminalWithoutDueAt = sessions.filter((session) =>
        (session.lifecycle === "completed" ||
          session.lifecycle === "cancelled" ||
          session.lifecycle === "archived") &&
        session.retentionDueAt === null,
      );
      for (const session of terminalWithoutDueAt) {
        const terminalAt =
          session.completedAt ?? session.cancelledAt ?? session.archivedAt ?? input.now;
        await tx.agentSession.updateMany({
          where: {
            id: session.id,
            organizationId: input.organizationId,
            retentionDueAt: null,
          },
          data: {
            retentionDueAt: projectAgentSessionRetentionDueAt(terminalAt, policy),
          },
        });
      }
      return {
        archived: activeIds.length,
        terminal: sessions.filter((session) =>
          session.lifecycle === "completed" ||
          session.lifecycle === "cancelled" ||
          session.lifecycle === "archived",
        ).length,
        held: sessions.filter((session) => session.legalHoldAt !== null).length,
      };
    });
  }

  async deleteDueLegalAuditProjections(input: {
    now: Date;
    limit: number;
  }): Promise<number> {
    return this.prisma.$executeRaw(
      Prisma.sql`
        WITH due_projections AS (
          SELECT id
          FROM agent_session_legal_audit_projections
          WHERE retention_due_at <= ${input.now}
          ORDER BY retention_due_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${input.limit}
        )
        DELETE FROM agent_session_legal_audit_projections AS projections
        USING due_projections
        WHERE projections.id = due_projections.id
      `,
    );
  }
}

async function tryLock(
  tx: Prisma.TransactionClient,
  parts: string[],
): Promise<boolean> {
  const key = parts.join(":");
  const [row] = await tx.$queryRaw<Array<{ acquired: boolean }>>(
    // Global physical-object coordination has no tenant row; organization_id
    // fencing is rechecked by the caller after this advisory lock.
    Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS acquired`,
  );
  return row?.acquired === true;
}

async function lockObjectRow(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM agent_session_artifact_objects WHERE id = ${id}::uuid FOR UPDATE`,
  );
}
