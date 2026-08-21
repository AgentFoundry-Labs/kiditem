export const AGENT_INTERACTION_PRESENTATION_PORT = Symbol('AGENT_INTERACTION_PRESENTATION_PORT');
export interface AgentInteractionPresentationPort {
  authorize(input: { organizationId: string; userId: string; sessionId: string | null }, actionId: string): Promise<unknown>;
}
