import { Module } from "@nestjs/common";
import { AgentOsApiExecutionModule } from "./agent-os-api-execution.module";
import { AgentOsRuntimeHttpModule } from './agent-os-runtime-http.module';
import { AgentWorkController } from './adapter/in/http/interaction/agent-work.controller';
import { AgentWorkCopilotKitController } from './adapter/in/http/interaction/agent-work-copilotkit.controller';

/** Same-origin Agent interaction HTTP composition. */
@Module({ imports: [AgentOsApiExecutionModule, AgentOsRuntimeHttpModule], controllers: [AgentWorkController, AgentWorkCopilotKitController] })
export class AgentOsHttpModule {}
