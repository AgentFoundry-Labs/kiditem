export interface WorkflowCatalogInstallSource {
  id: string;
  type: 'workflow' | string;
  name: string;
  description: string;
  module: string | null;
  nodesJson: unknown;
  edgesJson: unknown;
  configurableParams: unknown;
}

export type MarketplaceInstallParams = Readonly<Record<string, unknown>>;

export interface CreateWorkflowInstallationInput {
  organizationId: string;
  name: string;
  description: string;
  module: string;
  isActive: boolean;
  triggerType: string;
  schedule: string | null;
  nodesJson: unknown;
  edgesJson: unknown;
  marketplaceId: string;
}

export interface InstalledWorkflowTemplateSnapshot {
  id: string;
}

export interface MarketplaceInstallStorePort {
  findWorkflowCatalog(
    marketplaceId: string,
  ): Promise<WorkflowCatalogInstallSource | null>;

  createWorkflowInstallation(
    input: CreateWorkflowInstallationInput,
  ): Promise<InstalledWorkflowTemplateSnapshot>;

  findInstalledWorkflow(
    marketplaceId: string,
    organizationId: string,
  ): Promise<InstalledWorkflowTemplateSnapshot | null>;

  deleteInstalledWorkflow(templateId: string, organizationId: string): Promise<boolean>;

  decrementInstallCountIfPositive(marketplaceId: string): Promise<void>;
}

export const MARKETPLACE_INSTALL_STORE_PORT = Symbol(
  'MarketplaceInstallStorePort',
);
