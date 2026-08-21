export const AGENT_SESSION_LIFECYCLE_MAINTENANCE_TRANSACTION = Symbol(
  "AGENT_SESSION_LIFECYCLE_MAINTENANCE_TRANSACTION",
);

export interface AgentSessionArtifactObjectErasureClaimRecord {
  id: string;
  organizationId: string;
  storageReference: string;
}

export interface AgentSessionRetentionDeletionClaimRecord {
  organizationId: string;
  sessionId: string;
  actorId: string;
  copilotThreadId: string;
  retentionDueAt: Date;
}

export interface AgentSessionLifecycleMaintenanceTransactionPort {
  claimDueArtifactErasures(input: {
    now: Date;
    claimToken: string;
    leaseExpiredBefore: Date;
    limit: number;
  }): Promise<AgentSessionArtifactObjectErasureClaimRecord[]>;
  completeArtifactErasure(input: {
    id: string;
    organizationId: string;
    claimToken: string;
  }): Promise<void>;
  retryArtifactErasure(input: {
    id: string;
    organizationId: string;
    claimToken: string;
    errorCode: "storage_delete_failed";
    availableAt: Date;
  }): Promise<void>;
  quarantineArtifactErasure(input: {
    id: string;
    organizationId: string;
    claimToken: string;
    errorCode: "invalid_reference";
  }): Promise<void>;
  claimDueSessionDeletions(input: {
    now: Date;
    claimToken: string;
    leaseExpiredBefore: Date;
    limit: number;
  }): Promise<AgentSessionRetentionDeletionClaimRecord[]>;
  releaseRetentionDeletionClaim(input: {
    organizationId: string;
    sessionId: string;
    claimToken: string;
  }): Promise<void>;
  scheduleOrganizationRemoval(input: {
    organizationId: string;
    now: Date;
  }): Promise<{ archived: number; terminal: number; held: number }>;
  deleteDueLegalAuditProjections(input: {
    now: Date;
    limit: number;
  }): Promise<number>;
}
