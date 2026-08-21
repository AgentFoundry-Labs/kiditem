import type { AgentSessionTombstoneHash } from "../../crypto/agent-session-tombstone-hasher.port";

export const AGENT_SESSION_LIFECYCLE_TRANSACTION = Symbol(
  "AGENT_SESSION_LIFECYCLE_TRANSACTION",
);

export interface AgentSessionLifecycleSessionRecord {
  id: string;
  organizationId: string;
  copilotThreadId: string;
  lifecycle: string;
  legalHoldAt: Date | null;
  legalHoldReason: string | null;
  retentionDueAt: Date | null;
}

export interface AgentSessionLifecycleTombstoneRecord {
  idempotencyKeyHash: AgentSessionTombstoneHash;
  requestFingerprintHash: AgentSessionTombstoneHash;
  terminalLifecycle: string;
  deletedAt: Date;
}

export interface AgentSessionLifecycleTransactionPort {
  readSession(input: {
    organizationId: string;
    sessionId: string;
  }): Promise<AgentSessionLifecycleSessionRecord | null>;
  findDeletedTombstone(input: {
    idempotencyKeyHash: AgentSessionTombstoneHash;
  }): Promise<AgentSessionLifecycleTombstoneRecord | null>;
  archiveSession(input: {
    organizationId: string;
    sessionId: string;
    actorId: string;
    reason: string;
    idempotencyKey: string;
    terminalAt: Date;
  }): Promise<{ retentionDueAt: Date }>;
  setLegalHold(input: {
    organizationId: string;
    sessionId: string;
    actorId: string;
    reason: string;
    idempotencyKey: string;
    active: boolean;
  }): Promise<void>;
  deleteSession(input: {
    organizationId: string;
    sessionId: string;
    actorId: string;
    reason: string;
    idempotencyKey: string;
    tombstone: {
      organizationIdHash: AgentSessionTombstoneHash;
      copilotThreadIdHash: AgentSessionTombstoneHash;
      idempotencyKeyHash: AgentSessionTombstoneHash;
      requestFingerprintHash: AgentSessionTombstoneHash;
    };
    systemRetention?: { claimToken: string };
  }): Promise<AgentSessionLifecycleTombstoneRecord>;
}
