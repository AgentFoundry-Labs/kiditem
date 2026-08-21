export const AGENT_SESSION_LIFECYCLE_MAINTENANCE_PORT = Symbol(
  "AGENT_SESSION_LIFECYCLE_MAINTENANCE_PORT",
);

export interface AgentSessionLifecycleMaintenanceResult {
  erased: number;
  deferred: number;
  retried: number;
  quarantined: number;
  deletedSessions: number;
  retentionRetried: number;
  expiredAuditProjections: number;
}

export interface AgentSessionLifecycleMaintenancePort {
  drain(input?: {
    now?: Date;
    limit?: number;
  }): Promise<AgentSessionLifecycleMaintenanceResult>;
  scheduleOrganizationRemoval(input: {
    organizationId: string;
    now?: Date;
  }): Promise<{ archived: number; terminal: number; held: number }>;
}
