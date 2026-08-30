import { Module } from "@nestjs/common";
import { AgentOsInvocationModule } from './agent-os-invocation.module';

/** API composition for synchronous, request-driven Invocation execution. */
@Module({
  imports: [AgentOsInvocationModule],
  exports: [AgentOsInvocationModule],
})
export class AgentOsApiExecutionModule {}
