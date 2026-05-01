import { Module } from '@nestjs/common';
import { AGENT_RUNNER_PORT } from './application/port/in/agent-runner.port';
import { AGENT_SCHEDULE_CONTROL_PORT } from './application/port/in/agent-schedule-control.port';
import { AgentRuntimeRunnerAdapter } from './adapter/out/agent-runtime/agent-runner.adapter';
import { AgentRuntimeScheduleControlAdapter } from './adapter/out/agent-runtime/agent-schedule-control.adapter';
import { MarketplaceCatalogService } from './application/service/marketplace-catalog.service';
import { MarketplaceInstallService } from './application/service/marketplace-install.service';
import { ActionTaskController } from './adapter/in/http/action-task.controller';
import { AlertsController } from './adapter/in/http/alerts.controller';
import { ManagerController } from './adapter/in/http/manager.controller';
import { MarketplaceController } from './adapter/in/http/marketplace.controller';
import { PanelController } from './adapter/in/http/panel.controller';
import { WorkflowsController, WorkflowRunsController } from './adapter/in/http/workflows.controller';
import { PrismaMarketplaceInstallStoreAdapter } from './adapter/out/prisma/marketplace-install-store.adapter';
import { MARKETPLACE_INSTALL_STORE_PORT } from './application/port/out/marketplace-install-store.port';
import { ActionBoardService } from './application/service/action-board.service';
import { ManagerService } from './application/service/agent/manager.service';
import { AlertsService } from './application/service/alerts.service';
import { PanelService } from './adapter/out/panel-event/panel.service';
import { PanelSseService } from './adapter/out/panel-event/panel-sse.service';
import { WorkflowOrchestrationService } from './application/service/workflow-orchestration.service';
import { WorkflowRunnerService } from './application/service/workflow-runner.service';

/**
 * `automation/` is the owner-domain home of the Agent OS / Automation
 * runtime per `apps/server/AGENTS.md` Domain Topology Target. Inbound
 * adapters (HTTP controllers under `adapter/in/http/`) and outbound
 * adapters to the agent runtime (under `adapter/out/agent-runtime/`)
 * live here, with use-case ports and application services under
 * `application/`.
 *
 * Registered surfaces (in chronological landing order):
 * - Phase 3C-2: `AgentScheduleControlPort` + `AgentRuntimeScheduleControlAdapter`
 *   — used by `RulesController` for `rules_evaluation` schedule control.
 * - AO-3A: `AgentRunnerPort` + `AgentRuntimeRunnerAdapter` — used by
 *   business domains such as `rules/` to request Agent OS work without
 *   injecting the compatibility `AgentRegistryService` directly.
 * - Phase 3C-3: `MarketplaceInstallService` (install/uninstall
 *   orchestration) + `PrismaMarketplaceInstallStoreAdapter` (tenant-scoped
 *   persistence) + `MarketplaceController` HTTP adapter. Catalog read
 *   originally remained behind a separate `MarketplaceModule`; the
 *   Wave H3 marketplace fold (below) collapsed it into automation.
 * - Phase 3C-4: `PanelController` HTTP adapter + `PanelService` /
 *   `PanelSseService` outgoing panel-event adapter. Panel remains a
 *   read-only projection over workflow / agent / image / alert sources.
 * - Phase 3C-5: `WorkflowOrchestrationService` + `WorkflowRunnerService`
 *   own template CRUD, run creation, trusted tenant binding, DAG execution,
 *   panel emission, and Agent OS delegation. Workflow HTTP routes and DTOs
 *   now live under automation inbound HTTP adapters.
 * - Phase 3C-6: AgentRegistry implementation split lives under
 *   `application/service/agent-*.service.ts`; Claude/Python execution
 *   adapters live under `adapter/out/agent-runtime/`. They are registered by
 *   `AgentRegistryModule` to preserve the public `AgentRegistryService`
 *   injection token during migration.
 * - Phase 3C-7: `ActionTaskController` HTTP adapter + `ActionBoardService`
 *   own `/api/action-tasks/*`. Daily action seed thresholds live in pure
 *   `domain/policy/action-seeds.ts`; the legacy `action-task/` top-level
 *   module is deleted.
 * - Wave H3 AO-1: `WorkflowsController` + `WorkflowRunsController` HTTP
 *   adapters fold the former top-level `workflows/` compatibility surface
 *   into automation. Public routes (`/api/workflows/*`,
 *   `/api/workflow-runs/:runId`) are preserved unchanged.
 * - Wave H3 AO-2: `AlertsController` + `AlertsService` fold the former
 *   `rules/` alerts HTTP surface into automation. The promote/dismiss race
 *   guard, panel UPSERT/DISMISS emission contract, and `/api/alerts/*` route
 *   shape are preserved unchanged. The application service now consumes a
 *   `PromoteAlertInput` interface (no class-validator dependency).
 * - Wave H3 marketplace fold: `MarketplaceCatalogService` (catalog
 *   read-side projection) absorbed from the deleted top-level
 *   `marketplace/` module. The slim-core node-type allowlist moved to
 *   `adapter/out/workflow-runner/executors/slim-core-allowlist.ts` so it
 *   sits next to its lockstep counterpart `builtin.ts`. Public routes
 *   `/api/marketplace/workflows*` and `/api/marketplace/agents*` and the
 *   `@CurrentOrganization()` tenant trust contract are unchanged.
 */
@Module({
  controllers: [
    MarketplaceController,
    PanelController,
    ActionTaskController,
    AlertsController,
    ManagerController,
    WorkflowsController,
    WorkflowRunsController,
  ],
  providers: [
    {
      provide: AGENT_RUNNER_PORT,
      useClass: AgentRuntimeRunnerAdapter,
    },
    {
      provide: AGENT_SCHEDULE_CONTROL_PORT,
      useClass: AgentRuntimeScheduleControlAdapter,
    },
    {
      provide: MARKETPLACE_INSTALL_STORE_PORT,
      useClass: PrismaMarketplaceInstallStoreAdapter,
    },
    ActionBoardService,
    AlertsService,
    ManagerService,
    MarketplaceCatalogService,
    MarketplaceInstallService,
    PanelService,
    PanelSseService,
    WorkflowOrchestrationService,
    WorkflowRunnerService,
  ],
  exports: [
    AGENT_RUNNER_PORT,
    AGENT_SCHEDULE_CONTROL_PORT,
    ActionBoardService,
    PanelSseService,
    WorkflowOrchestrationService,
  ],
})
export class AutomationModule {}
