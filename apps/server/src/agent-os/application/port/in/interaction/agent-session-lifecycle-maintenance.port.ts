export const AGENT_SESSION_LIFECYCLE_MAINTENANCE_PORT = Symbol(
  "AGENT_SESSION_LIFECYCLE_MAINTENANCE_PORT",
);

export interface AgentSessionLifecycleMaintenanceResult {
  erased: number;
  deferred: number;
  retried: number;
  expiredAuditProjections: number;
}

export interface AgentSessionLifecycleMaintenancePort {
  drain(input?: {
    now?: Date;
    limit?: number;
  }): Promise<AgentSessionLifecycleMaintenanceResult>;
}
