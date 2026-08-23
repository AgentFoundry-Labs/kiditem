import { Module } from "@nestjs/common";
import { AgentOsCopilotKitController } from "./adapter/in/http/interaction/agent-os-copilotkit.controller";
import { AgentOsHttpModule } from "./agent-os-http.module";

/** API-root-only ownership for browser interaction transport. */
@Module({
  imports: [AgentOsHttpModule],
  controllers: [AgentOsCopilotKitController],
})
export class AgentOsInteractionHttpModule {}
