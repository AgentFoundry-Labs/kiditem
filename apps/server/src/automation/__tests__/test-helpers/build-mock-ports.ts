// Mock-port factories for automation application/service specs. Each
// builder returns a `vi.fn()`-backed object that satisfies the matching
// port interface; tests attach `.mockResolvedValue(...)` etc. per case.
//
// One builder per port under
// `apps/server/src/automation/application/port/{in,out}/`.

import { vi } from 'vitest';
import type { ActionBoardRepositoryPort } from '../../application/port/out/repository/action-board.repository.port';
import type { AlertsRepositoryPort } from '../../application/port/out/repository/alerts.repository.port';
import type { MarketplaceCatalogRepositoryPort } from '../../application/port/out/repository/marketplace-catalog.repository.port';
import type { MarketplaceInstallStorePort } from '../../application/port/out/repository/marketplace-install-store.port';
import type { OperationAlertRepositoryPort } from '../../application/port/out/repository/operation-alert.repository.port';
import type { WorkflowOrchestrationRepositoryPort } from '../../application/port/out/repository/workflow-orchestration.repository.port';
import type { OperationAlertPort } from '../../application/port/in/operation-alert.port';

export type MockActionBoardRepo = {
  [K in keyof ActionBoardRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockActionBoardRepo(): MockActionBoardRepo {
  return {
    fetchPerListingMetrics: vi.fn(),
    countOutOfStockMasterProducts: vi.fn(),
    countMappingAttentionChannelSkus: vi.fn(),
    countLowCtrThumbnails: vi.fn(),
    findAGradeReviewCounts: vi.fn(),
    upsertActionTaskSeed: vi.fn(),
    findActionTasksForDay: vi.fn(),
    findActionTaskScoped: vi.fn(),
    updateActionTaskOrThrow: vi.fn(),
    claimActionTask: vi.fn(),
    unclaimActionTask: vi.fn(),
    listActionTasks: vi.fn(),
    findAlertsByTaskIds: vi.fn(),
  };
}

export type MockAlertsRepo = {
  [K in keyof AlertsRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockAlertsRepo(): MockAlertsRepo {
  return {
    findUnreadAlerts: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    promoteAlertToTask: vi.fn(),
    dismissAlert: vi.fn(),
  };
}

export type MockMarketplaceCatalogRepo = {
  [K in keyof MarketplaceCatalogRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockMarketplaceCatalogRepo(): MockMarketplaceCatalogRepo {
  return {
    fetchWorkflowCatalog: vi.fn(),
    findWorkflowById: vi.fn(),
    fetchAgentCatalog: vi.fn(),
    findAgentById: vi.fn(),
  };
}

export type MockMarketplaceInstallStore = {
  [K in keyof MarketplaceInstallStorePort]: ReturnType<typeof vi.fn>;
};

export function buildMockMarketplaceInstallStore(): MockMarketplaceInstallStore {
  return {
    findWorkflowCatalog: vi.fn(),
    createWorkflowInstallation: vi.fn(),
    findInstalledWorkflow: vi.fn(),
    deleteInstalledWorkflow: vi.fn(),
    decrementInstallCountIfPositive: vi.fn(),
  };
}

export type MockOperationAlertRepo = {
  [K in keyof OperationAlertRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockOperationAlertRepo(): MockOperationAlertRepo {
  return {
    upsertByOperationKey: vi.fn(),
    transition: vi.fn(),
    findLatestBySource: vi.fn(),
    findByOperationKey: vi.fn(),
    closeStaleOperations: vi.fn(),
  };
}

export type MockWorkflowOrchestrationRepo = {
  [K in keyof WorkflowOrchestrationRepositoryPort]: ReturnType<typeof vi.fn>;
};

export function buildMockWorkflowOrchestrationRepo(): MockWorkflowOrchestrationRepo {
  return {
    createTemplate: vi.fn(),
    findTemplates: vi.fn(),
    findTemplateScopedWithRunCount: vi.fn(),
    findTemplateScoped: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    findTemplatesByIds: vi.fn(),
    createRun: vi.fn(),
    findRunsByTemplate: vi.fn(),
    findRunScoped: vi.fn(),
    fetchPanelEnvelope: vi.fn(),
  };
}

export type MockOperationAlertPort = {
  [K in keyof OperationAlertPort]: ReturnType<typeof vi.fn>;
};

export function buildMockOperationAlertPort(): MockOperationAlertPort {
  return {
    start: vi.fn(),
    findByOperationKey: vi.fn(),
    progress: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
    cancel: vi.fn(),
    closeBySource: vi.fn(),
    closeStaleOperations: vi.fn(),
  };
}
