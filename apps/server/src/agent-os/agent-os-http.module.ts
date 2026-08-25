import { Module } from "@nestjs/common";
import { AgentOsApiExecutionModule } from "./agent-os-api-execution.module";
import { CapabilityInvocationController } from './adapter/in/http/interaction/capability-invocation.controller';

/** Same-origin Agent interaction HTTP composition. */
@Module({
  imports: [AgentOsApiExecutionModule],
  controllers: [CapabilityInvocationController],
})
export class AgentOsHttpModule {}
