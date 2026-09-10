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
});
