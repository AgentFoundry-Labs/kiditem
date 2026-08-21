import { timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../../prisma/prisma.service";
import { AgentOsBoundaryError } from "../../../../domain/agent-os.errors";
import type {
  AgentSessionArtifactErasureClaimRecord,
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
  }): Promise<AgentSessionArtifactErasureClaimRecord[]> {
    return this.prisma.$queryRaw<AgentSessionArtifactErasureClaimRecord[]>(
      Prisma.sql`
        WITH due_claims AS (
          SELECT id
          FROM agent_session_artifact_erasure_claims
          WHERE storage_reference IS NOT NULL
            AND (
              (status IN ('pending', 'deferred')
                AND due_at <= ${input.now}
                AND available_at <= ${input.now})
              OR (status = 'claimed' AND claimed_at <= ${input.leaseExpiredBefore})
            )
          ORDER BY due_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${input.limit}
        )
        UPDATE agent_session_artifact_erasure_claims AS claims
        SET status = 'claimed',
            claim_token = ${input.claimToken}::uuid,
            claimed_at = ${input.now},
            attempt_count = claims.attempt_count + 1,
            last_error_code = NULL
        FROM due_claims
        WHERE claims.id = due_claims.id
        RETURNING claims.id::text AS "id",
                  claims.organization_id::text AS "organizationId",
                  claims.storage_reference AS "storageReference"
      `,
    );
  }

  async hasLiveArtifactReference(input: {
    organizationId: string;
    storageReference: string;
  }): Promise<boolean> {
    const artifact = await this.prisma.agentSessionArtifact.findFirst({
      where: {
        organizationId: input.organizationId,
        storageReference: input.storageReference,
      },
      select: { id: true },
    });
    return !!artifact;
  }

  async hasLaterArtifactErasureClaim(input: {
    id: string;
    organizationId: string;
    storageReference: string;
  }): Promise<boolean> {
    const current = await this.prisma.agentSessionArtifactErasureClaim.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
      select: { referenceHash: true, dueAt: true },
    });
    if (!current) return false;
    const later = await this.prisma.agentSessionArtifactErasureClaim.findMany({
      where: {
        organizationId: input.organizationId,
        referenceHash: current.referenceHash,
        id: { not: input.id },
        dueAt: { gt: current.dueAt },
        status: { in: ["pending", "deferred", "claimed"] },
      },
      select: { storageReference: true },
    });
    let hasLater = false;
    for (const candidate of later) {
      if (!candidate.storageReference) continue;
      if (!sameReference(candidate.storageReference, input.storageReference)) {
        throw new AgentOsBoundaryError("THREAD_ARTIFACT_ERASURE_HASH_COLLISION");
      }
      hasLater = true;
    }
    return hasLater;
  }

  async completeArtifactErasure(input: {
    id: string;
    organizationId: string;
    claimToken: string;
  }): Promise<void> {
    await this.prisma.agentSessionArtifactErasureClaim.deleteMany({
      where: {
        id: input.id,
        organizationId: input.organizationId,
        status: "claimed",
        claimToken: input.claimToken,
      },
    });
  }

  async deferArtifactErasure(input: {
    id: string;
    organizationId: string;
    claimToken: string;
    deferCode: "live_reference" | "later_retention_claim";
    availableAt: Date;
  }): Promise<void> {
    await this.prisma.agentSessionArtifactErasureClaim.updateMany({
      where: {
        id: input.id,
        organizationId: input.organizationId,
        status: "claimed",
        claimToken: input.claimToken,
      },
      data: {
        status: "deferred",
        claimToken: null,
        claimedAt: null,
        lastErrorCode: input.deferCode,
        availableAt: input.availableAt,
      },
    });
  }

  async retryArtifactErasure(input: {
    id: string;
    organizationId: string;
    claimToken: string;
    errorCode: "unsupported_reference" | "storage_delete_failed" | "reference_hash_collision";
    availableAt: Date;
  }): Promise<void> {
    await this.prisma.agentSessionArtifactErasureClaim.updateMany({
      where: {
        id: input.id,
        organizationId: input.organizationId,
        status: "claimed",
        claimToken: input.claimToken,
      },
      data: {
        status: "pending",
        claimToken: null,
        claimedAt: null,
        lastErrorCode: input.errorCode,
        availableAt: input.availableAt,
      },
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

function sameReference(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}
