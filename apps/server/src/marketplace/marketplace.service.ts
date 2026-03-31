import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WORKFLOW_CATALOG, AGENT_CATALOG } from './seed-marketplace';

const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedCatalog();
  }

  private async seedCatalog() {
    // Seed workflow catalog
    for (const wf of WORKFLOW_CATALOG) {
      const existing = await this.prisma.workflowMarketplace.findFirst({
        where: { name: wf.name },
      });
      if (!existing) {
        await this.prisma.workflowMarketplace.create({ data: wf });
        this.logger.log(`Seeded workflow catalog: ${wf.name}`);
      }
    }

    // Seed agent catalog
    for (const ag of AGENT_CATALOG) {
      const existing = await this.prisma.agentMarketplace.findFirst({
        where: { name: ag.name },
      });
      if (!existing) {
        await this.prisma.agentMarketplace.create({ data: ag });
        this.logger.log(`Seeded agent catalog: ${ag.name}`);
      }
    }
  }

  // ─── Workflow Catalog ───────────────────────────────────────────────────────

  async listWorkflows(query: { module?: string; category?: string }) {
    return this.prisma.workflowMarketplace.findMany({
      where: {
        isPublished: true,
        ...(query.module && { module: query.module }),
        ...(query.category && { category: query.category }),
      },
      orderBy: { installCount: 'desc' },
    });
  }

  async getWorkflow(id: string) {
    return this.prisma.workflowMarketplace.findUnique({ where: { id } });
  }

  async installWorkflow(
    marketplaceId: string,
    companyId?: string,
    params?: Record<string, any>,
  ) {
    const catalog = await this.prisma.workflowMarketplace.findUnique({
      where: { id: marketplaceId },
    });
    if (!catalog) throw new NotFoundException('Workflow catalog item not found');

    // Apply param overrides to nodesJson
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
        companyId: companyId || DEFAULT_COMPANY_ID,
        name: catalog.name,
        description: catalog.description,
        module: catalog.module,
        isActive: true,
        triggerType: 'scheduled',
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

  // ─── Agent Catalog ──────────────────────────────────────────────────────────

  async listAgents(query: { role?: string; category?: string }) {
    return this.prisma.agentMarketplace.findMany({
      where: {
        isPublished: true,
        ...(query.role && { role: query.role }),
        ...(query.category && { category: query.category }),
      },
      orderBy: { installCount: 'desc' },
    });
  }

  async getAgent(id: string) {
    return this.prisma.agentMarketplace.findUnique({ where: { id } });
  }

  async installAgent(
    marketplaceId: string,
    companyId?: string,
    params?: Record<string, any>,
  ) {
    const catalog = await this.prisma.agentMarketplace.findUnique({
      where: { id: marketplaceId },
    });
    if (!catalog) throw new NotFoundException('Agent catalog item not found');

    // Build agent definition data
    const data: any = {
      companyId: companyId || DEFAULT_COMPANY_ID,
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

    // Apply param overrides
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
}
