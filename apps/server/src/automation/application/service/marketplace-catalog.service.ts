import { Injectable, Logger } from '@nestjs/common';
import type { Marketplace } from '@prisma/client';
import type { MarketplaceCatalogItem, ConfigurableParam } from '@kiditem/shared/marketplace';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  collectInvalidNodeTypes,
  isWorkflowCatalogSlimCoreCompatible,
} from '../../adapter/out/workflow-runner/executors/slim-core-allowlist';

function toCatalogItem(item: Marketplace, installed: boolean): MarketplaceCatalogItem {
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
 */
@Injectable()
export class MarketplaceCatalogService {
  private readonly logger = new Logger(MarketplaceCatalogService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Workflow Catalog ───

  async listWorkflows(
    organizationId: string,
    query: { module?: string; category?: string } = {},
  ): Promise<MarketplaceCatalogItem[]> {
    const items = await this.prisma.marketplace.findMany({
      where: {
        type: 'workflow',
        isPublished: true,
        ...(query.module && { module: query.module }),
        ...(query.category && { category: query.category }),
      },
      orderBy: { installCount: 'desc' },
    });

    const installed = await this.prisma.workflowTemplate.findMany({
      where: { organizationId, marketplaceId: { not: null } },
      select: { marketplaceId: true },
    });
    const installedSet = new Set(installed.map((i) => i.marketplaceId));

    // Hide catalog entries that reference unregistered node types so they
    // never reach the install path. The seed is expected to stay slim-core
    // compatible; if a stale row appears in production we surface it via
    // logs instead of rendering an installable card that would fail.
    const visible: Marketplace[] = [];
    for (const item of items) {
      const invalid = collectInvalidNodeTypes(item.nodesJson);
      if (invalid.length === 0) {
        visible.push(item);
        continue;
      }
      this.logger.warn(
        `Skipping marketplace workflow "${item.name}" (${item.id}) — unsupported node types: ${invalid.join(', ')}`,
      );
    }

    return visible.map((item) => toCatalogItem(item, installedSet.has(item.id)));
  }

  async getWorkflow(id: string) {
    const item = await this.prisma.marketplace.findFirst({
      where: { id, type: 'workflow' },
    });
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
    organizationId: string,
    query: { role?: string; category?: string } = {},
  ): Promise<MarketplaceCatalogItem[]> {
    const items = await this.prisma.marketplace.findMany({
      where: {
        type: 'agent',
        isPublished: true,
        ...(query.role && { role: query.role }),
        ...(query.category && { category: query.category }),
      },
      orderBy: { installCount: 'desc' },
    });

    const installed = await this.prisma.agentDefinition.findMany({
      where: { organizationId, marketplaceId: { not: null } },
      select: { marketplaceId: true },
    });
    const installedSet = new Set(installed.map((i) => i.marketplaceId));

    return items.map((item) => toCatalogItem(item, installedSet.has(item.id)));
  }

  async getAgent(id: string) {
    return this.prisma.marketplace.findFirst({
      where: { id, type: 'agent' },
    });
  }
}
