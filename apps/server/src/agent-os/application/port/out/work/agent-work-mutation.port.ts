import type {
  MutationClaimInput,
  MutationFinalizeInput,
  MutationWorkSnapshot,
} from "./agent-work-persistence.types";

export const AGENT_WORK_MUTATION_PORT = Symbol("AGENT_WORK_MUTATION_PORT");

/**
 * Durable mutation-work seam. It owns lease claim/finalization fencing and
 * returns the immutable execution snapshot a Worker must replay.
 */
export interface AgentWorkMutationPort {
  claimMutation(
    input: MutationClaimInput,
  ): Promise<MutationWorkSnapshot | null>;
  finalizeMutation(input: MutationFinalizeInput): Promise<{ won: boolean }>;
}
