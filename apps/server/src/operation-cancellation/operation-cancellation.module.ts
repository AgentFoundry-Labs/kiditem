import { Module } from '@nestjs/common';
import { AgentOsApiExecutionModule } from '../agent-os/agent-os-api-execution.module';
import { AiModule } from '../ai/ai.module';
import { AutomationModule } from '../automation/automation.module';
import { OperationCancellationController } from './adapter/in/http/operation-cancellation.controller';
import { OperationCancellationService } from './application/service/operation-cancellation.service';
import { AgentSessionTaskCancellationAdapter } from './adapter/out/agent-os/agent-session-task-cancellation.adapter';
import { OPERATION_CANCELLATION_AGENT_SESSION_TASK_PORT } from './application/port/out/cross-domain/agent-session-task-cancellation.port';

@Module({
  imports: [AutomationModule, AgentOsApiExecutionModule, AiModule],
  controllers: [OperationCancellationController],
  providers: [
    OperationCancellationService,
    AgentSessionTaskCancellationAdapter,
    {
      provide: OPERATION_CANCELLATION_AGENT_SESSION_TASK_PORT,
      useExisting: AgentSessionTaskCancellationAdapter,
    },
  ],
})
export class OperationCancellationModule {}
