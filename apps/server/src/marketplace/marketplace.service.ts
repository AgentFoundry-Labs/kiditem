import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  agentCategory,
  workflowCategory,
  defaultAgentParams,
  defaultWorkflowParams,
} from './seed-marketplace';

@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.syncFromDb();
  }

  /**
   * 기존 DB의 agent_definitions / workflow_templates에서
   * 마켓플레이스 카탈로그를 자동 생성한다.
   * marketplaceId가 없는 기존 레코드 → 마켓플레이스 항목으로 등록.
   */
  private async syncFromDb() {
    // 에이전트: marketplaceId가 없는 기존 정의 → 마켓플레이스로 등록
    const agents = await this.prisma.agentDefinition.findMany({
      where: { marketplaceId: null },
    });

    for (const agent of agents) {
      const existing = await this.prisma.agentMarketplace.findFirst({
        where: { name: agent.name },
      });
      if (existing) {
        // 이미 마켓플레이스에 있으면 FK만 연결
        await this.prisma.agentDefinition.update({
          where: { id: agent.id },
          data: { marketplaceId: existing.id },
        });
        continue;
      }

      const catalog = await this.prisma.agentMarketplace.create({
        data: {
          name: agent.name,
          description: agent.description ?? '',
          role: agent.role,
          category: agentCategory(agent.type),
          icon: agent.icon,
          adapterType: agent.adapterType,
          promptTemplate: agent.promptTemplate,
          skills: agent.skills,
          permissions: agent.permissions as any,
          configurableParams: defaultAgentParams(),
          installCount: 1,
        },
      });

      await this.prisma.agentDefinition.update({
        where: { id: agent.id },
        data: { marketplaceId: catalog.id },
      });

      this.logger.log(`Synced agent to marketplace: ${agent.name}`);
    }

    // 워크플로우: marketplaceId가 없는 기존 템플릿 → 마켓플레이스로 등록
    const workflows = await this.prisma.workflowTemplate.findMany({
      where: { marketplaceId: null },
    });

    for (const wf of workflows) {
      const existing = await this.prisma.workflowMarketplace.findFirst({
        where: { name: wf.name },
      });
      if (existing) {
        await this.prisma.workflowTemplate.update({
          where: { id: wf.id },
          data: { marketplaceId: existing.id },
        });
        continue;
      }

      const catalog = await this.prisma.workflowMarketplace.create({
        data: {
          name: wf.name,
          description: wf.description,
          module: wf.module,
          category: workflowCategory(wf.module),
          nodesJson: wf.nodesJson as any,
          edgesJson: wf.edgesJson as any,
          configurableParams: defaultWorkflowParams(),
          installCount: 1,
        },
      });

      await this.prisma.workflowTemplate.update({
        where: { id: wf.id },
        data: { marketplaceId: catalog.id },
      });

      this.logger.log(`Synced workflow to marketplace: ${wf.name}`);
    }
  }

  // ─── Workflow Catalog ───

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
    companyId: string,
    params?: Record<string, any>,
  ) {
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
    companyId: string,
    params?: Record<string, any>,
  ) {
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
}
