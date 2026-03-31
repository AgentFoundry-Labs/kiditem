import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Workflow Catalog ───

  async listWorkflows(query: { module?: string; category?: string; companyId?: string }) {
    const items = await this.prisma.workflowMarketplace.findMany({
      where: {
        isPublished: true,
        ...(query.module && { module: query.module }),
        ...(query.category && { category: query.category }),
      },
      orderBy: { installCount: 'desc' },
    });

    if (!query.companyId) {
      return items.map((i) => ({ ...i, installed: false }));
    }

    const installed = await this.prisma.workflowTemplate.findMany({
      where: { companyId: query.companyId, marketplaceId: { not: null } },
      select: { marketplaceId: true },
    });
    const installedSet = new Set(installed.map((i) => i.marketplaceId));

    return items.map((item) => ({ ...item, installed: installedSet.has(item.id) }));
  }

  async getWorkflow(id: string) {
    return this.prisma.workflowMarketplace.findUnique({ where: { id } });
  }

  async installWorkflow(
    marketplaceId: string,
    companyId: string | undefined,
    params?: Record<string, any>,
  ) {
    if (!companyId) throw new BadRequestException('companyId is required');
    const catalog = await this.prisma.workflowMarketplace.findUnique({
      where: { id: marketplaceId },
    });
    if (!catalog) throw new NotFoundException('Workflow catalog item not found');

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
        module: catalog.module,
        isActive: true,
        triggerType: params?.schedule ? 'scheduled' : 'manual',
        schedule: params?.schedule ?? null,
        nodesJson,
        edgesJson: catalog.edgesJson as any,
        marketplaceId,
      },
    });

    await this.prisma.workflowMarketplace.update({
      where: { id: marketplaceId },
      data: { installCount: { increment: 1 } },
    });

    return template;
  }

  // ─── Agent Catalog ───

  async listAgents(query: { role?: string; category?: string; companyId?: string }) {
    const items = await this.prisma.agentMarketplace.findMany({
      where: {
        isPublished: true,
        ...(query.role && { role: query.role }),
        ...(query.category && { category: query.category }),
      },
      orderBy: { installCount: 'desc' },
    });

    if (!query.companyId) {
      return items.map((i) => ({ ...i, installed: false }));
    }

    const installed = await this.prisma.agentDefinition.findMany({
      where: { companyId: query.companyId, marketplaceId: { not: null } },
      select: { marketplaceId: true },
    });
    const installedSet = new Set(installed.map((i) => i.marketplaceId));

    return items.map((item) => ({ ...item, installed: installedSet.has(item.id) }));
  }

  async getAgent(id: string) {
    return this.prisma.agentMarketplace.findUnique({ where: { id } });
  }

  async installAgent(
    marketplaceId: string,
    companyId: string | undefined,
    params?: Record<string, any>,
  ) {
    if (!companyId) throw new BadRequestException('companyId is required');
    const catalog = await this.prisma.agentMarketplace.findUnique({
      where: { id: marketplaceId },
    });
    if (!catalog) throw new NotFoundException('Agent catalog item not found');

    const data: any = {
      companyId,
      name: catalog.name,
      type: `${catalog.name.replace(/\s/g, '_').toLowerCase()}_${Date.now()}`,
      description: catalog.description,
      adapterType: catalog.adapterType,
      adapterConfig: { command: 'claude' },
      role: catalog.role,
      title: catalog.name,
      icon: catalog.icon,
      skills: catalog.skills,
      permissions: catalog.permissions as any,
      promptTemplate: catalog.promptTemplate,
      allowedTools: 'Bash(psql:*) Bash(curl:*) Read',
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

    await this.prisma.agentMarketplace.update({
      where: { id: marketplaceId },
      data: { installCount: { increment: 1 } },
    });

    return agent;
  }

  // ─── Uninstall ───

  async uninstallWorkflow(marketplaceId: string, companyId: string) {
    const installed = await this.prisma.workflowTemplate.findFirst({
      where: { marketplaceId, companyId },
    });
    if (!installed) throw new NotFoundException('설치된 워크플로우를 찾을 수 없습니다');

    await this.prisma.workflowTemplate.delete({ where: { id: installed.id } });

    const catalog = await this.prisma.workflowMarketplace.findUnique({
      where: { id: marketplaceId },
    });
    if (catalog && catalog.installCount > 0) {
      await this.prisma.workflowMarketplace.update({
        where: { id: marketplaceId },
        data: { installCount: { decrement: 1 } },
      });
    }

    return { ok: true };
  }

  async uninstallAgent(marketplaceId: string, companyId: string) {
    const installed = await this.prisma.agentDefinition.findFirst({
      where: { marketplaceId, companyId },
    });
    if (!installed) throw new NotFoundException('설치된 에이전트를 찾을 수 없습니다');

    await this.prisma.agentDefinition.delete({ where: { id: installed.id } });

    const catalog = await this.prisma.agentMarketplace.findUnique({
      where: { id: marketplaceId },
    });
    if (catalog && catalog.installCount > 0) {
      await this.prisma.agentMarketplace.update({
        where: { id: marketplaceId },
        data: { installCount: { decrement: 1 } },
      });
    }

    return { ok: true };
  }
}
