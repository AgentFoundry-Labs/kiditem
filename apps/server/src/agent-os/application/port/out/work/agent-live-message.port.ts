export const AGENT_LIVE_MESSAGE_PORT = Symbol("AGENT_LIVE_MESSAGE_PORT");

/** Process-memory only: a live message never creates another durable Attempt. */
export interface AgentLiveMessagePort {
  deliver(input: {
    organizationId: string;
    requestedByUserId: string;
    sessionId: string;
    taskId: string;
    attemptId: string;
    content: string;
    /** Opaque source-turn coordinate; process-memory queue idempotency only. */
    turnId: string;
  }): Promise<void>;
}
