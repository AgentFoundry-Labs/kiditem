import { Module } from '@nestjs/common';
import { AgentOsModule } from '../agent-os/agent-os.module';
import { MarketplaceCatalogService } from './application/service/marketplace-catalog.service';
import { MarketplaceInstallService } from './application/service/marketplace-install.service';
import { ActionTaskController } from './adapter/in/http/action-task.controller';
import { AlertsController } from './adapter/in/http/alerts.controller';
import { MarketplaceController } from './adapter/in/http/marketplace.controller';
import { PanelController } from './adapter/in/http/panel.controller';
import { WorkflowsController, WorkflowRunsController } from './adapter/in/http/workflows.controller';
import { PrismaMarketplaceInstallStoreAdapter } from './adapter/out/prisma/marketplace-install-store.adapter';
import { MARKETPLACE_INSTALL_STORE_PORT } from './application/port/out/marketplace-install-store.port';
import { ActionBoardService } from './application/service/action-board.service';
import { AlertsService } from './application/service/alerts.service';
import { PanelService } from './adapter/out/panel-event/panel.service';
import { PanelSseService } from './adapter/out/panel-event/panel-sse.service';
import { WorkflowOrchestrationService } from './application/service/workflow-orchestration.service';
import { WorkflowRunnerService } from './application/service/workflow-runner.service';

/**
 * `automation/` is the workflow-runner / action-board / alerts /
 * marketplace catalog / panel projection owner domain. Agent execution
 * (blueprint, instance, run request, run, runtime adapter, observability)
 * lives in the sibling `agent-os/` owner domain. This module imports
 * `AgentOsModule` so workflow runner nodes (`agent_task.create`) can
 * inject `AGENT_RUNNER_PORT` to delegate work without taking a hard
 * dependency on a runtime adapter.
 *
 * Registered surfaces:
 * - `MarketplaceController` — workflow install/uninstall via
 *   `MarketplaceInstallService`. Agent install/uninstall returns
 *   `BadRequestException` until Agent OS v2 catalog wiring lands; see
 *   `automation/adapter/out/panel-event/AGENTS.md` "Not yet wired".
 * - `PanelController` + `PanelService` / `PanelSseService` — read-only
 *   projection over workflow / image / alert sources. Live agent run
 *   projection was retired with the legacy `HeartbeatRun` /
 *   `AgentDefinition` models; Agent OS v2 will own the next iteration.
 * - `WorkflowsController` / `WorkflowRunsController` +
 *   `WorkflowOrchestrationService` + `WorkflowRunnerService` — template
 *   CRUD, run creation, trusted tenant binding, DAG execution, panel
 *   emission, and Agent OS delegation for `agent_task.create` nodes.
 * - `ActionTaskController` + `ActionBoardService` — `/api/action-tasks/*`.
 *   Daily action seed thresholds live in pure
 *   `domain/policy/action-seeds.ts`.
 * - `AlertsController` + `AlertsService` — `/api/alerts/*` plus the
 *   promote/dismiss race guard and panel UPSERT/DISMISS contract.
 *
 * Consumers that previously injected `AGENT_RUNNER_PORT` from this
 * module should depend on `AgentOsModule` directly (re-exported here for
 * convenience during the migration).
 */
@Module({
  imports: [AgentOsModule],
  controllers: [
    MarketplaceController,
    PanelController,
    ActionTaskController,
    AlertsController,
    WorkflowsController,
    WorkflowRunsController,
  ],
  providers: [
    {
      provide: MARKETPLACE_INSTALL_STORE_PORT,
      useClass: PrismaMarketplaceInstallStoreAdapter,
    },
    ActionBoardService,
    AlertsService,
    MarketplaceCatalogService,
    MarketplaceInstallService,
    PanelService,
    PanelSseService,
    WorkflowOrchestrationService,
    WorkflowRunnerService,
  ],
  exports: [
    AgentOsModule,
    ActionBoardService,
    PanelSseService,
    WorkflowOrchestrationService,
  ],
})
export class AutomationModule {}
