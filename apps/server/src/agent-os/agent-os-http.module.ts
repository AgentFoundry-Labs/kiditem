import { Module } from '@nestjs/common';
import { AgentCatalogController } from './adapter/in/http/agent-catalog.controller';
import { AgentApprovalsController } from './adapter/in/http/agent-approvals.controller';
import { AgentConversationsController } from './adapter/in/http/agent-conversations.controller';
import { AgentExecutorController } from './adapter/in/http/agent-executor.controller';
import { AgentRunObservabilityController } from './adapter/in/http/agent-run-observability.controller';
import { AgentRunRequestsController } from './adapter/in/http/agent-run-requests.controller';
import { AgentRunsQueryController } from './adapter/in/http/agent-runs-query.controller';
import { AgentInlineRunReconciler } from './application/service/agent-inline-run-reconciler.service';
import { AgentOsModule } from './agent-os.module';

@Module({
  imports: [AgentOsModule],
  controllers: [
    AgentCatalogController,
    AgentRunRequestsController,
    AgentExecutorController,
    AgentRunsQueryController,
    AgentRunObservabilityController,
    AgentApprovalsController,
    AgentConversationsController,
  ],
  providers: [AgentInlineRunReconciler],
})
export class AgentOsHttpModule {}
