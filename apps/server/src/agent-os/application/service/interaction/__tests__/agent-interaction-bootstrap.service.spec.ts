import { describe, expect, it } from "vitest";
import { AGENT_INTERACTION_BOOTSTRAP_PORT } from "../../../port/in/interaction/agent-interaction-bootstrap.port";

describe("AgentInteractionBootstrapService input port", () => {
  it("publishes a stable bootstrap capability token", () => {
    expect(typeof AGENT_INTERACTION_BOOTSTRAP_PORT).toBe("symbol");
  });
});
