import type {
  AgentRosterConfigurationStatus,
  AgentRosterDefinition,
  AgentRosterItem,
  AgentRosterRuntime,
} from "@kiditem/shared/agent-os";
import type { AgentOfficeNode } from "../lib/agent-office-model";

interface AgentRosterItemOverrides {
  definition?: Partial<AgentRosterDefinition>;
  runtime?: AgentRosterRuntime | null;
  configurationStatus?: AgentRosterConfigurationStatus;
}

const DEFAULT_RUNTIME: AgentRosterRuntime = {
  instanceId: "agent-manager",
  lifecycleStatus: "active",
  pauseReason: null,
  trustLevel: 1,
  adapterType: "hermes_local",
  modelOverride: null,
  effectiveModel: "gpt-5.4",
};

export function makeAgentRosterItem(
  overrides: AgentRosterItemOverrides = {},
): AgentRosterItem {
  return {
    definition: {
      type: "manager",
      name: "Operator",
      displayName: "운영 총괄",
      operationalRole: "employee",
      responsibility: "운영 우선순위, 위임, 승인 흐름을 총괄한다.",
      ownerAgentType: null,
      officeOrder: 100,
      ...overrides.definition,
    },
    runtime:
      overrides.runtime === undefined
        ? { ...DEFAULT_RUNTIME }
        : overrides.runtime,
    configurationStatus: overrides.configurationStatus ?? "ready",
  };
}

export function makeAgentOfficeNode(
  overrides: Partial<AgentOfficeNode> = {},
): AgentOfficeNode {
  return {
    id: "manager",
    instanceId: "agent-manager",
    name: "Operator",
    agentType: "manager",
    displayName: "운영 총괄",
    responsibility: "운영 우선순위, 위임, 승인 흐름을 총괄한다.",
    configurationStatus: "ready",
    status: "idle",
    activeRunCount: 0,
    pendingApprovalCount: 0,
    lastActivityAt: null,
    trustLevel: 1,
    adapterType: "hermes_local",
    effectiveModel: "gpt-5.4",
    capabilities: [],
    ...overrides,
  };
}
