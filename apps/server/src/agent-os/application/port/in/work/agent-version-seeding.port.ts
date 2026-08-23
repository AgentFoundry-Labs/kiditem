export const AGENT_VERSION_SEEDING_PORT = Symbol('AGENT_VERSION_SEEDING_PORT');

/** Explicit input boundary for publishing the code-owned AgentVersion snapshots. */
export interface AgentVersionSeedingPort {
  seed(): Promise<number>;
}
