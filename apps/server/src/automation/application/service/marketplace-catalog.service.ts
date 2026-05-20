import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MarketplaceCatalogItem, ConfigurableParam } from '@kiditem/shared/marketplace';
import {
  collectInvalidNodeTypes,
  isWorkflowCatalogSlimCoreCompatible,
} from '../../domain/policy/slim-core-allowlist';
import {
  MARKETPLACE_CATALOG_REPOSITORY_PORT,
  type MarketplaceCatalogRepositoryPort,
} from '../port/out/repository/marketplace-catalog.repository.port';
import type { MarketplaceRecord } from '../port/persistence-records';

function toCatalogItem(item: MarketplaceRecord, installed: boolean): MarketplaceCatalogItem {
  return {
    id: item.id,
    type: item.type as 'workflow' | 'agent',
    name: item.name,
    description: item.description,
    category: item.category,
    icon: item.icon,
    module: item.module,
    nodesJson: item.nodesJson,
    edgesJson: item.edgesJson,
    role: item.role,
    adapterType: item.adapterType,
    promptTemplate: item.promptTemplate,
    skills: item.skills,
    permissions: item.permissions as Record<string, unknown> | null,
    configurableParams: (item.configurableParams ?? []) as unknown as ConfigurableParam[],
    version: item.version,
    installCount: item.installCount,
    isPublished: item.isPublished,
    installed,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  } satisfies MarketplaceCatalogItem;
}

/**
 * Catalog read-side service for the Marketplace.
 *
 * Holds only listing / projection / single-item lookups. The
 * side-effecting install + uninstall paths live behind
 * `MarketplaceInstallService`. Both services live under the Automation
 * owner-domain because the marketplace catalog is consumed exclusively
 * by Automation surfaces (HTTP controller + install application service);
 * folding the read-side into Automation removes the table-shaped
 * `marketplace/` top-level module while preserving the
 * `/api/marketplace/*` route shape and slim-core allowlist behavior.
 *
 * Workflow listings join `WorkflowTemplate` to compute per-tenant
 * `installed` flags. Agent listings always return `installed: false`
 * because the legacy `AgentDefinition` table was retired and agent
 * install is no longer wired (see `MarketplaceInstallService`).
 */
@Injectable()
export class MarketplaceCatalogService {
  private readonly logger = new Logger(MarketplaceCatalogService.name);

  constructor(
    @Inject(MARKETPLACE_CATALOG_REPOSITORY_PORT)
    private readonly repository: MarketplaceCatalogRepositoryPort,
  ) {}

  // ─── Workflow Catalog ───

  async listWorkflows(
    organizationId: string,
    query: { module?: string; category?: string } = {},
  ): Promise<MarketplaceCatalogItem[]> {
    const { rows, installedIds } = await this.repository.fetchWorkflowCatalog(
      organizationId,
      query,
    );

    // Hide catalog entries that reference unregistered node types so they
    // never reach the install path. The seed is expected to stay slim-core
    // compatible; if a stale row appears in production we surface it via
    // logs instead of rendering an installable card that would fail.
    const visible: MarketplaceRecord[] = [];
    for (const item of rows) {
      const invalid = collectInvalidNodeTypes(item.nodesJson);
      if (invalid.length === 0) {
        visible.push(item);
        continue;
      }
      this.logger.warn(
        `Skipping marketplace workflow "${item.name}" (${item.id}) — unsupported node types: ${invalid.join(', ')}`,
      );
    }

    return visible.map((item) => toCatalogItem(item, installedIds.has(item.id)));
  }

  async getWorkflow(id: string): Promise<MarketplaceRecord | null> {
    const item = await this.repository.findWorkflowById(id);
    if (!item) return null;
    if (!isWorkflowCatalogSlimCoreCompatible(item)) {
      const invalid = collectInvalidNodeTypes(item.nodesJson);
      this.logger.warn(
        `Hiding marketplace workflow "${item.name}" (${item.id}) — unsupported node types: ${invalid.join(', ')}`,
      );
      return null;
    }
    return item;
  }

  // ─── Agent Catalog ───

  async listAgents(
    _organizationId: string,
    query: { role?: string; category?: string } = {},
  ): Promise<MarketplaceCatalogItem[]> {
    const items = await this.repository.fetchAgentCatalog(query);

    // Agent install path is not wired (legacy AgentDefinition retired).
    // Always report `installed: false`; install requests are rejected by
    // `MarketplaceAgentsController` until a real Agent OS catalog wiring lands.
    return items.map((item) => toCatalogItem(item, false));
  }

  getAgent(id: string): Promise<MarketplaceRecord | null> {
    return this.repository.findAgentById(id);
  }
}
