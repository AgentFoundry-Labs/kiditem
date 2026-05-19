import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  CreateWorkflowInstallationInput,
  MarketplaceInstallStorePort,
} from '../../../application/port/out/repository/marketplace-install-store.port';

function jsonArrayInput(value: unknown): Prisma.InputJsonValue {
  return (value ?? []) as Prisma.InputJsonValue;
}

/**
 * Prisma out-adapter for the Marketplace install use cases. The
 * application service decides what to install; this adapter owns the
 * persistence mechanics, transactions, and tenant-scoped mutations.
 *
 * Agent install is intentionally absent. Shipped Agent OS definitions are
 * code-owned/global, not tenant-clonable rows. Marketplace `type='agent'`
 * rows are read-only listings; install is not wired and the controller
 * rejects it.
 */
@Injectable()
export class MarketplaceInstallStoreRepositoryAdapter
  implements MarketplaceInstallStorePort
{
  constructor(private readonly prisma: PrismaService) {}

  async findWorkflowCatalog(marketplaceId: string) {
    return this.prisma.marketplace.findFirst({
      where: { id: marketplaceId, type: 'workflow' },
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

  async decrementInstallCountIfPositive(marketplaceId: string): Promise<void> {
    await this.prisma.marketplace.updateMany({
      where: { id: marketplaceId, installCount: { gt: 0 } },
      data: { installCount: { decrement: 1 } },
    });
  }
}
