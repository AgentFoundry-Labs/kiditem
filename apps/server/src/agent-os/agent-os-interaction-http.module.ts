import { Module } from "@nestjs/common";
import { AgentOsHttpModule } from "./agent-os-http.module";

/** API-root-only ownership for browser interaction transport. */
@Module({
  imports: [AgentOsHttpModule],
})
export class AgentOsInteractionHttpModule {}
