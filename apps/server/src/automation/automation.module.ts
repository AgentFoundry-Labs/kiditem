import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentOsModule } from '../agent-os/agent-os.module';

// adapter/in/http
import { ActionTaskController } from './adapter/in/http/action-task.controller';
import { AlertsController } from './adapter/in/http/alerts.controller';
import { MarketplaceAgentsController } from './adapter/in/http/marketplace-agents.controller';
import { MarketplaceWorkflowsController } from './adapter/in/http/marketplace-workflows.controller';
import { OperationAlertLifecycleController } from './adapter/in/http/operation-alert-lifecycle.controller';
import { PanelController } from './adapter/in/http/panel.controller';
import {
  WorkflowRunDetailsController,
  WorkflowRunsController,
} from './adapter/in/http/workflow-runs.controller';
import { WorkflowRunCommandsController } from './adapter/in/http/workflow-run-commands.controller';
import { WorkflowTemplatesController } from './adapter/in/http/workflow-templates.controller';

// adapter/out/repository
import { ActionBoardRepositoryAdapter } from './adapter/out/repository/action-board.repository.adapter';
import { AlertsRepositoryAdapter } from './adapter/out/repository/alerts.repository.adapter';
import { MarketplaceCatalogRepositoryAdapter } from './adapter/out/repository/marketplace-catalog.repository.adapter';
import { MarketplaceInstallStoreRepositoryAdapter } from './adapter/out/repository/marketplace-install-store.repository.adapter';
import { OperationAlertRepositoryAdapter } from './adapter/out/repository/operation-alert.repository.adapter';
import { WorkflowOrchestrationRepositoryAdapter } from './adapter/out/repository/workflow-orchestration.repository.adapter';

// adapter/out/panel-event
import { PanelService } from './adapter/out/panel-event/panel.service';
import { PanelSseService } from './adapter/out/panel-event/panel-sse.service';

// application/service
import { ActionBoardService } from './application/service/action-board.service';
import { AgentRunOperationAlertBridge } from './application/service/agent-run-operation-alert.bridge';
import { AlertsService } from './application/service/alerts.service';
import { MarketplaceCatalogService } from './application/service/marketplace-catalog.service';
import { MarketplaceInstallService } from './application/service/marketplace-install.service';
import { OperationAlertService } from './application/service/operation-alert.service';
import { WorkflowOrchestrationService } from './application/service/workflow-orchestration.service';
import { WorkflowRunnerService } from './application/service/workflow-runner.service';

// application/port/in tokens (owner-side publish)
import { OPERATION_ALERT_PORT } from './application/port/in/operation-alert.port';
import { WORKFLOW_RUN_CANCELLATION_PORT } from './application/port/in/workflow-run-cancellation.port';

// application/port/out tokens
import { ACTION_BOARD_REPOSITORY_PORT } from './application/port/out/action-board.repository.port';
import { ALERTS_REPOSITORY_PORT } from './application/port/out/alerts.repository.port';
import { MARKETPLACE_CATALOG_REPOSITORY_PORT } from './application/port/out/marketplace-catalog.repository.port';
import { MARKETPLACE_INSTALL_STORE_PORT } from './application/port/out/marketplace-install-store.port';
import { OPERATION_ALERT_REPOSITORY_PORT } from './application/port/out/operation-alert.repository.port';
import { WORKFLOW_ORCHESTRATION_REPOSITORY_PORT } from './application/port/out/workflow-orchestration.repository.port';

/**
 * `automation/` is the workflow-runner / action-board / alerts /
 * marketplace catalog / panel projection owner domain.
 *
 * Hexagonal layout — application services depend on
 * `application/port/out/*` tokens; concrete repository adapters bind via
 * `useExisting`. Cross-owner-domain consumers (advertising, ai, channels,
 * finance, rules, sourcing, analytics/traffic) bind their consumer-side
 * `adapter/out/automation/operation-alert.adapter.ts` to the published
 * owner-side `OPERATION_ALERT_PORT` token re-exported below instead of
 * injecting `OperationAlertService` concretely.
 *
 * Transitional carve-out: `WorkflowRunnerService` still holds
 * `PrismaService` because the workflow executor framework
 * (`adapter/out/workflow-runner/executors/*`) takes a `PrismaService`
 * argument by design. The architecture spec documents this exception;
 * the follow-up PR will redesign the executor framework so the runner can
 * depend on a port like every other service.
 *
 * Agent execution (definition registry, instance, run request, run, runtime
 * adapter, observability) lives in the sibling `agent-os/` owner domain.
 * `AgentOsModule` is imported so workflow runner nodes
 * (`agent_task.create`) can inject `AGENT_RUNNER_PORT`.
 */

// `application/port/out/*` ports bound to their adapters via `useExisting`
// so application services depend on tokens, not concrete classes.
const OUT_PORT_BINDINGS = [
  { provide: ACTION_BOARD_REPOSITORY_PORT, useExisting: ActionBoardRepositoryAdapter },
  { provide: ALERTS_REPOSITORY_PORT, useExisting: AlertsRepositoryAdapter },
  { provide: MARKETPLACE_CATALOG_REPOSITORY_PORT, useExisting: MarketplaceCatalogRepositoryAdapter },
  { provide: MARKETPLACE_INSTALL_STORE_PORT, useExisting: MarketplaceInstallStoreRepositoryAdapter },
  { provide: OPERATION_ALERT_REPOSITORY_PORT, useExisting: OperationAlertRepositoryAdapter },
  { provide: WORKFLOW_ORCHESTRATION_REPOSITORY_PORT, useExisting: WorkflowOrchestrationRepositoryAdapter },
];

// `application/port/in/*` published for cross-owner-domain consumers.
const IN_PORT_BINDINGS = [
  { provide: OPERATION_ALERT_PORT, useExisting: OperationAlertService },
  { provide: WORKFLOW_RUN_CANCELLATION_PORT, useExisting: WorkflowRunnerService },
];

@Module({
  imports: [PrismaModule, AgentOsModule],
  controllers: [
    MarketplaceWorkflowsController,
    MarketplaceAgentsController,
    PanelController,
    ActionTaskController,
    AlertsController,
    OperationAlertLifecycleController,
    WorkflowTemplatesController,
    WorkflowRunCommandsController,
    WorkflowRunsController,
    WorkflowRunDetailsController,
  ],
  providers: [
    // adapter/out/repository
    ActionBoardRepositoryAdapter,
    AlertsRepositoryAdapter,
    MarketplaceCatalogRepositoryAdapter,
    MarketplaceInstallStoreRepositoryAdapter,
    OperationAlertRepositoryAdapter,
    WorkflowOrchestrationRepositoryAdapter,
    // adapter/out/panel-event
    PanelService,
    PanelSseService,
    // application/service
    ActionBoardService,
    AgentRunOperationAlertBridge,
    AlertsService,
    OperationAlertService,
    MarketplaceCatalogService,
    MarketplaceInstallService,
    WorkflowOrchestrationService,
    WorkflowRunnerService,
    // port bindings
    ...OUT_PORT_BINDINGS,
    ...IN_PORT_BINDINGS,
  ],
  exports: [
    AgentOsModule,
    // Owner-side incoming port for cross-domain consumers
    OPERATION_ALERT_PORT,
    WORKFLOW_RUN_CANCELLATION_PORT,
    // Legacy class exports — kept while non-reconstructed consumers
    // still inject these concretely. Operation alerts have moved to the
    // owner-side OPERATION_ALERT_PORT; the remaining exports retire as
    // their consumers move to owner-side ports.
    ActionBoardService,
    PanelSseService,
    WorkflowOrchestrationService,
  ],
})
export class AutomationModule {}
