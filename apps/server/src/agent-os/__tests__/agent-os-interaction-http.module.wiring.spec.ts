import { describe, expect, it } from "vitest";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { ApiApplicationModule } from "../../api-application.module";
import { AgentOsHttpModule } from "../agent-os-http.module";
import { AGENT_AGUI_RUNNER_PORT } from "../application/port/in/agent-agui-runner.port";
import { AGENT_INTERACTION_AUTHORIZATION_PORT } from "../application/port/in/interaction/agent-interaction-authorization.port";
import { AGENT_INTERACTION_BOOTSTRAP_PORT } from "../application/port/in/interaction/agent-interaction-bootstrap.port";
import { AGENT_INTERACTION_LIVE_EVENTS_PORT } from "../application/port/in/interaction/agent-interaction-live-events.port";
import { AGENT_AGUI_PRODUCER_PORT } from "../application/port/in/interaction/agent-agui-producer.port";
import { AGENT_SESSION_APPROVAL_DECISION_PORT } from "../application/port/in/session-control/agent-session-approval-decision.port";

function imports(module: object): readonly unknown[] {
  return Reflect.getMetadata(MODULE_METADATA.IMPORTS, module) ?? [];
}

describe("AgentOsInteractionHttpModule", () => {
  it("is an API-root-only incoming adapter module", async () => {
    const { AgentOsInteractionHttpModule } = await import("../agent-os-interaction-http.module");
    expect(imports(ApiApplicationModule)).toContain(AgentOsInteractionHttpModule);
  });

  it("receives the direct interaction ports from the controller-free HTTP composition", () => {
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, AgentOsHttpModule) ?? [];
    expect(exports).toEqual(expect.arrayContaining([
      AGENT_AGUI_RUNNER_PORT,
      AGENT_AGUI_PRODUCER_PORT,
      AGENT_INTERACTION_AUTHORIZATION_PORT,
      AGENT_INTERACTION_BOOTSTRAP_PORT,
      AGENT_INTERACTION_LIVE_EVENTS_PORT,
      AGENT_SESSION_APPROVAL_DECISION_PORT,
    ]));
  });
});
