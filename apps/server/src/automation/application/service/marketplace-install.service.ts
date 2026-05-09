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

/**
 * Application service that owns the runtime side effects of installing
 * and uninstalling marketplace catalog items into a tenant's workspace.
 *
 * Workflow install clones the catalog row into `WorkflowTemplate` after
 * re-validating the slim-core node-type allowlist (defense-in-depth) and
 * applying caller-supplied configurable params. Uninstall removes the
 * tenant's installed instance and decrements the catalog's `installCount`.
 *
 * Agent install is intentionally not implemented. Shipped Agent OS
 * definitions are code-owned and global; `AgentInstance` remains the
 * tenant-owned runnable subject. Definitions are not cloned per-tenant from
 * marketplace rows. The controller rejects agent install with
 * `BadRequestException` until a real catalog wiring lands.
 *
 * Catalog read/list (`MarketplaceCatalogService` next to this service)
 * stays separate: it has no runtime side effects and is a read-only
 * projection of the catalog table.
 *
 * Tenant scope:
 * - All writes bind `organizationId` from the trusted `@CurrentOrganization()`
 *   value the controller passes in. Catalog rows are global; the
 *   "owns this install" slot is recorded by the cloned
 *   `WorkflowTemplate.organizationId`.
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
}
