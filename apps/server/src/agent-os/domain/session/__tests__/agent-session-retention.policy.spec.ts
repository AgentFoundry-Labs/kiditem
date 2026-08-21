import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGENT_SESSION_RETENTION_POLICY,
  projectAgentSessionRetentionDueAt,
} from "../agent-session-retention.policy";

describe("AgentSessionRetentionPolicy", () => {
  it("projects the locked default 365-day retention deadline in UTC", () => {
    expect(
      projectAgentSessionRetentionDueAt(
        new Date("2026-08-13T00:00:00Z"),
        DEFAULT_AGENT_SESSION_RETENTION_POLICY,
      ).toISOString(),
    ).toBe("2027-08-13T00:00:00.000Z");
  });
});
