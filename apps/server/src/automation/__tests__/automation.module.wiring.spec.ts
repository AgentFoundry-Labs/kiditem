import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { AutomationModule } from '../automation.module';
import { PrismaModule } from '../../prisma/prisma.module';

// adapter/in/http
import { ActionTaskController } from '../adapter/in/http/action-task.controller';
import { AlertsController } from '../adapter/in/http/alerts.controller';
import { MarketplaceAgentsController } from '../adapter/in/http/marketplace-agents.controller';
import { MarketplaceWorkflowsController } from '../adapter/in/http/marketplace-workflows.controller';
import { OperationAlertLifecycleController } from '../adapter/in/http/operation-alert-lifecycle.controller';
import { PanelController } from '../adapter/in/http/panel.controller';
import {
  WorkflowRunDetailsController,
  WorkflowRunsController,
} from '../adapter/in/http/workflow-runs.controller';
import { WorkflowRunCommandsController } from '../adapter/in/http/workflow-run-commands.controller';
import { WorkflowTemplatesController } from '../adapter/in/http/workflow-templates.controller';

// adapter/out/repository
import { ActionBoardRepositoryAdapter } from '../adapter/out/repository/action-board.repository.adapter';
import { AlertsRepositoryAdapter } from '../adapter/out/repository/alerts.repository.adapter';
import { MarketplaceCatalogRepositoryAdapter } from '../adapter/out/repository/marketplace-catalog.repository.adapter';
import { MarketplaceInstallStoreRepositoryAdapter } from '../adapter/out/repository/marketplace-install-store.repository.adapter';
import { OperationAlertRepositoryAdapter } from '../adapter/out/repository/operation-alert.repository.adapter';
import { WorkflowOrchestrationRepositoryAdapter } from '../adapter/out/repository/workflow-orchestration.repository.adapter';

// adapter/out/panel-event
import { PanelService } from '../adapter/out/panel-event/panel.service';
import { PanelSseService } from '../adapter/out/panel-event/panel-sse.service';

// application/service
import { ActionBoardService } from '../application/service/action-board.service';
import { AlertsService } from '../application/service/alerts.service';
import { MarketplaceCatalogService } from '../application/service/marketplace-catalog.service';
import { MarketplaceInstallService } from '../application/service/marketplace-install.service';
import { OperationAlertService } from '../application/service/operation-alert.service';
import { WorkflowOrchestrationService } from '../application/service/workflow-orchestration.service';
import { WorkflowRunnerService } from '../application/service/workflow-runner.service';

// port tokens
import { OPERATION_ALERT_PORT } from '../application/port/in/operation-alert.port';
import { DETERMINISTIC_WORKFLOW_EXECUTION_PORT } from '../application/port/in/workflow-execution.port';
import { WORKFLOW_RUN_CANCELLATION_PORT } from '../application/port/in/workflow-run-cancellation.port';
import { ACTION_BOARD_REPOSITORY_PORT } from '../application/port/out/repository/action-board.repository.port';
import { ALERTS_REPOSITORY_PORT } from '../application/port/out/repository/alerts.repository.port';
import { MARKETPLACE_CATALOG_REPOSITORY_PORT } from '../application/port/out/repository/marketplace-catalog.repository.port';
import { MARKETPLACE_INSTALL_STORE_PORT } from '../application/port/out/repository/marketplace-install-store.port';
import { OPERATION_ALERT_REPOSITORY_PORT } from '../application/port/out/repository/operation-alert.repository.port';
import { WORKFLOW_ORCHESTRATION_REPOSITORY_PORT } from '../application/port/out/repository/workflow-orchestration.repository.port';

const IMPORTS_KEY = 'imports';
const CONTROLLERS_KEY = 'controllers';
const PROVIDERS_KEY = 'providers';
const EXPORTS_KEY = 'exports';
const PATH_KEY = 'path';

const EXPECTED_OUT_PORT_BINDINGS = [
  [ACTION_BOARD_REPOSITORY_PORT, ActionBoardRepositoryAdapter],
  [ALERTS_REPOSITORY_PORT, AlertsRepositoryAdapter],
  [MARKETPLACE_CATALOG_REPOSITORY_PORT, MarketplaceCatalogRepositoryAdapter],
  [MARKETPLACE_INSTALL_STORE_PORT, MarketplaceInstallStoreRepositoryAdapter],
  [OPERATION_ALERT_REPOSITORY_PORT, OperationAlertRepositoryAdapter],
  [WORKFLOW_ORCHESTRATION_REPOSITORY_PORT, WorkflowOrchestrationRepositoryAdapter],
] as const;

const EXPECTED_IN_PORT_BINDINGS = [
  [OPERATION_ALERT_PORT, OperationAlertService],
  [DETERMINISTIC_WORKFLOW_EXECUTION_PORT, WorkflowOrchestrationService],
  [WORKFLOW_RUN_CANCELLATION_PORT, WorkflowRunnerService],
] as const;

// Architecture-guard companion to automation.architecture.spec.ts. Freezes
// @Module() metadata so a removed controller, missing provider, stale
// route prefix, or unbound port fails at vitest time before reaching
// dev:server boot.
describe('AutomationModule capability wiring', () => {
  it('imports only Prisma; Agent OS must call automation, not the reverse', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, AutomationModule) ?? [];
    expect(imports).toEqual([PrismaModule]);
  });

  it('mounts every controller from adapter/in/http', () => {
    const controllers: unknown[] =
      Reflect.getMetadata(CONTROLLERS_KEY, AutomationModule) ?? [];
    expect(new Set(controllers)).toEqual(
      new Set([
        MarketplaceAgentsController,
        MarketplaceWorkflowsController,
        PanelController,
        ActionTaskController,
        AlertsController,
        OperationAlertLifecycleController,
        WorkflowRunCommandsController,
        WorkflowRunDetailsController,
        WorkflowTemplatesController,
        WorkflowRunsController,
      ]),
    );
  });

  it('declares every repository + panel-event adapter as a provider', () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AutomationModule) ?? [];
    for (const cls of [
      ActionBoardRepositoryAdapter,
      AlertsRepositoryAdapter,
      MarketplaceCatalogRepositoryAdapter,
      MarketplaceInstallStoreRepositoryAdapter,
      OperationAlertRepositoryAdapter,
      WorkflowOrchestrationRepositoryAdapter,
      PanelService,
      PanelSseService,
    ]) {
      expect(providers).toContain(cls);
    }
  });

  it('declares every application service as a provider', () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AutomationModule) ?? [];
    for (const cls of [
      ActionBoardService,
      AlertsService,
      OperationAlertService,
      MarketplaceCatalogService,
      MarketplaceInstallService,
      WorkflowOrchestrationService,
      WorkflowRunnerService,
    ]) {
      expect(providers).toContain(cls);
    }
  });

  it('binds every application/port/out/* and application/port/in/* token via useExisting', () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AutomationModule) ?? [];
    const tokenProviders = providers.filter(
      (p): p is { provide: unknown; useExisting?: unknown } =>
        typeof p === 'object' && p !== null && 'provide' in p,
    );
    const expected = [
      ...EXPECTED_OUT_PORT_BINDINGS,
      ...EXPECTED_IN_PORT_BINDINGS,
    ];
    expect(tokenProviders).toHaveLength(expected.length);
    for (const [token, adapterClass] of expected) {
      expect(tokenProviders).toContainEqual({
        provide: token,
        useExisting: adapterClass,
      });
    }
  });

  it('exports owner-side ports for cross-domain consumers', () => {
    const exported: unknown[] =
      Reflect.getMetadata(EXPORTS_KEY, AutomationModule) ?? [];
    expect(exported).toContain(OPERATION_ALERT_PORT);
    expect(exported).toContain(DETERMINISTIC_WORKFLOW_EXECUTION_PORT);
    expect(exported).toContain(WORKFLOW_RUN_CANCELLATION_PORT);
    expect(exported).not.toContain(OperationAlertService);
  });

  it('keeps the public /api route prefixes', () => {
    expect(Reflect.getMetadata(PATH_KEY, ActionTaskController)).toBe('action-tasks');
    expect(Reflect.getMetadata(PATH_KEY, AlertsController)).toBe('alerts');
    expect(Reflect.getMetadata(PATH_KEY, MarketplaceAgentsController)).toBe(
      'marketplace/agents',
    );
    expect(Reflect.getMetadata(PATH_KEY, MarketplaceWorkflowsController)).toBe(
      'marketplace/workflows',
    );
    expect(Reflect.getMetadata(PATH_KEY, OperationAlertLifecycleController)).toBe(
      'operation-alerts',
    );
    expect(Reflect.getMetadata(PATH_KEY, PanelController)).toBe('panel');
    expect(Reflect.getMetadata(PATH_KEY, WorkflowRunCommandsController)).toBe(
      'workflows',
    );
    expect(Reflect.getMetadata(PATH_KEY, WorkflowRunDetailsController)).toBe(
      'workflow-runs',
    );
    expect(Reflect.getMetadata(PATH_KEY, WorkflowTemplatesController)).toBe(
      'workflows',
    );
    expect(Reflect.getMetadata(PATH_KEY, WorkflowRunsController)).toBe('workflows');
  });
});
