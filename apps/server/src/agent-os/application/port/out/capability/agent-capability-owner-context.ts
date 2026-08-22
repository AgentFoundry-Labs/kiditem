import {
  parseOrganizationName,
  parseUserName,
} from '@kiditem/shared/identifiers';
import type { AgentCapabilityExecutionInput } from './agent-capability-handler.port';

/** Converts the sealed public capability context only at an owner boundary. */
export function ownerCapabilityContext(
  input: AgentCapabilityExecutionInput,
): { organizationId: string; actorId: string | null } {
  return {
    organizationId: parseOrganizationName(input.organization).organization,
    actorId: input.actor ? parseUserName(input.actor).user : null,
  };
}

/** Owner mutations are replayed only by the official request intent and key. */
export function ownerCapabilityIdempotencyKey(
  input: AgentCapabilityExecutionInput,
  ownerResourceKey: string,
): string {
  return `${input.requestId}:${ownerResourceKey}`;
}
