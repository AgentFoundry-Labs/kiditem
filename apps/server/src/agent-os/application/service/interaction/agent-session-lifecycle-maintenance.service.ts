import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  AGENT_SESSION_LIFECYCLE_MAINTENANCE_PORT,
  type AgentSessionLifecycleMaintenancePort,
  type AgentSessionLifecycleMaintenanceResult,
} from "../../port/in/interaction/agent-session-lifecycle-maintenance.port";
import {
  AGENT_SESSION_ARTIFACT_ERASER,
  type AgentSessionArtifactEraserPort,
} from "../../port/out/storage/agent-session-artifact-eraser.port";
import {
  AGENT_SESSION_LIFECYCLE_MAINTENANCE_TRANSACTION,
  type AgentSessionLifecycleMaintenanceTransactionPort,
} from "../../port/out/transaction/interaction/agent-session-lifecycle-maintenance.transaction.port";
import {
  AGENT_SESSION_LIFECYCLE_TRANSACTION,
  type AgentSessionLifecycleTransactionPort,
} from "../../port/out/transaction/interaction/agent-session-lifecycle.transaction.port";
import {
  AGENT_SESSION_TOMBSTONE_HASHER,
  type AgentSessionTombstoneHasherPort,
} from "../../port/out/crypto/agent-session-tombstone-hasher.port";

const DEFAULT_LIMIT = 100;
const LEASE_MS = 5 * 60 * 1000;
const RETRY_MS = 60 * 1000;

@Injectable()
export class AgentSessionLifecycleMaintenanceService
  implements AgentSessionLifecycleMaintenancePort
{
  constructor(
    @Inject(AGENT_SESSION_LIFECYCLE_MAINTENANCE_TRANSACTION)
    private readonly transactions: AgentSessionLifecycleMaintenanceTransactionPort,
    @Inject(AGENT_SESSION_ARTIFACT_ERASER)
    private readonly eraser: AgentSessionArtifactEraserPort,
    @Inject(AGENT_SESSION_LIFECYCLE_TRANSACTION)
    private readonly lifecycle: AgentSessionLifecycleTransactionPort,
    @Inject(AGENT_SESSION_TOMBSTONE_HASHER)
    private readonly hasher: AgentSessionTombstoneHasherPort,
  ) {}

  async drain(input: {
    now?: Date;
    limit?: number;
  } = {}): Promise<AgentSessionLifecycleMaintenanceResult> {
    const now = input.now ?? new Date();
    const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIMIT, DEFAULT_LIMIT));
    const claimToken = randomUUID();
    const claims = await this.transactions.claimDueArtifactErasures({
      now,
      claimToken,
      leaseExpiredBefore: new Date(now.getTime() - LEASE_MS),
      limit,
    });
    let erased = 0;
    let deferred = 0;
    let retried = 0;
    let quarantined = 0;
    let deletedSessions = 0;
    let retentionRetried = 0;

    for (const claim of claims) {
      const result = await this.eraser.erase(claim);
      if (result.outcome === "erased") {
        await this.transactions.completeArtifactErasure({
          ...claim,
          claimToken,
        });
        erased += 1;
      } else if (result.outcome === "retry") {
        await this.transactions.retryArtifactErasure({
          ...claim,
          claimToken,
          errorCode: result.errorCode,
          availableAt: new Date(now.getTime() + RETRY_MS),
        });
        retried += 1;
      } else {
        await this.transactions.quarantineArtifactErasure({
          ...claim,
          claimToken,
          errorCode: result.errorCode,
        });
        quarantined += 1;
      }
    }

    const retentionClaimToken = randomUUID();
    const retentionClaims = await this.transactions.claimDueSessionDeletions({
      now,
      claimToken: retentionClaimToken,
      leaseExpiredBefore: new Date(now.getTime() - LEASE_MS),
      limit,
    });
    for (const claim of retentionClaims) {
      const idempotencyKey = `system-retention:${claim.sessionId}:${claim.retentionDueAt.toISOString()}`;
      const reason = "Retention policy expiry";
      try {
        await this.lifecycle.deleteSession({
          organizationId: claim.organizationId,
          sessionId: claim.sessionId,
          actorId: claim.actorId,
          reason,
          idempotencyKey,
          systemRetention: { claimToken: retentionClaimToken },
          tombstone: {
            organizationIdHash: this.hasher.hash({
              domain: "organization",
              value: claim.organizationId,
            }),
            copilotThreadIdHash: this.hasher.hash({
              domain: "copilot_thread",
              value: claim.copilotThreadId,
            }),
            idempotencyKeyHash: this.hasher.hash({
              domain: "idempotency",
              value: `${claim.organizationId}\u0000${idempotencyKey}`,
            }),
            requestFingerprintHash: this.hasher.hash({
              domain: "request_fingerprint",
              value: [
                claim.organizationId,
                claim.sessionId,
                claim.actorId,
                "delete",
                reason,
                idempotencyKey,
              ].map((value) => JSON.stringify(value)).join(","),
            }),
          },
        });
        deletedSessions += 1;
      } catch {
        await this.transactions.releaseRetentionDeletionClaim({
          organizationId: claim.organizationId,
          sessionId: claim.sessionId,
          claimToken: retentionClaimToken,
        });
        retentionRetried += 1;
      }
    }

    const expiredAuditProjections =
      await this.transactions.deleteDueLegalAuditProjections({ now, limit });
    return {
      erased,
      deferred,
      retried,
      quarantined,
      deletedSessions,
      retentionRetried,
      expiredAuditProjections,
    };
  }

  async scheduleOrganizationRemoval(input: {
    organizationId: string;
    now?: Date;
  }): Promise<{ archived: number; terminal: number; held: number }> {
    return this.transactions.scheduleOrganizationRemoval({
      organizationId: input.organizationId,
      now: input.now ?? new Date(),
    });
  }
}
