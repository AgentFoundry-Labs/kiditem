import { describe, expect, it } from "vitest";
import { AGENT_INTERACTION_AUTHORIZATION_PORT } from "../../../port/in/interaction/agent-interaction-authorization.port";

describe("AgentInteractionAuthorizationService input port", () => {
  it("publishes a stable authorization capability token", () => {
    expect(typeof AGENT_INTERACTION_AUTHORIZATION_PORT).toBe("symbol");
  });
});
