export const AGENT_SESSION_LIFECYCLE_MAINTENANCE_TRANSACTION = Symbol(
  "AGENT_SESSION_LIFECYCLE_MAINTENANCE_TRANSACTION",
);

export interface AgentSessionArtifactErasureClaimRecord {
  id: string;
  organizationId: string;
  storageReference: string;
}

export interface AgentSessionLifecycleMaintenanceTransactionPort {
  claimDueArtifactErasures(input: {
    now: Date;
    claimToken: string;
    leaseExpiredBefore: Date;
    limit: number;
  }): Promise<AgentSessionArtifactErasureClaimRecord[]>;
  hasLiveArtifactReference(input: {
    organizationId: string;
    storageReference: string;
  }): Promise<boolean>;
  hasLaterArtifactErasureClaim(input: {
    id: string;
    organizationId: string;
    storageReference: string;
  }): Promise<boolean>;
  completeArtifactErasure(input: {
    id: string;
    organizationId: string;
    claimToken: string;
  }): Promise<void>;
  deferArtifactErasure(input: {
    id: string;
    organizationId: string;
    claimToken: string;
    deferCode: "live_reference" | "later_retention_claim";
    availableAt: Date;
  }): Promise<void>;
  retryArtifactErasure(input: {
    id: string;
    organizationId: string;
    claimToken: string;
    errorCode: "unsupported_reference" | "storage_delete_failed" | "reference_hash_collision";
    availableAt: Date;
  }): Promise<void>;
  deleteDueLegalAuditProjections(input: {
    now: Date;
    limit: number;
  }): Promise<number>;
}
