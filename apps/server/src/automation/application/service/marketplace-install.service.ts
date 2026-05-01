import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { collectInvalidNodeTypes } from '../../adapter/out/workflow-runner/executors/slim-core-allowlist';
import {
  MarketplaceInstallParams,
  MarketplaceInstallStorePort,
  MARKETPLACE_INSTALL_STORE_PORT,
} from '../port/out/marketplace-install-store.port';

interface ConfigurableParamMapping {
  key?: unknown;
  nodeId?: unknown;
}

interface WorkflowNode {
  id?: unknown;
  config?: Record<string, unknown> | null;
  [key: string]: unknown;
}

function configurableParamsFrom(value: unknown): ConfigurableParamMapping[] {
  return Array.isArray(value) ? (value as ConfigurableParamMapping[]) : [];
}

function stringParam(params: MarketplaceInstallParams | undefined, key: string) {
  const value = params?.[key];
  return typeof value === 'string' ? value : undefined;
}

function numberParam(params: MarketplaceInstallParams | undefined, key: string) {
  const value = params?.[key];
  return typeof value === 'number' ? value : undefined;
}

function booleanParam(params: MarketplaceInstallParams | undefined, key: string) {
  const value = params?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Application service that owns the runtime side effects of installing
 * and uninstalling marketplace catalog items into a tenant's workspace:
 *
 * - Workflow install clones the catalog row into `WorkflowTemplate` after
 *   re-validating the slim-core node-type allowlist (defense-in-depth)
 *   and applying caller-supplied configurable params.
 * - Agent install clones into `AgentDefinition` and auto-wires
 *   `reportsTo` for specialists.
 * - Uninstall removes the tenant's installed instance and decrements the
 *   catalog's `installCount`.
 *
 * Catalog read/list (`MarketplaceCatalogService` next to this service)
 * intentionally stays separate: it has no runtime side effects and is a
 * read-only projection of the catalog table.
 *
 * Tenant scope:
 * - All writes bind `organizationId` from the trusted `@CurrentOrganization()`
 *   value the controller passes in. Catalog rows themselves are global
 *   (organizationId-less); the slot of "owns this install" is recorded by
 *   the cloned `WorkflowTemplate.organizationId` / `AgentDefinition.organizationId`.
 * - Uninstall reads the tenant's installed row by `(marketplaceId,
 *   organizationId)` before delete so a foreign-tenant id cannot be used to
 *   remove another organization's installation.
 */
@Injectable()
export class MarketplaceInstallService {
  constructor(
    @Inject(MARKETPLACE_INSTALL_STORE_PORT)
    private readonly store: MarketplaceInstallStorePort,
  ) {}

  async installWorkflow(
    marketplaceId: string,
    organizationId: string,
    params?: MarketplaceInstallParams,
  ) {
    const catalog = await this.store.findWorkflowCatalog(marketplaceId);
    if (!catalog || catalog.type !== 'workflow') {
      throw new NotFoundException('Workflow catalog item not found');
    }

    const invalidNodeTypes = collectInvalidNodeTypes(catalog.nodesJson);
    if (invalidNodeTypes.length > 0) {
      throw new BadRequestException(
        `Workflow catalog "${catalog.name}" uses unsupported node types: ${invalidNodeTypes.join(', ')}`,
      );
    }

    let nodesJson = catalog.nodesJson as WorkflowNode[];
    if (params) {
      const configurableParams = configurableParamsFrom(catalog.configurableParams);
      for (const cp of configurableParams) {
        const key = cp.key;
        const nodeId = cp.nodeId;
        if (
          typeof key === 'string' &&
          typeof nodeId === 'string' &&
          params[key] !== undefined
        ) {
          nodesJson = nodesJson.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  config: {
                    ...(node.config ?? {}),
                    [key]: params[key],
                  },
                }
              : node,
          );
        }
      }
    }

    const schedule = stringParam(params, 'schedule');
    const template = await this.store.createWorkflowInstallation({
      organizationId,
      name: catalog.name,
      description: catalog.description,
      module: catalog.module ?? 'order',
      isActive: true,
      triggerType: schedule ? 'scheduled' : 'manual',
      schedule: schedule ?? null,
      nodesJson,
      edgesJson: catalog.edgesJson,
      marketplaceId,
    });

    return template;
  }

  async installAgent(
    marketplaceId: string,
    organizationId: string,
    params?: MarketplaceInstallParams,
  ) {
    const catalog = await this.store.findAgentCatalog(marketplaceId);
    if (!catalog || catalog.type !== 'agent') {
      throw new NotFoundException('Agent catalog item not found');
    }

    const schedule = stringParam(params, 'schedule');
    const monthlyTokenBudget = numberParam(params, 'monthlyTokenBudget');
    const requiresApproval = booleanParam(params, 'requiresApproval');
    const timeoutSeconds = numberParam(params, 'timeoutSeconds');

    const agent = await this.store.createAgentInstallation({
      organizationId,
      name: catalog.name,
      type: `${catalog.name.replace(/\s/g, '_').toLowerCase()}_${Date.now()}`,
      description: catalog.description,
      adapterType: catalog.adapterType ?? 'claude_local',
      adapterConfig: { command: 'claude' },
      role: catalog.role ?? 'specialist',
      title: catalog.name,
      icon: catalog.icon,
      skills: catalog.skills,
      permissions: catalog.permissions ?? {},
      promptTemplate: catalog.promptTemplate ?? '',
      allowedTools: 'Bash(psql:*) Read Grep',
      permissionMode: 'bypassPermissions',
      marketplaceId,
      isActive: true,
      ...(schedule !== undefined && { schedule }),
      ...(monthlyTokenBudget !== undefined && { monthlyTokenBudget }),
      ...(requiresApproval !== undefined && { requiresApproval }),
      ...(timeoutSeconds !== undefined && { timeoutSeconds }),
    });

    // Specialists report to a manager in the same organization when one exists.
    if (agent.role === 'specialist') {
      const manager = await this.store.findTenantManager(organizationId);
      if (manager) {
        await this.store.assignAgentReportsTo(agent.id, organizationId, manager.id);
      }
    }

    return agent;
  }

  async uninstallWorkflow(
    marketplaceId: string,
    organizationId: string,
  ): Promise<{ ok: boolean }> {
    const installed = await this.store.findInstalledWorkflow(
      marketplaceId,
      organizationId,
    );
    if (!installed) {
      throw new NotFoundException('설치된 워크플로우를 찾을 수 없습니다');
    }

    const deleted = await this.store.deleteInstalledWorkflow(
      installed.id,
      organizationId,
    );
    if (deleted) {
      await this.store.decrementInstallCountIfPositive(marketplaceId);
    }

    return { ok: true };
  }

  async uninstallAgent(
    marketplaceId: string,
    organizationId: string,
  ): Promise<{ ok: boolean }> {
    const installed = await this.store.findInstalledAgent(marketplaceId, organizationId);
    if (!installed) {
      throw new NotFoundException('설치된 에이전트를 찾을 수 없습니다');
    }

    const deleted = await this.store.deleteInstalledAgent(installed.id, organizationId);
    if (deleted) {
      await this.store.decrementInstallCountIfPositive(marketplaceId);
    }

    return { ok: true };
  }
}
