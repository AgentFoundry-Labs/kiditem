import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { collectInvalidNodeTypes } from '../../../marketplace/workflow-slim-core';

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
 * Catalog read/list (`MarketplaceService` in `marketplace/`) intentionally
 * stays out of this service: it has no runtime side effects and does not
 * benefit from sitting behind an application boundary.
 *
 * Tenant scope:
 * - All writes bind `companyId` from the trusted `@CurrentCompany()`
 *   value the controller passes in. Catalog rows themselves are global
 *   (companyId-less); the slot of "owns this install" is recorded by
 *   the cloned `WorkflowTemplate.companyId` / `AgentDefinition.companyId`.
 * - Uninstall reads the tenant's installed row by `(marketplaceId,
 *   companyId)` before delete so a foreign-tenant id cannot be used to
 *   remove another company's installation.
 */
@Injectable()
export class MarketplaceInstallService {
  private readonly logger = new Logger(MarketplaceInstallService.name);

  constructor(private readonly prisma: PrismaService) {}

  async installWorkflow(
    marketplaceId: string,
    companyId: string,
    params?: Record<string, any>,
  ) {
    const catalog = await this.prisma.marketplace.findFirst({
      where: { id: marketplaceId, type: 'workflow' },
    });
    if (!catalog || catalog.type !== 'workflow') {
      throw new NotFoundException('Workflow catalog item not found');
    }

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

  async installAgent(
    marketplaceId: string,
    companyId: string,
    params?: Record<string, any>,
  ) {
    const catalog = await this.prisma.marketplace.findFirst({
      where: { id: marketplaceId, type: 'agent' },
    });
    if (!catalog || catalog.type !== 'agent') {
      throw new NotFoundException('Agent catalog item not found');
    }

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
      if (params.monthlyTokenBudget !== undefined) {
        data.monthlyTokenBudget = params.monthlyTokenBudget;
      }
      if (params.requiresApproval !== undefined) {
        data.requiresApproval = params.requiresApproval;
      }
      if (params.timeoutSeconds !== undefined) {
        data.timeoutSeconds = params.timeoutSeconds;
      }
    }

    const agent = await this.prisma.agentDefinition.create({ data });

    // Specialists report to a manager in the same company when one exists.
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

  async uninstallWorkflow(
    marketplaceId: string,
    companyId: string,
  ): Promise<{ ok: boolean }> {
    const installed = await this.prisma.workflowTemplate.findFirst({
      where: { marketplaceId, companyId },
    });
    if (!installed) {
      throw new NotFoundException('설치된 워크플로우를 찾을 수 없습니다');
    }

    await this.prisma.workflowTemplate.delete({ where: { id: installed.id } });

    const catalog = await this.prisma.marketplace.findFirst({
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

  async uninstallAgent(
    marketplaceId: string,
    companyId: string,
  ): Promise<{ ok: boolean }> {
    const installed = await this.prisma.agentDefinition.findFirst({
      where: { marketplaceId, companyId },
    });
    if (!installed) {
      throw new NotFoundException('설치된 에이전트를 찾을 수 없습니다');
    }

    await this.prisma.agentDefinition.delete({ where: { id: installed.id } });

    const catalog = await this.prisma.marketplace.findFirst({
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
