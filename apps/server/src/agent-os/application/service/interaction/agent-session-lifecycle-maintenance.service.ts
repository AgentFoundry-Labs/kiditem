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

const DEFAULT_LIMIT = 100;
const LEASE_MS = 5 * 60 * 1000;
const DEFER_MS = 5 * 60 * 1000;
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

    for (const claim of claims) {
      try {
        if (await this.transactions.hasLiveArtifactReference(claim)) {
          await this.transactions.deferArtifactErasure({
            ...claim,
            claimToken,
            deferCode: "live_reference",
            availableAt: new Date(now.getTime() + DEFER_MS),
          });
          deferred += 1;
          continue;
        }
        if (await this.transactions.hasLaterArtifactErasureClaim(claim)) {
          await this.transactions.deferArtifactErasure({
            ...claim,
            claimToken,
            deferCode: "later_retention_claim",
            availableAt: new Date(now.getTime() + DEFER_MS),
          });
          deferred += 1;
          continue;
        }
      } catch {
        await this.transactions.retryArtifactErasure({
          ...claim,
          claimToken,
          errorCode: "reference_hash_collision",
          availableAt: new Date(now.getTime() + RETRY_MS),
        });
        retried += 1;
        continue;
      }

      const result = await this.eraser.erase(claim);
      if (result.outcome === "erased") {
        await this.transactions.completeArtifactErasure({
          ...claim,
          claimToken,
        });
        erased += 1;
      } else {
        await this.transactions.retryArtifactErasure({
          ...claim,
          claimToken,
          errorCode: result.errorCode,
          availableAt: new Date(now.getTime() + RETRY_MS),
        });
        retried += 1;
      }
    }

    const expiredAuditProjections =
      await this.transactions.deleteDueLegalAuditProjections({ now, limit });
    return { erased, deferred, retried, expiredAuditProjections };
  }
}
