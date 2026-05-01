import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  CreateAgentInstallationInput,
  CreateWorkflowInstallationInput,
  MarketplaceInstallStorePort,
} from '../../../application/port/out/marketplace-install-store.port';

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

function jsonArrayInput(value: unknown): Prisma.InputJsonValue {
  return (value ?? []) as Prisma.InputJsonValue;
}

/**
 * Prisma out-adapter for the Marketplace install use cases. The
 * application service decides what to install; this adapter owns the
 * persistence mechanics, transactions, and tenant-scoped mutations.
 */
@Injectable()
export class PrismaMarketplaceInstallStoreAdapter
  implements MarketplaceInstallStorePort
{
  constructor(private readonly prisma: PrismaService) {}

  async findWorkflowCatalog(marketplaceId: string) {
    return this.prisma.marketplace.findFirst({
      where: { id: marketplaceId, type: 'workflow' },
    });
  }

  async findAgentCatalog(marketplaceId: string) {
    return this.prisma.marketplace.findFirst({
      where: { id: marketplaceId, type: 'agent' },
    });
  }

  async createWorkflowInstallation(input: CreateWorkflowInstallationInput) {
    const [template] = await this.prisma.$transaction([
      this.prisma.workflowTemplate.create({
        data: {
          organizationId: input.organizationId,
          name: input.name,
          description: input.description,
          module: input.module,
          isActive: input.isActive,
          triggerType: input.triggerType,
          schedule: input.schedule,
          nodesJson: jsonArrayInput(input.nodesJson),
          edgesJson: jsonArrayInput(input.edgesJson),
          marketplaceId: input.marketplaceId,
        },
      }),
      this.prisma.marketplace.update({
        where: { id: input.marketplaceId },
        data: { installCount: { increment: 1 } },
      }),
    ]);
    return template;
  }

  async createAgentInstallation(input: CreateAgentInstallationInput) {
    const [agent] = await this.prisma.$transaction([
      this.prisma.agentDefinition.create({
        data: {
          organizationId: input.organizationId,
          name: input.name,
          type: input.type,
          description: input.description,
          adapterType: input.adapterType,
          adapterConfig: jsonInput(input.adapterConfig),
          role: input.role,
          title: input.title,
          icon: input.icon,
          skills: input.skills,
          permissions: jsonInput(input.permissions),
          promptTemplate: input.promptTemplate,
          allowedTools: input.allowedTools,
          permissionMode: input.permissionMode,
          marketplaceId: input.marketplaceId,
          isActive: input.isActive,
          schedule: input.schedule,
          monthlyTokenBudget: input.monthlyTokenBudget,
          requiresApproval: input.requiresApproval,
          timeoutSeconds: input.timeoutSeconds,
        },
      }),
      this.prisma.marketplace.update({
        where: { id: input.marketplaceId },
        data: { installCount: { increment: 1 } },
      }),
    ]);
    return agent;
  }

  async findTenantManager(organizationId: string) {
    return this.prisma.agentDefinition.findFirst({
      where: { organizationId, role: 'manager' },
      select: { id: true },
    });
  }

  async assignAgentReportsTo(
    agentId: string,
    organizationId: string,
    managerId: string,
  ) {
    await this.prisma.agentDefinition.updateMany({
      where: { id: agentId, organizationId },
      data: { reportsTo: managerId },
    });
  }

  async findInstalledWorkflow(marketplaceId: string, organizationId: string) {
    return this.prisma.workflowTemplate.findFirst({
      where: { marketplaceId, organizationId },
      select: { id: true },
    });
  }

  async deleteInstalledWorkflow(
    templateId: string,
    organizationId: string,
  ): Promise<boolean> {
    const result = await this.prisma.workflowTemplate.deleteMany({
      where: { id: templateId, organizationId },
    });
    return result.count > 0;
  }

  async findInstalledAgent(marketplaceId: string, organizationId: string) {
    return this.prisma.agentDefinition.findFirst({
      where: { marketplaceId, organizationId },
      select: { id: true, role: true },
    });
  }

  async deleteInstalledAgent(agentId: string, organizationId: string): Promise<boolean> {
    const result = await this.prisma.agentDefinition.deleteMany({
      where: { id: agentId, organizationId },
    });
    return result.count > 0;
  }

  async decrementInstallCountIfPositive(marketplaceId: string): Promise<void> {
    await this.prisma.marketplace.updateMany({
      where: { id: marketplaceId, installCount: { gt: 0 } },
      data: { installCount: { decrement: 1 } },
    });
  }
}
