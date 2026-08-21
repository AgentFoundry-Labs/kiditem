import {
  AgentInteractionRetentionPolicySchema,
  type AgentInteractionRetentionPolicy,
} from "@kiditem/shared/agent-interaction";

export const DEFAULT_AGENT_SESSION_RETENTION_POLICY =
  AgentInteractionRetentionPolicySchema.parse({
    legalPolicyVersion: "kr-default-365-v1",
  });

export interface AgentSessionRetentionPolicyRecord {
  sessionRetentionDays?: number;
  residency?: string;
  legalPolicyVersion?: string;
}

export function projectAgentSessionRetentionPolicy(
  policy: AgentSessionRetentionPolicyRecord | null | undefined,
): AgentInteractionRetentionPolicy {
  return AgentInteractionRetentionPolicySchema.parse({
    ...DEFAULT_AGENT_SESSION_RETENTION_POLICY,
    ...policy,
  });
}

export function projectAgentSessionRetentionDueAt(
  terminalAt: Date,
  policy: Pick<AgentInteractionRetentionPolicy, "sessionRetentionDays">,
): Date {
  const dueAt = new Date(terminalAt.getTime());
  dueAt.setUTCDate(dueAt.getUTCDate() + policy.sessionRetentionDays);
  return dueAt;
}
