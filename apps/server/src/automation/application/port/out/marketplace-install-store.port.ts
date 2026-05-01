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

export interface AgentCatalogInstallSource {
  id: string;
  type: 'agent' | string;
  name: string;
  description: string | null;
  adapterType: string | null;
  role: string | null;
  icon: string | null;
  skills: string[];
  permissions: unknown;
  promptTemplate: string | null;
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

export interface CreateAgentInstallationInput {
  organizationId: string;
  name: string;
  type: string;
  description: string | null;
  adapterType: string;
  adapterConfig: unknown;
  role: string;
  title: string;
  icon: string | null;
  skills: string[];
  permissions: unknown;
  promptTemplate: string;
  allowedTools: string;
  permissionMode: string;
  marketplaceId: string;
  isActive: boolean;
  schedule?: string;
  monthlyTokenBudget?: number;
  requiresApproval?: boolean;
  timeoutSeconds?: number;
}

export interface InstalledWorkflowTemplateSnapshot {
  id: string;
}

export interface InstalledAgentDefinitionSnapshot {
  id: string;
  role: string | null;
}

export interface TenantManagerAgentSnapshot {
  id: string;
}

export interface MarketplaceInstallStorePort {
  findWorkflowCatalog(
    marketplaceId: string,
  ): Promise<WorkflowCatalogInstallSource | null>;

  findAgentCatalog(marketplaceId: string): Promise<AgentCatalogInstallSource | null>;

  createWorkflowInstallation(
    input: CreateWorkflowInstallationInput,
  ): Promise<InstalledWorkflowTemplateSnapshot>;

  createAgentInstallation(
    input: CreateAgentInstallationInput,
  ): Promise<InstalledAgentDefinitionSnapshot>;

  findTenantManager(organizationId: string): Promise<TenantManagerAgentSnapshot | null>;

  assignAgentReportsTo(
    agentId: string,
    organizationId: string,
    managerId: string,
  ): Promise<void>;

  findInstalledWorkflow(
    marketplaceId: string,
    organizationId: string,
  ): Promise<InstalledWorkflowTemplateSnapshot | null>;

  deleteInstalledWorkflow(templateId: string, organizationId: string): Promise<boolean>;

  findInstalledAgent(
    marketplaceId: string,
    organizationId: string,
  ): Promise<InstalledAgentDefinitionSnapshot | null>;

  deleteInstalledAgent(agentId: string, organizationId: string): Promise<boolean>;

  decrementInstallCountIfPositive(marketplaceId: string): Promise<void>;
}

export const MARKETPLACE_INSTALL_STORE_PORT = Symbol(
  'MarketplaceInstallStorePort',
);
