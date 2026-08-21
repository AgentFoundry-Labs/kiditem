export const AGENT_SESSION_TOMBSTONE_HASHER = Symbol(
  "AGENT_SESSION_TOMBSTONE_HASHER",
);

export type AgentSessionTombstoneHashDomain =
  | "organization"
  | "copilot_thread"
  | "idempotency"
  | "request_fingerprint";

export interface AgentSessionTombstoneHash {
  hash: string;
  hashKeyVersion: string;
}

export interface AgentSessionTombstoneHasherPort {
  hash(input: {
    domain: AgentSessionTombstoneHashDomain;
    value: string;
  }): AgentSessionTombstoneHash;
  matches(
    left: AgentSessionTombstoneHash,
    right: AgentSessionTombstoneHash,
  ): boolean;
}
