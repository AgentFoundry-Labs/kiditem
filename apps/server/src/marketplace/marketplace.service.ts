import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Marketplace } from '@prisma/client';
import type { MarketplaceCatalogItem, ConfigurableParam } from '@kiditem/shared/marketplace';
import { PrismaService } from '../prisma/prisma.service';

// Allowed workflow node types — must match the slim-core executor surface in
// `apps/server/src/workflows/executors/builtin.ts`. Catalog entries that
// reference any other node type are removed from listings and rejected at
// install time. Generic DB/HTTP/transform executors are intentionally absent;
// AI/LLM work is delegated through `agent_task.create` only. Domain-specific
// executors (e.g. coupang.orders.fetch) must be registered in builtin.ts
// before being added here.
const ALLOWED_WORKFLOW_NODE_TYPES: ReadonlySet<string> = new Set([
  'trigger.manual',
  'trigger.schedule',
  'condition.evaluate',
  'notification.alert',
  'agent_task.create',
]);

function collectInvalidNodeTypes(nodesJson: unknown): string[] {
  if (!Array.isArray(nodesJson)) return ['<missing nodesJson>'];
  const invalid: string[] = [];
  for (const node of nodesJson) {
    const type = (node as { type?: unknown })?.type;
    if (typeof type !== 'string' || !ALLOWED_WORKFLOW_NODE_TYPES.has(type)) {
      invalid.push(typeof type === 'string' ? type : '<missing type>');
    }
  }
  return [...new Set(invalid)];
}

function isWorkflowCatalogSlimCoreCompatible(item: Marketplace): boolean {
  return collectInvalidNodeTypes(item.nodesJson).length === 0;
}

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

@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Workflow Catalog ───

  async listWorkflows(
    companyId: string,
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
      where: { companyId, marketplaceId: { not: null } },
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
    const item = await this.prisma.marketplace.findUnique({ where: { id, type: 'workflow' } });
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

  async installWorkflow(
    marketplaceId: string,
    companyId: string,
    params?: Record<string, any>,
  ) {
    const catalog = await this.prisma.marketplace.findUnique({
      where: { id: marketplaceId },
    });
    if (!catalog || catalog.type !== 'workflow') throw new NotFoundException('Workflow catalog item not found');

    const invalidNodeTypes = collectInvalidNodeTypes(catalog.nodesJson);
    if (invalidNodeTypes.length > 0) {
      throw new BadRequestException(
        `Workflow catalog "${catalog.name}" uses unsupported node types: ${invalidNodeTypes.join(', ')}`,
      );
    }

    let nodesJson = catalog.nodesJson as any[];
    if (params && Array.isArray(catalog.configurableParams)) {
      const configurableParams = catalog.configurableParams as any[];
      for (const cp of configurableParams) {
        if (params[cp.key] !== undefined && cp.nodeId) {
          nodesJson = nodesJson.map((node) =>
            node.id === cp.nodeId
              ? { ...node, config: { ...node.config, [cp.key]: params[cp.key] } }
              : node,
          );
        }
      }
    }

    const template = await this.prisma.workflowTemplate.create({
      data: {
        companyId,
        name: catalog.name,
        description: catalog.description,
        module: catalog.module ?? 'order',
        isActive: true,
        triggerType: params?.schedule ? 'scheduled' : 'manual',
        schedule: params?.schedule ?? null,
        nodesJson,
        edgesJson: catalog.edgesJson as any,
        marketplaceId,
      },
    });

    await this.prisma.marketplace.update({
      where: { id: marketplaceId },
      data: { installCount: { increment: 1 } },
    });

    return template;
  }

  // ─── Agent Catalog ───

  async listAgents(
    companyId: string,
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
      where: { companyId, marketplaceId: { not: null } },
      select: { marketplaceId: true },
    });
    const installedSet = new Set(installed.map((i) => i.marketplaceId));

    return items.map((item) => toCatalogItem(item, installedSet.has(item.id)));
  }

  async getAgent(id: string) {
    return this.prisma.marketplace.findUnique({ where: { id, type: 'agent' } });
  }

  async installAgent(
    marketplaceId: string,
    companyId: string,
    params?: Record<string, any>,
  ) {
    const catalog = await this.prisma.marketplace.findUnique({
      where: { id: marketplaceId },
    });
    if (!catalog || catalog.type !== 'agent') throw new NotFoundException('Agent catalog item not found');

    const data: any = {
      companyId,
      name: catalog.name,
      type: `${catalog.name.replace(/\s/g, '_').toLowerCase()}_${Date.now()}`,
      description: catalog.description,
      adapterType: catalog.adapterType ?? 'claude_local',
      adapterConfig: { command: 'claude' },
      role: catalog.role ?? 'specialist',
      title: catalog.name,
      icon: catalog.icon,
      skills: catalog.skills,
      permissions: catalog.permissions as any,
      promptTemplate: catalog.promptTemplate ?? '',
      allowedTools: 'Bash(psql:*) Read Grep',
      permissionMode: 'bypassPermissions',
      marketplaceId,
      isActive: true,
    };

    if (params) {
      if (params.schedule !== undefined) data.schedule = params.schedule;
      if (params.monthlyTokenBudget !== undefined) data.monthlyTokenBudget = params.monthlyTokenBudget;
      if (params.requiresApproval !== undefined) data.requiresApproval = params.requiresApproval;
      if (params.timeoutSeconds !== undefined) data.timeoutSeconds = params.timeoutSeconds;
    }

    const agent = await this.prisma.agentDefinition.create({ data });

    // Auto reports_to: specialists report to a manager in the same company
    if (agent.role === 'specialist') {
      const manager = await this.prisma.agentDefinition.findFirst({
        where: { companyId, role: 'manager' },
      });
      if (manager) {
        await this.prisma.agentDefinition.update({
          where: { id: agent.id },
          data: { reportsTo: manager.id },
        });
      }
    }

    await this.prisma.marketplace.update({
      where: { id: marketplaceId },
      data: { installCount: { increment: 1 } },
    });

    return agent;
  }

  // ─── Uninstall ───

  async uninstallWorkflow(marketplaceId: string, companyId: string): Promise<{ ok: boolean }> {
    const installed = await this.prisma.workflowTemplate.findFirst({
      where: { marketplaceId, companyId },
    });
    if (!installed) throw new NotFoundException('설치된 워크플로우를 찾을 수 없습니다');

    await this.prisma.workflowTemplate.delete({ where: { id: installed.id } });

    const catalog = await this.prisma.marketplace.findUnique({
      where: { id: marketplaceId },
    });
    if (catalog && catalog.installCount > 0) {
      await this.prisma.marketplace.update({
        where: { id: marketplaceId },
        data: { installCount: { decrement: 1 } },
      });
    }

    return { ok: true };
  }

  async uninstallAgent(marketplaceId: string, companyId: string): Promise<{ ok: boolean }> {
    const installed = await this.prisma.agentDefinition.findFirst({
      where: { marketplaceId, companyId },
    });
    if (!installed) throw new NotFoundException('설치된 에이전트를 찾을 수 없습니다');

    await this.prisma.agentDefinition.delete({ where: { id: installed.id } });

    const catalog = await this.prisma.marketplace.findUnique({
      where: { id: marketplaceId },
    });
    if (catalog && catalog.installCount > 0) {
      await this.prisma.marketplace.update({
        where: { id: marketplaceId },
        data: { installCount: { decrement: 1 } },
      });
    }

    return { ok: true };
  }
}
