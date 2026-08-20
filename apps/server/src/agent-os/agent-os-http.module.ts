import { Module } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OperationsModule } from '../operations/operations.module';
import { AgentAguiController } from './adapter/in/http/agent-agui.controller';
import { AgentCatalogController } from './adapter/in/http/agent-catalog.controller';
import { AgentApprovalsController } from './adapter/in/http/agent-approvals.controller';
import { AgentConversationsController } from './adapter/in/http/agent-conversations.controller';
import { AgentExecutorController } from './adapter/in/http/agent-executor.controller';
import { AgentInteractionActionsController } from './adapter/in/http/agent-interaction-actions.controller';
import { AgentInteractionBootstrapController } from './adapter/in/http/agent-interaction-bootstrap.controller';
import { AgentInteractionControlController } from './adapter/in/http/agent-interaction-control.controller';
import { AgentRunObservabilityController } from './adapter/in/http/agent-run-observability.controller';
import { AgentRunRequestsController } from './adapter/in/http/agent-run-requests.controller';
import { AgentRunsQueryController } from './adapter/in/http/agent-runs-query.controller';
import { AgentSessionController } from './adapter/in/http/agent-session.controller';
import { InteractionGatewayGuard } from './adapter/in/http/interaction-gateway.guard';
import { AgentSessionTaskOperationHandler } from './adapter/in/operation/agent-session-task.operation-handler';
import { InteractionProductAnalyticsAdapter } from './adapter/out/event/interaction-product-analytics.adapter';
import { OpenAiResponsesAguiRuntimeAdapter } from './adapter/out/runtime/openai-responses-agui-runtime.adapter';
import { AGENT_AGUI_RUNNER_PORT } from './application/port/in/agent-agui-runner.port';
import { INTERACTION_PRODUCT_ANALYTICS_PORT } from './application/port/out/event/interaction-product-analytics.port';
import { AgentAguiProducerCoordinator } from './application/service/agent-agui-producer-coordinator.service';
import { AgentAguiRunService } from './application/service/agent-agui-run.service';
import { AgentAguiRuntimeRegistry } from './application/service/agent-agui-runtime-registry.service';
import { AgentInlineRunReconciler } from './application/service/agent-inline-run-reconciler.service';
import { AgentInteractionIdentityService } from './application/service/agent-interaction-identity.service';
import { AgentInteractionPresentationService } from './application/service/agent-interaction-presentation.service';
import { interactionEnvironmentProviders } from './application/service/agent-interaction.tokens';
import { AgentSessionApprovalService } from './application/service/agent-session-approval.service';
import { AgentSessionCancellationService } from './application/service/agent-session-cancellation.service';
import { AgentSessionDelegationService } from './application/service/agent-session-delegation.service';
import { AgentSessionExecutionService } from './application/service/agent-session-execution.service';
import { AgentSessionOperationContinuationService } from './application/service/agent-session-operation-continuation.service';
import { AgentSessionRuntimeControlService } from './application/service/agent-session-runtime-control.service';
import { AgentSessionTaskDispatchService } from './application/service/agent-session-task-dispatch.service';
import { AgentOsModule } from './agent-os.module';

@Module({
  imports: [AgentOsModule, OperationsModule],
  controllers: [
    AgentCatalogController,
    AgentRunRequestsController,
    AgentExecutorController,
    AgentRunsQueryController,
    AgentRunObservabilityController,
    AgentApprovalsController,
    AgentConversationsController,
    AgentInteractionBootstrapController,
    AgentInteractionControlController,
    AgentAguiController,
    AgentInteractionActionsController,
    AgentSessionController,
  ],
  providers: [
    AgentInlineRunReconciler,
    ...interactionEnvironmentProviders,
    AgentInteractionIdentityService,
    InteractionGatewayGuard,
    AgentAguiRunService,
    AgentAguiProducerCoordinator,
    AgentAguiRuntimeRegistry,
    OpenAiResponsesAguiRuntimeAdapter,
    {
      provide: AgentInteractionPresentationService,
      useFactory: () => new AgentInteractionPresentationService(),
    },
    AgentSessionRuntimeControlService,
    AgentSessionOperationContinuationService,
    AgentSessionApprovalService,
    AgentSessionCancellationService,
    AgentSessionExecutionService,
    AgentSessionTaskDispatchService,
    AgentSessionDelegationService,
    AgentSessionTaskOperationHandler,
    {
      provide: InteractionProductAnalyticsAdapter,
      inject: [EventEmitter2],
      useFactory: (events: EventEmitter2) => {
        const key = process.env.INTERACTION_ANALYTICS_HMAC_KEY;
        if (!key) throw new Error('INTERACTION_ANALYTICS_HMAC_KEY_REQUIRED');
        return new InteractionProductAnalyticsAdapter(
          key,
          async (event) => {
            events.emit('interaction.product.analytics', event);
          },
        );
      },
    },
    {
      provide: INTERACTION_PRODUCT_ANALYTICS_PORT,
      useExisting: InteractionProductAnalyticsAdapter,
    },
    {
      provide: AGENT_AGUI_RUNNER_PORT,
      useExisting: AgentAguiRunService,
    },
  ],
})
export class AgentOsHttpModule {}
