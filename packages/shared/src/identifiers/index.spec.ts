import { describe, expect, it } from "vitest";
import * as Identifiers from "./index";

describe("identifier contracts", () => {
  it("does not export retired Agent OS identifiers or resource-name helpers", () => {
    for (const retiredExport of [
      "AgentVersionIdSchema",
      "AgentVersionKeySchema",
      "AgentVersionNameSchema",
      "AgentSessionIdSchema",
      "AgentSessionNameSchema",
      "AgentTaskIdSchema",
      "AgentAttemptIdSchema",
      "AgentCapabilityInvocationIdSchema",
      "AgentCapabilityApprovalIdSchema",
      "AgentCapabilityApprovalNameSchema",
      "AgentConversationEventNameSchema",
      "formatAgentVersionName",
      "parseAgentVersionName",
      "formatAgentSessionName",
      "parseAgentSessionName",
      "formatAgentConversationEventName",
      "parseAgentConversationEventName",
    ]) {
      expect(Identifiers).not.toHaveProperty(retiredExport);
    }
  });

  it("keeps canonical operation-run names for non-Agent-OS consumers", () => {
    const organization = Identifiers.OrganizationIdSchema.parse("org-1");
    const operation = Identifiers.OperationRunIdSchema.parse("operation-1");
    const name = Identifiers.formatOperationRunName(organization, operation);

    expect(
      Identifiers.parseOperationRunName(
        name,
        Identifiers.formatOrganizationName(organization),
      ),
    ).toEqual({ organization, operation });
  });
});
