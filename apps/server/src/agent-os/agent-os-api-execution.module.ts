import { Module } from "@nestjs/common";
import { AgentWorkCapabilityApplicationModule } from "../agent-work-capability-application.module";
import { AgentRuntimeApplicationModule } from '../agent-runtime-application.module';

/** API composition for live Attempts; durable mutations remain worker-owned. */
@Module({
  imports: [AgentWorkCapabilityApplicationModule, AgentRuntimeApplicationModule],
  exports: [AgentWorkCapabilityApplicationModule, AgentRuntimeApplicationModule],
})
export class AgentOsApiExecutionModule {}
